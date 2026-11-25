// Meeting addendum, section 5: clean and segment a pasted transcript or summary. No AI.
// Pure function. Tests in segment.test.ts (npm test).

export interface Segment {
  id: string;
  speaker?: string;
  text: string;
}

export interface Segmented {
  kind: 'transcript' | 'summary';
  segments: Segment[];
  truncated: boolean;
  coveredSegments: number;
  totalSegments: number;
}

export type MeetingErrorCode = 'too_short' | 'too_large';

export class MeetingInputError extends Error {
  constructor(
    public code: MeetingErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Input cap for one meeting. GET /v2/models lists context_length (262k to 1M tokens for the three
 * models, printed by `npm run check:models`), so this is a cost and quality cap, not a model limit.
 * Measured: chars / 3.5 under-counts real tokens by about a quarter for English transcripts.
 */
export const MEETING_MAX_INPUT_TOKENS = Number(process.env.MEETING_MAX_INPUT_TOKENS ?? 24000);
export const MEETING_MAX_CHARS = 200_000;
const SPLIT_WORDS = 120;

/** Safe for mixed-language text (Hinglish, Devanagari). */
export const estimateTokens = (s: string) => Math.ceil(s.length / 3.5);

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

const TIME = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?`;
const CUE_LINE = new RegExp(String.raw`^\s*${TIME}\s*-->\s*${TIME}.*$`);
const INLINE_TIME = new RegExp(String.raw`[\[(]?\b${TIME}\b[\])]?`, 'g');
const BULLET = /^\s*(?:[-*•▪◦–]|\d+[.)])\s+/;
const HEADING = /^\s*(?:#{1,6}\s+.+|[A-Z][^.!?]{0,60}:)\s*$/;
// "Name:", "Name (00:01):", "Dr. Name Surname:"; at most 4 words, no digits, under 40 characters.
const LABEL = /^\s*([A-Za-zÀ-ɏऀ-ॿ][\wÀ-ɏऀ-ॿ.' -]{0,38}?)\s*(?:\([^)]*\))?\s*:\s+(.+)$/;
const VOICE = /^\s*<v(?:\.[^ >]+)?\s+([^>]+)>\s*(.*?)\s*(?:<\/v>)?\s*$/i;

/** Lines that only carry captions furniture: WEBVTT header, NOTE blocks, cue numbers and timings. */
function stripCaptions(raw: string): { lines: string[]; captions: boolean } {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  let captions = false;
  const out: string[] = [];
  let inNote = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^WEBVTT\b/.test(t)) {
      captions = true;
      continue;
    }
    if (inNote) {
      if (!t) inNote = false;
      continue;
    }
    if (/^(NOTE|STYLE|REGION)\b/.test(t) && captions) {
      inNote = true;
      continue;
    }
    if (CUE_LINE.test(t)) {
      captions = true;
      // An SRT counter sits just above the timing line: drop it.
      if (out.length && /^\d+$/.test(out[out.length - 1].trim())) out.pop();
      continue;
    }
    out.push(line);
  }
  return { lines: out, captions };
}

const NAME_ONLY = /^[A-ZÀ-ɏऀ-ॿ][\wÀ-ɏऀ-ॿ.'-]*(?: [A-ZÀ-ɏऀ-ॿ][\wÀ-ɏऀ-ॿ.'-]*){0,3}$/;

function cleanLine(line: string) {
  const v = VOICE.exec(line);
  const body = v ? v[2] : line;
  const hadTime = new RegExp(TIME).test(body);
  const text = body
    .replace(/<\/?[a-z][^>]*>/gi, ' ') // HTML-like tags (<i>, <c.colour>, </v>)
    .replace(INLINE_TIME, ' ');
  // A speaker on a line of their own, as Zoom and Otter export it: "Asha  00:01" or "Asha:".
  const bare = collapse(text).replace(/:$/, '').trim();
  const lone = !v && (hadTime || /:\s*$/.test(body)) && NAME_ONLY.test(bare) && !/\d/.test(bare) ? bare : undefined;
  return { voice: v ? collapse(v[1]) : (lone ?? undefined), text: lone ? '' : text };
}

function labelOf(line: string): { speaker: string; rest: string } | null {
  const m = LABEL.exec(line);
  if (!m) return null;
  const name = collapse(m[1]);
  if (words(name) > 4 || /\d|https?/i.test(name)) return null;
  return { speaker: name, rest: m[2] };
}

/** Split a long turn at sentence boundaries into pieces of about SPLIT_WORDS words. */
function splitLong(text: string): string[] {
  if (words(text) <= SPLIT_WORDS) return [text];
  const sentences = text.match(/[^.!?।]+[.!?।]+["')\]]*|[^.!?।]+$/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    const next = cur ? `${cur} ${s.trim()}` : s.trim();
    if (cur && words(next) > SPLIT_WORDS) {
      out.push(cur);
      cur = s.trim();
    } else cur = next;
  }
  if (cur) out.push(cur);
  // A single sentence longer than the limit stays whole: cutting mid-sentence loses meaning.
  return out;
}

export function segment(raw: string, maxTokens = MEETING_MAX_INPUT_TOKENS): Segmented {
  if (raw.length > MEETING_MAX_CHARS) throw new MeetingInputError('too_large', 'That is more text than the app can take at once. Paste a shorter part of the meeting.');
  const { lines, captions } = stripCaptions(raw);

  // Speaker labels count only when the text reads as a conversation: at least three labelled lines,
  // and either two different names or one name used more than once. So a single "Note: ..." is not a speaker.
  const counts = new Map<string, number>();
  for (const l of lines) {
    const c = cleanLine(l);
    const name = c.voice ?? labelOf(c.text)?.speaker;
    if (name) counts.set(name.toLowerCase(), (counts.get(name.toLowerCase()) ?? 0) + 1);
  }
  const labelledLines = [...counts.values()].reduce((a, n) => a + n, 0);
  const repeated = [...counts].filter(([, n]) => n >= 2).map(([k]) => k);
  const labelled = labelledLines >= 3 && (counts.size >= 2 || repeated.length > 0);
  // In a conversation, a name used once still counts if most labels belong to names used twice or more.
  const speakers = new Set(labelled ? [...counts.keys()] : []);

  const nonblank = lines.filter((l) => l.trim());
  const bulletish = nonblank.filter((l) => BULLET.test(l) || HEADING.test(l)).length;

  type Turn = { speaker?: string; text: string };
  const turns: Turn[] = [];

  if (labelled) {
    for (const l of lines) {
      const c = cleanLine(l);
      if (!collapse(c.text) && !c.voice) continue;
      const lab = c.voice ? { speaker: c.voice, rest: c.text } : labelOf(c.text);
      if (lab && speakers.has(lab.speaker.toLowerCase())) {
        const last = turns[turns.length - 1];
        // Merge consecutive lines from the same speaker into one turn.
        if (last && last.speaker?.toLowerCase() === lab.speaker.toLowerCase()) last.text += ` ${lab.rest}`;
        else turns.push({ speaker: lab.speaker, text: lab.rest });
      } else if (turns.length) turns[turns.length - 1].text += ` ${c.text}`;
      else turns.push({ text: c.text });
    }
  } else if (captions) {
    // Unlabelled captions: cues are fragments of sentences, so join everything and split by sentence.
    turns.push({ text: lines.map((l) => cleanLine(l).text).join(' ') });
  } else {
    // Plain text or a bullet summary: blank lines and bullets separate parts; a heading prefixes its bullets.
    let heading = '';
    let para: string[] = [];
    const flush = () => {
      const t = collapse(para.join(' '));
      if (t) turns.push({ text: heading && !t.startsWith(heading) ? `${heading}: ${t}` : t });
      para = [];
    };
    for (const l of lines) {
      const t = cleanLine(l).text;
      if (!t.trim()) {
        flush();
        continue;
      }
      if (HEADING.test(t) && !BULLET.test(t)) {
        flush();
        heading = collapse(t.replace(/^#+\s*/, '').replace(/:\s*$/, ''));
        continue;
      }
      if (BULLET.test(t)) {
        flush();
        para.push(t.replace(BULLET, ''));
        continue;
      }
      para.push(t);
    }
    flush();
  }

  let pieces: Turn[] = [];
  for (const t of turns) {
    const text = collapse(t.text);
    if (!text) continue;
    for (const p of splitLong(text)) pieces.push({ speaker: t.speaker, text: p });
  }
  const total = pieces.reduce((a, p) => a + words(p.text), 0);
  if (total < 30) throw new MeetingInputError('too_short', 'That is too short to build a session from. Paste more of the meeting.');
  // Drop scraps under 3 words ("Okay.", "Yeah, sure") unless they are all there is.
  const kept = pieces.filter((p) => words(p.text) >= 3);
  if (kept.length) pieces = kept;

  const totalWords = total;
  const kind: Segmented['kind'] =
    !labelled && (bulletish >= Math.max(2, nonblank.length / 2) || totalWords < 400) ? 'summary' : 'transcript';

  // Cap by estimated tokens. Keep from the start; never send the rest, and say how much was covered.
  const all: Segment[] = pieces.map((p, i) => ({ id: `S${i + 1}`, ...(p.speaker ? { speaker: p.speaker } : {}), text: p.text }));
  let used = 0;
  let covered = 0;
  for (const s of all) {
    const cost = estimateTokens(`${s.speaker ?? ''} ${s.text}`) + 8; // + the <segment> wrapper
    if (used + cost > maxTokens) break;
    used += cost;
    covered++;
  }
  covered = Math.max(1, covered);
  return { kind, segments: all.slice(0, covered), truncated: covered < all.length, coveredSegments: covered, totalSegments: all.length };
}
