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
} from '../schema/storyboard';
import { PARSER_SYSTEM_PROMPT } from '../prompts/parser-system';

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
    /** Approximate cost in USD at current Sonnet 4.6 pricing ($3/M input, $15/M output). */
    estimated_cost_usd: number;
    duration_ms: number;
  };
}

export interface ParseOptions {
  /** Anthropic API key. Defaults to process.env.ANTHROPIC_API_KEY. */
  apiKey?: string;
  /** Model to use. Defaults to claude-sonnet-4-6. */
  model?: string;
  /** Max output tokens. Defaults to 32000 — the Leo storyboard (14 shots) uses ~20-25k tokens. */
  maxTokens?: number;
  /** Whether to log progress to stdout. Defaults to false. */
  verbose?: boolean;
  /** Called incrementally as the tool-use JSON is generated. Useful for streaming progress. */
  onProgress?: (charsGenerated: number) => void;
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

  const model = options.model ?? 'claude-sonnet-4-6';
  const maxTokens = options.maxTokens ?? 32000;
  const verbose = options.verbose ?? false;

  const client = new Anthropic({ apiKey });

  // Convert Zod schema to JSON Schema for the tool definition.
  // Use jsonSchema7 target (not openApi3) because openApi3 emits `nullable: true`
  // which is an OpenAPI extension rejected by Anthropic's schema validator.
  // The sanitizer below upgrades draft-07 boolean exclusiveMinimum to draft 2020-12.
  const rawSchema = zodToJsonSchema(ParsedStoryboardSchema, {
    target: 'jsonSchema7',
    $refStrategy: 'none', // Inline all refs — Anthropic's tool schema works best flat.
  });
  const inputSchema = sanitizeJsonSchema(rawSchema);

  if (verbose) {
    console.log(`[parser] Calling ${model} with ${markdown.length} chars of markdown`);
  }

  const tools: Anthropic.Beta.PromptCaching.PromptCachingBetaTool[] = [
    {
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input_schema: inputSchema as any,
    },
  ];

  // Attempt the parse, then retry once with error correction if Zod rejects it.
  // Typical failure: the model collapses a nested object into a string (e.g.,
  // style_lock → raw_block string). Feeding the error back usually fixes it.
  let response!: Anthropic.Beta.PromptCaching.PromptCachingBetaMessage;
  let rawExtraction: unknown;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastErrors: string[] = [];

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const messages: Anthropic.Beta.PromptCaching.PromptCachingBetaMessageParam[] =
      attempt === 1
        ? [{ role: 'user', content: markdown }]
        : buildCorrectionMessages(markdown, response, rawExtraction, lastErrors);

    try {
      const messageStream = client.beta.promptCaching.messages.stream({
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: PARSER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools,
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages,
      });

      if (attempt === 1 && options.onProgress) {
        let charsGenerated = 0;
        messageStream.on('inputJson', (partialJson) => {
          charsGenerated += partialJson.length;
          options.onProgress!(charsGenerated);
        });
      }

      response = await messageStream.finalMessage();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failResult(`Anthropic API error: ${message}`, startTime);
    }

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

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

    rawExtraction = toolUseBlock.input;

    const parseResult = ParsedStoryboardSchema.safeParse(rawExtraction);

    if (parseResult.success) {
      const storyboard = parseResult.data;
      const warnings = runIntegrityChecks(storyboard);

      if (verbose) {
        if (attempt > 1) console.log(`[parser] Succeeded on correction attempt ${attempt}`);
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
        usage: {
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
          estimated_cost_usd: (totalInputTokens * 3 + totalOutputTokens * 15) / 1_000_000,
          duration_ms: Date.now() - startTime,
        },
      };
    }

    lastErrors = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);

    if (verbose) {
      console.log(`[parser] Attempt ${attempt} failed validation:`, lastErrors);
    }
  }

  // All attempts exhausted.
  return {
    success: false,
    storyboard: null,
    warnings: [],
    errors: ['Schema validation failed after retry:', ...lastErrors],
    raw_extraction: rawExtraction,
    usage: {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      estimated_cost_usd: (totalInputTokens * 3 + totalOutputTokens * 15) / 1_000_000,
      duration_ms: Date.now() - startTime,
    },
  };
}

