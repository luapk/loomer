/**
 * Loomer — Storyboard Parser
 *
 * Takes storyboard markdown (output of the storyboard skill) and produces
 * a validated ParsedStoryboard JSON object via Claude with structured
 * outputs (tool use).
 *
 * Architecture:
 *   1. Convert ParsedStoryboardSchema (Zod) → JSON Schema for the tool definition.
 *   2. Send: system prompt + user message (markdown) + tool definition.
 *   3. Force tool use via tool_choice: { type: "tool", name: "parse_storyboard" }.
 *   4. Extract the tool input from the response.
 *   5. Validate against the Zod schema (defensive — Anthropic's strict mode
 *      should already enforce this, but Zod gives us better error messages
 *      and catches refinement-level rules like "veo duration must be 4/6/8").
 *   6. Run cross-reference integrity checks (every shot ID resolves to a
 *      Bible entity, etc.) and return a result with warnings.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  ParsedStoryboardSchema,
  type ParsedStoryboard,
} from '../schema/storyboard.js';
import { PARSER_SYSTEM_PROMPT } from '../prompts/parser-system.js';

// ============================================================================
// Types
// ============================================================================

export interface ParseResult {
  success: boolean;
  storyboard: ParsedStoryboard | null;
  warnings: string[];
  errors: string[];
  /** Raw tool input from Claude, before Zod validation. Useful for debugging. */
  raw_extraction: unknown;
  /** Token usage and timing for cost tracking. */
  usage: {
    input_tokens: number;
    output_tokens: number;
    /** Approximate cost in USD at current Sonnet 4.5 pricing ($3/M input, $15/M output). */
    estimated_cost_usd: number;
    duration_ms: number;
  };
}

export interface ParseOptions {
  /** Anthropic API key. Defaults to process.env.ANTHROPIC_API_KEY. */
  apiKey?: string;
  /** Model to use. Defaults to claude-sonnet-4-5-20250929. */
  model?: string;
  /** Max output tokens. Defaults to 16000 (a full storyboard fits comfortably). */
  maxTokens?: number;
  /** Whether to log progress to stdout. Defaults to false. */
  verbose?: boolean;
}

// ============================================================================
// Parser
// ============================================================================

const TOOL_NAME = 'parse_storyboard';

const TOOL_DESCRIPTION =
  'Extract structured data from a storyboard markdown document. Always call this tool with the full extraction as input. Do not respond in prose.';

/**
 * Parse a storyboard markdown document into a validated ParsedStoryboard.
 */
export async function parseStoryboard(
  markdown: string,
  options: ParseOptions = {},
): Promise<ParseResult> {
  const startTime = Date.now();

  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return failResult('ANTHROPIC_API_KEY not set', startTime);
  }

  const model = options.model ?? 'claude-sonnet-4-5-20250929';
  const maxTokens = options.maxTokens ?? 16000;
  const verbose = options.verbose ?? false;

  const client = new Anthropic({ apiKey });

  // Convert Zod schema to JSON Schema for the tool definition.
  // The `target: 'openApi3'` mode produces JSON Schema compatible with
  // Anthropic's tool input_schema format.
  const inputSchema = zodToJsonSchema(ParsedStoryboardSchema, {
    target: 'openApi3',
    $refStrategy: 'none', // Inline all refs — Anthropic's tool schema works best flat.
  });

  if (verbose) {
    console.log(`[parser] Calling ${model} with ${markdown.length} chars of markdown`);
  }

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: PARSER_SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: TOOL_DESCRIPTION,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input_schema: inputSchema as any,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: markdown,
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failResult(`Anthropic API error: ${message}`, startTime);
  }

  // Extract the tool_use block. Because we forced tool_choice, this should
  // always be present; if it isn't, something's gone wrong upstream.
  const toolUseBlock = response.content.find(
    (block) => block.type === 'tool_use' && block.name === TOOL_NAME,
  );

  if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
    return failResult(
      `No tool_use block in response (model returned: ${JSON.stringify(response.content).slice(0, 200)})`,
      startTime,
      response,
    );
  }

  const rawExtraction = toolUseBlock.input;

  // Validate against Zod schema. This catches refinement-level errors that
  // the JSON Schema layer can't enforce (e.g., "veo duration must be 4/6/8").
  const parseResult = ParsedStoryboardSchema.safeParse(rawExtraction);

  if (!parseResult.success) {
    const errorMessages = parseResult.error.errors.map(
      (e) => `${e.path.join('.')}: ${e.message}`,
    );
    return {
      success: false,
      storyboard: null,
      warnings: [],
      errors: ['Schema validation failed:', ...errorMessages],
      raw_extraction: rawExtraction,
      usage: makeUsage(response, startTime),
    };
  }

  const storyboard = parseResult.data;

  // Run integrity checks. These produce warnings rather than errors —
  // a storyboard with issues should still parse, but we want to surface
  // problems for the user to review.
  const warnings = runIntegrityChecks(storyboard);

  if (verbose) {
    console.log(
      `[parser] Parsed ${storyboard.total_shots} shots, ` +
        `${storyboard.characters.length} characters, ` +
        `${storyboard.locations.length} locations, ` +
        `${storyboard.props.length} props in ${Date.now() - startTime}ms`,
    );
    if (warnings.length > 0) {
      console.log(`[parser] ${warnings.length} integrity warnings:`);
      warnings.forEach((w) => console.log(`  - ${w}`));
    }
  }

  return {
    success: true,
    storyboard,
    warnings,
    errors: [],
    raw_extraction: rawExtraction,
    usage: makeUsage(response, startTime),
  };
}

