#!/usr/bin/env tsx
/**
 * Loomer — Parser CLI
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... tsx scripts/parse-test.ts samples/leo-and-the-dolphin.md
 *
 * Output:
 *   - Pretty-printed parse result to stdout
 *   - Full JSON to ./out/<filename>.parsed.json
 *   - Warnings and errors highlighted
 *
 * Exit codes:
 *   0 — success
 *   1 — parse failure (schema validation or API error)
 *   2 — usage error (missing args, bad file)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseStoryboard } from '../src/pipeline/02-parse';

// ANSI colour helpers — keeps output readable in a terminal
const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error(c.red('Usage: tsx scripts/parse-test.ts <markdown-file>'));
    process.exit(2);
  }
  if (!existsSync(inputPath)) {
    console.error(c.red(`File not found: ${inputPath}`));
    process.exit(2);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(c.red('ANTHROPIC_API_KEY not set in environment'));
    process.exit(2);
  }

  const markdown = await readFile(inputPath, 'utf-8');
  console.log(c.bold(`\nLoomer Parser`));
  console.log(c.dim(`  Input:  ${inputPath} (${markdown.length} chars)`));
  console.log(c.dim(`  Model:  ${process.env.LOOMER_MODEL ?? 'claude-sonnet-4-5-20250929'}`));
  console.log();

  const result = await parseStoryboard(markdown, {
    verbose: true,
    model: process.env.LOOMER_MODEL,
  });

  console.log();
  console.log(c.bold(`Usage:`));
  console.log(`  Input tokens:  ${result.usage.input_tokens.toLocaleString()}`);
  console.log(`  Output tokens: ${result.usage.output_tokens.toLocaleString()}`);
  console.log(`  Cost (est):    $${result.usage.estimated_cost_usd.toFixed(4)}`);
  console.log(`  Duration:      ${(result.usage.duration_ms / 1000).toFixed(1)}s`);
  console.log();

  if (!result.success || !result.storyboard) {
    console.log(c.red(c.bold(`✖ Parse failed`)));
    result.errors.forEach((e) => console.log(c.red(`  ${e}`)));
    if (result.raw_extraction) {
      const debugPath = join('./out', `${basename(inputPath)}.debug.json`);
      await mkdir('./out', { recursive: true });
      await writeFile(debugPath, JSON.stringify(result.raw_extraction, null, 2));
      console.log(c.dim(`\n  Raw extraction written to ${debugPath} for debugging`));
    }
    process.exit(1);
  }

  const sb = result.storyboard;

  console.log(c.green(c.bold(`✔ Parse succeeded`)));
  console.log();
  console.log(c.bold(`Storyboard:`));
  console.log(`  Title:    ${sb.title}`);
  console.log(`  Format:   ${sb.format}`);
  console.log(`  Duration: ${sb.duration_seconds}s`);
  console.log(`  Aspect:   ${sb.style_lock.aspect_ratio}`);
  console.log(`  Shots:    ${sb.shots.length} (header says ${sb.total_shots})`);
  console.log();

  console.log(c.bold(`Bible:`));
  console.log(c.cyan(`  Characters (${sb.characters.length}):`));
  for (const char of sb.characters) {
    console.log(`    ${char.id} — ${char.name}`);
    console.log(c.dim(`      full_description: ${char.full_description.length} chars`));
    console.log(c.dim(`      reference_still_prompt: ${char.reference_still_prompt.length} chars`));
  }
  console.log(c.cyan(`  Locations (${sb.locations.length}):`));
  for (const loc of sb.locations) {
    console.log(`    ${loc.id} — ${loc.name}`);
  }
  console.log(c.cyan(`  Props (${sb.props.length}):`));
  for (const prop of sb.props) {
    const refMarker = prop.generates_reference_still ? c.green('[ref]') : c.dim('[no ref]');
    console.log(`    ${prop.id} — ${prop.name} ${refMarker}`);
  }
  console.log();

  console.log(c.bold(`Shots:`));
  for (const shot of sb.shots) {
    const veoLen = shot.veo_prompt.length;
    const klingLen = shot.kling_prompt.length;
    const keyFrameLen = shot.key_frame_prompt.length;
    console.log(
      `  ${String(shot.shot_number).padStart(2, '0')}. ` +
        `${shot.grammar.scale.padEnd(4)} | ` +
        `${shot.continuity.location_id.padEnd(30).slice(0, 30)} | ` +
        `${shot.duration.veo}s/${shot.duration.kling}s | ` +
        c.dim(`veo:${veoLen} kling:${klingLen} kf:${keyFrameLen}`),
    );
    console.log(c.dim(`      ${shot.descriptor}`));
  }
  console.log();

  if (result.warnings.length > 0) {
    console.log(c.yellow(c.bold(`⚠ ${result.warnings.length} integrity warnings:`)));
    result.warnings.forEach((w) => console.log(c.yellow(`  - ${w}`)));
    console.log();
  } else {
    console.log(c.green(`✔ No integrity warnings`));
    console.log();
  }

  // Write the full JSON to disk
  const outPath = join('./out', `${basename(inputPath, '.md')}.parsed.json`);
  await mkdir('./out', { recursive: true });
  await writeFile(outPath, JSON.stringify(sb, null, 2));
  console.log(c.dim(`Full parsed JSON written to ${outPath} (${(await readFile(outPath)).length.toLocaleString()} bytes)`));
  console.log();

  // Show one shot's prompts in full so we can sanity-check verbatim extraction
  const sampleShot = sb.shots.length > 0 ? sb.shots[Math.floor(sb.shots.length / 2)] : undefined;
  if (sampleShot) {
    console.log(c.bold(`Sample shot ${sampleShot.shot_number} prompts (middle of sequence):`));
    console.log();
    console.log(c.cyan(`  --- Veo 3.1 prompt ---`));
    console.log(c.dim(indent(sampleShot.veo_prompt, '    ')));
    console.log();
    console.log(c.cyan(`  --- Kling 2.5 prompt ---`));
    console.log(c.dim(indent(sampleShot.kling_prompt, '    ')));
    console.log();
    console.log(c.cyan(`  --- Key frame prompt (derived) ---`));
    console.log(c.dim(indent(sampleShot.key_frame_prompt, '    ')));
    console.log();
  }

  // Show a Bible character's reference still prompt — this is the derived
  // field most worth eyeballing
  const sampleChar = sb.characters.length > 0 ? sb.characters[0] : undefined;
  if (sampleChar) {
    console.log(c.bold(`Sample character reference still prompt (${sampleChar.id}):`));
    console.log();
    console.log(c.dim(indent(sampleChar.reference_still_prompt, '    ')));
    console.log();
  }
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(c.red(`Unhandled error: ${message}`));
  if (stack) console.error(stack);
  process.exit(1);
});