// ============================================================================
// Correction message builder
// ============================================================================

/**
 * Builds the multi-turn messages for a correction retry.
 * We replay the original user message, the model's (broken) tool call,
 * a synthetic tool result, and a correction request — all in one turn.
 */
function buildCorrectionMessages(
  markdown: string,
  firstResponse: Anthropic.Beta.PromptCaching.PromptCachingBetaMessage,
  rawExtraction: unknown,
  errors: string[],
): Anthropic.Beta.PromptCaching.PromptCachingBetaMessageParam[] {
  // Find the tool_use block from the first response.
  const toolUseBlock = firstResponse.content.find(
    (block) => block.type === 'tool_use' && block.name === TOOL_NAME,
  );
  const toolUseId = (toolUseBlock && toolUseBlock.type === 'tool_use') ? toolUseBlock.id : 'tool_0';

  return [
    { role: 'user', content: markdown },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: TOOL_NAME,
          input: rawExtraction as Record<string, unknown>,
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: `Schema validation failed. Please call the tool again with corrections.\n\nErrors:\n${errors.map((e) => `- ${e}`).join('\n')}\n\nCommon cause: a field that should be an object was returned as a string. For example, style_lock must be an object with fields like look, dp_reference, colour_grade, etc. — not a raw string.`,
        },
      ],
    },
  ];
}

// ============================================================================
// Schema sanitizer
// ============================================================================

/**
 * Converts a zod-to-json-schema draft-07 output to draft 2020-12 for Anthropic.
 *
 * zod-to-json-schema `jsonSchema7` target emits:
 *   { "exclusiveMinimum": true, "minimum": N }  (draft-07 boolean form)
 *
 * Anthropic requires draft 2020-12:
 *   { "exclusiveMinimum": N }  (numeric form, no separate minimum)
 *
 * Also strips the `$schema` key which Anthropic's validator doesn't need.
 */
function sanitizeJsonSchema(schema: unknown): Record<string, unknown> {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return {};
  }
  const obj = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (key === '$schema') continue;

    if (key === 'exclusiveMinimum' && val === true && typeof obj['minimum'] === 'number') {
      out['exclusiveMinimum'] = obj['minimum'];
      continue;
    }
    if (key === 'minimum' && obj['exclusiveMinimum'] === true) {
      // Already handled above — skip the bare minimum key.
      continue;
    }
    if (key === 'exclusiveMaximum' && val === true && typeof obj['maximum'] === 'number') {
      out['exclusiveMaximum'] = obj['maximum'];
      continue;
    }
    if (key === 'maximum' && obj['exclusiveMaximum'] === true) {
      continue;
    }

    if (Array.isArray(val)) {
      out[key] = val.map((item) =>
        typeof item === 'object' && item !== null ? sanitizeJsonSchema(item) : item,
      );
    } else if (typeof val === 'object' && val !== null) {
      out[key] = sanitizeJsonSchema(val);
    } else {
      out[key] = val;
    }
  }

  return out;
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

  // Check 6: key_frame_prompt is non-trivially long
  // (a 50-char prompt is almost certainly a parser miss)
  for (const shot of sb.shots) {
    if (shot.key_frame_prompt.length < 100) {
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

  // Check 8: Bible verbatim injection — characters in a shot should appear
  // in the key_frame_prompt by name.
  for (const shot of sb.shots) {
    for (const charId of shot.continuity.characters) {
      const char = sb.characters.find((c) => c.id === charId);
      if (!char) continue; // already warned above
      if (!shot.key_frame_prompt.includes(char.name)) {
        warnings.push(
          `Shot ${shot.shot_number}: character ${charId} (${char.name}) is in continuity but name does not appear in key_frame_prompt — possible Bible-injection failure`,
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
  response: { usage: { input_tokens: number; output_tokens: number } },
  startTime: number,
): ParseResult['usage'] {
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  // Sonnet 4.6 pricing: $3/M input, $15/M output
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
  response?: { usage: { input_tokens: number; output_tokens: number } },
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