// ============================================================================
// Integrity checks
// ============================================================================

/**
 * Run cross-reference integrity checks on a parsed storyboard.
 * Returns a list of warnings (non-fatal) for the user to review.
 *
 * These catch the most common parser failures: missing Bible entities
 * referenced in shots, duration math that doesn't add up, missing audio,
 * etc. They're not fatal — a storyboard with warnings is still usable —
 * but they give the UI something to flag for human review.
 */
function runIntegrityChecks(sb: ParsedStoryboard): string[] {
  const warnings: string[] = [];

  // Build lookup sets for cross-references
  const charIds = new Set(sb.characters.map((c) => c.id));
  const locIds = new Set(sb.locations.map((l) => l.id));
  const propIds = new Set(sb.props.map((p) => p.id));

  // Check 1: total_shots matches actual shot count
  if (sb.total_shots !== sb.shots.length) {
    warnings.push(
      `total_shots header says ${sb.total_shots} but ${sb.shots.length} shots were extracted`,
    );
  }

  // Check 2: shot numbering is sequential from 1
  for (let i = 0; i < sb.shots.length; i++) {
    const shot = sb.shots[i];
    if (shot && shot.shot_number !== i + 1) {
      warnings.push(
        `Shot at index ${i} has shot_number ${shot.shot_number}, expected ${i + 1}`,
      );
    }
  }

  // Check 3: every shot's continuity references resolve to Bible entities
  for (const shot of sb.shots) {
    for (const charId of shot.continuity.characters) {
      if (!charIds.has(charId)) {
        warnings.push(
          `Shot ${shot.shot_number} references unknown character ${charId} (no Bible entry)`,
        );
      }
    }
    if (!locIds.has(shot.continuity.location_id)) {
      warnings.push(
        `Shot ${shot.shot_number} references unknown location ${shot.continuity.location_id}`,
      );
    }
    for (const propId of [
      ...shot.continuity.props_persisting,
      ...shot.continuity.props_introduced,
    ]) {
      if (!propIds.has(propId)) {
        warnings.push(
          `Shot ${shot.shot_number} references unknown prop ${propId}`,
        );
      }
    }
  }

  // Check 4: every Bible entity is used in at least one shot
  // (an unused Bible entity is dead weight; usually a parser miss)
  const usedChars = new Set<string>();
  const usedLocs = new Set<string>();
  const usedProps = new Set<string>();
  for (const shot of sb.shots) {
    shot.continuity.characters.forEach((id) => usedChars.add(id));
    usedLocs.add(shot.continuity.location_id);
    [...shot.continuity.props_persisting, ...shot.continuity.props_introduced].forEach(
      (id) => usedProps.add(id),
    );
  }
  for (const char of sb.characters) {
    if (!usedChars.has(char.id)) {
      warnings.push(
        `Character ${char.id} (${char.name}) has a Bible entry but appears in no shot`,
      );
    }
  }
  for (const loc of sb.locations) {
    if (!usedLocs.has(loc.id)) {
      warnings.push(
        `Location ${loc.id} (${loc.name}) has a Bible entry but appears in no shot`,
      );
    }
  }
  for (const prop of sb.props) {
    if (!usedProps.has(prop.id)) {
      warnings.push(
        `Prop ${prop.id} (${prop.name}) has a Bible entry but appears in no shot`,
      );
    }
  }

  // Check 5: total Veo duration roughly matches stated duration_seconds
  // (within ±20% tolerance — there's edit overhead and pacing)
  const totalVeoDuration = sb.shots.reduce((sum, shot) => sum + shot.duration.veo, 0);
  const tolerance = sb.duration_seconds * 0.2;
  if (Math.abs(totalVeoDuration - sb.duration_seconds) > tolerance) {
    warnings.push(
      `Stated duration ${sb.duration_seconds}s but sum of Veo shot durations is ${totalVeoDuration}s ` +
        `(>20% mismatch)`,
    );
  }

  // Check 6: every prompt is non-trivially long
  // (a 50-char prompt is almost certainly a parser miss)
  for (const shot of sb.shots) {
    if (shot.veo_prompt.length < 100) {
      warnings.push(`Shot ${shot.shot_number} has suspiciously short Veo prompt (${shot.veo_prompt.length} chars)`);
    }
    if (shot.kling_prompt.length < 100) {
      warnings.push(`Shot ${shot.shot_number} has suspiciously short Kling prompt (${shot.kling_prompt.length} chars)`);
    }
    if (shot.key_frame_prompt.length < 50) {
      warnings.push(`Shot ${shot.shot_number} has suspiciously short key frame prompt (${shot.key_frame_prompt.length} chars)`);
    }
  }

  // Check 7: every Bible entity has both descriptions
  for (const char of sb.characters) {
    if (!char.full_description || char.full_description.length < 30) {
      warnings.push(`Character ${char.id} has missing or short full_description`);
    }
    if (!char.reference_still_prompt || char.reference_still_prompt.length < 30) {
      warnings.push(`Character ${char.id} has missing or short reference_still_prompt`);
    }
  }
  for (const loc of sb.locations) {
    if (!loc.full_description || loc.full_description.length < 30) {
      warnings.push(`Location ${loc.id} has missing or short full_description`);
    }
    if (!loc.reference_still_prompt || loc.reference_still_prompt.length < 30) {
      warnings.push(`Location ${loc.id} has missing or short reference_still_prompt`);
    }
  }

  // Check 8: Bible verbatim injection — characters/locations in a shot
  // should appear in the Veo prompt by their visual description.
  // We do a loose check: the Veo prompt should contain the character's
  // name (or distinctive substring of full_description).
  for (const shot of sb.shots) {
    for (const charId of shot.continuity.characters) {
      const char = sb.characters.find((c) => c.id === charId);
      if (!char) continue; // already warned above
      if (!shot.veo_prompt.includes(char.name)) {
        warnings.push(
          `Shot ${shot.shot_number}: character ${charId} (${char.name}) is in continuity but name does not appear in Veo prompt — possible Bible-injection failure`,
        );
      }
    }
  }

  return warnings;
}

// ============================================================================
// Helpers
// ============================================================================

function makeUsage(
  response: Anthropic.Messages.Message,
  startTime: number,
): ParseResult['usage'] {
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  // Sonnet 4.5 pricing as of April 2026: $3/M input, $15/M output
  const cost = (inputTokens * 3 + outputTokens * 15) / 1_000_000;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: cost,
    duration_ms: Date.now() - startTime,
  };
}

function failResult(
  errorMessage: string,
  startTime: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response?: any,
): ParseResult {
  return {
    success: false,
    storyboard: null,
    warnings: [],
    errors: [errorMessage],
    raw_extraction: null,
    usage: response
      ? makeUsage(response, startTime)
      : {
          input_tokens: 0,
          output_tokens: 0,
          estimated_cost_usd: 0,
          duration_ms: Date.now() - startTime,
        },
  };
}
