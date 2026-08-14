/**
 * Turns a storyboard's written dialogue into speakable lines.
 *
 * The Bible writes dialogue the way a script does — "MAYA (V.O.): We never
 * went back." Fed to a voice model verbatim, the speaker's name and the
 * parenthetical get read aloud. This strips the script furniture and keeps
 * only the words meant to be heard.
 */

export type VoiceOverLine = {
  shotNumber: number;
  /** The words to speak, script furniture removed. */
  text: string;
  /** Who says it, when the source named them — for UI labelling only. */
  speaker: string | null;
};

/**
 * Matches a leading speaker cue: an all-caps name, optionally followed by a
 * parenthetical like (V.O.) or (CONT'D), then a colon. Requires the colon —
 * without it we can't distinguish a cue from a line that simply starts with a
 * capitalised word.
 */
const SPEAKER_CUE = /^\s*([A-Z][A-Z0-9 .'’#-]{1,40}?)\s*(?:\(([^)]*)\))?\s*:\s*/;

/** Stage directions in brackets — spoken aloud they're nonsense. */
const BRACKETED = /\s*[[(]\s*(?:beat|pause|cont'?d|continued|o\.?s\.?|v\.?o\.?|sotto|whispered|laughing|sighs?)[^)\]]*\s*[)\]]\s*/gi;

/** Extracts the spoken text and speaker from one raw dialogue field. */
export function parseDialogueLine(raw: string): { text: string; speaker: string | null } {
  let text = raw.replace(/\r\n/g, '\n').trim();
  let speaker: string | null = null;

  const cue = SPEAKER_CUE.exec(text);
  if (cue) {
    speaker = cue[1]?.trim() ?? null;
    text = text.slice(cue[0].length);
  }

  text = text
    .replace(BRACKETED, ' ')
    // Surrounding quotes read as nothing but often wrap the whole line.
    .replace(/^["“”']+|["“”']+$/g, '')
    // Collapse the whitespace the removals leave behind.
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  return { text, speaker };
}

/** True when a dialogue field holds something worth sending to a voice model. */
function isSpeakable(text: string): boolean {
  // Needs at least one letter — "—" and "..." are beats, not lines.
  return text.length > 1 && /[a-z]/i.test(text);
}

/**
 * Every shot with a spoken line, in shot order. Shots without dialogue are
 * simply absent — the board's silent frames stay silent.
 */
export function voiceOverLines(
  shots: { shot_number: number; dialogue_vo?: string | null }[],
): VoiceOverLine[] {
  const lines: VoiceOverLine[] = [];
  for (const shot of [...shots].sort((a, b) => a.shot_number - b.shot_number)) {
    const raw = shot.dialogue_vo;
    if (typeof raw !== 'string' || raw.trim().length === 0) continue;
    const { text, speaker } = parseDialogueLine(raw);
    if (!isSpeakable(text)) continue;
    lines.push({ shotNumber: shot.shot_number, text, speaker });
  }
  return lines;
}
