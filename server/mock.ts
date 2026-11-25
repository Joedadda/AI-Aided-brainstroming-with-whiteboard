import type { ReportBody, Snapshot } from '../shared/types.ts';
import type { BoardContext } from './prompts.ts';

// Canned replies for offline demos (no SARVAM_API_KEY, or MOCK_AI=1).
// The app shows an "Offline demo" badge whenever these are in use, so they are never
// passed off as live AI. They quote the notes and context the person actually used,
// and say plainly what they cannot judge.

const bare = (s: string) => s.trim().replace(/[.!?]+$/, '');
const q = (s: string) => {
  const t = bare(s);
  return `"${t.length > 90 ? t.slice(0, 87).trimEnd() + '…' : t}"`;
};
const wordsOf = (s: string) => s.toLowerCase().match(/[a-z]{5,}/g) ?? [];
/** First line of a pasted note that reads like a fact, for quoting. */
const factsIn = (text: string) =>
  text
    .split('\n')
    .map((l) => l.replace(/^[-•\d.\s]+/, '').trim())
    .filter((l) => l.length > 20 && !/^you are /i.test(l));

type Turn = { role: 'user' | 'assistant'; text: string };
type N = { text: string; author: string };
type D = { id: string; text: string };

/**
 * Locked decisions PRD 8.5: a decision "conflicts" in offline mode when the text shares two or more
 * content words with it. Good enough for a demo, not a test of the model.
 */
export function mockConflict(text: string, decisions: D[] | undefined): D | null {
  if (!decisions?.length) return null;
  const tw = new Set(wordsOf(text).filter((w) => !STOP.has(w)));
  return decisions.find((d) => new Set(wordsOf(d.text).filter((w) => !STOP.has(w) && tw.has(w))).size >= 2) ?? null;
}
const cut = (s: string, n = 100) => {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
/** The one-line warning from PRD 8.2, at most two, each decision once. */
function warnLines(text: string, decisions: D[] | undefined) {
  const hits: D[] = [];
  let rest = decisions ?? [];
  for (let i = 0; i < 2; i++) {
    const d = mockConflict(text, rest);
    if (!d) break;
    hits.push(d);
    rest = rest.filter((x) => x.id !== d.id);
  }
  return hits.map((d) => `This goes against a locked decision: "${cut(bare(d.text))}".\n`).join('');
}

export const mock = {
  title(b: BoardContext) {
    const all = [b.problem, ...b.notes.map((n) => n.text)].join(' ');
    const top = Object.entries(
      wordsOf(all).reduce<Record<string, number>>((m, w) => ((m[w] = (m[w] ?? 0) + 1), m), {}),
    ).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { title: top ? `Ideas about ${top}` : 'Early ideas' };
  },

  largeIdea(text: string) {
    const lines = text.split(/\n|;|•|- /).filter((l) => l.trim().length > 8);
    const large = lines.length >= 3 || (text.match(/\?/g)?.length ?? 0) >= 2;
    const first = bare(text.split(/[.:\n]/)[0] ?? text).split(' ').slice(0, 4).join(' ');
    return {
      large,
      reason: large ? 'It lists several separate parts that could each be their own note.' : 'It reads as one idea.',
      sectionTitle: first || 'New section',
    };
  },

  linkSummary(title: string, text: string) {
    const first = text.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
    return { title: (title || 'Web page').slice(0, 80), summary: first.slice(0, 280) || 'The page had little readable text.' };
  },

  textCondense(text: string) {
    const facts = factsIn(text);
    const first = facts[0] ?? text.split(/(?<=[.!?])\s+/)[0] ?? text;
    return { title: bare(first).split(' ').slice(0, 8).join(' ') || 'Pasted text', summary: (facts.slice(0, 2).join(' ') || first).slice(0, 260) };
  },

  suggestions(b: BoardContext, prompt: string | null) {
    const n = b.notes.find((x) => x.text.length > 20);
    const base = [
      n ? `Find out which single step loses the most people, before choosing a fix for ${q(n.text)}.` : 'Write down who this is for in one sentence, so ideas can be checked against it.',
      'Pick the riskiest assumption on the board and note how to test it in a week.',
      'Look for one thing people already do today that a fix could build on.',
    ];
    if (prompt) base[2] = `For "${bare(prompt)}": ask three people what they did the last time they faced this problem.`;
    // Locked decisions 8.5: the same word-overlap rule as chat sets the flag offline.
    return {
      suggestions: base.map((text) => {
        const hit = mockConflict(text, b.decisions);
        return { text, conflictsWith: hit?.id ?? null, conflictLine: hit ? 'It shares its subject with a locked decision.' : '' };
      }),
    };
  },

  explain(suggestion: string, b: BoardContext) {
    const sw = new Set(wordsOf(suggestion));
    const hits = b.notes.filter((n) => wordsOf(n.text).some((w) => sw.has(w))).slice(0, 2);
    return {
      why: hits.length
        ? 'It builds on notes that already point this way and adds a step nobody has written down yet.'
        : 'It covers an angle the board does not have yet.',
      basedOn: hits.map((n) => n.id),
    };
  },

  /** Locked decisions 8.5: the warning line opens the answer when the notes or the ask overlap a decision. */
  opinion(selected: N[], ask: string, decisions?: D[]) {
    return warnLines(`${ask} ${selected.map((n) => n.text).join(' ')}`, decisions) + mock.opinionBody(selected, ask);
  },

  opinionBody(selected: N[], ask: string) {
    const L = (i: number) => `[N${i + 1}]`;
    if (/missing/i.test(ask)) {
      return `A few things these notes do not cover:\n1. Where exactly people stop. ${L(0)} does not say which step.\n2. How you would know a fix worked. None of the selected notes names a measure.\n3. Whether the people in ${L(0)} are typical. Based on a note outside your selection, there may be more to it.`;
    }
    if (/wrong|risk/i.test(ask)) {
      return `What could go wrong:\n1. ${L(0)} could point at the wrong cause, so a fix moves effort without moving the number.\n2. ${selected.length > 1 ? `${L(1)} rests on one source. If it is off, so is the plan.` : 'Nothing selected says why people leave, so the fix may target the wrong cause.'}`;
    }
    if (/connect/i.test(ask)) {
      return selected.length > 1
        ? `${L(0)} and ${L(1)} could describe the same moment from two sides. If they do, one fix could serve both. If they do not, they are two separate problems. The notes alone do not say which.`
        : `${L(0)} stands on its own. Select another note to see how they connect.`;
    }
    return `What is strong:\n1. ${L(0)} is specific enough to check.\n2. ${selected.length > 1 ? `${L(1)} gives a fact, not just an idea, which makes it easier to weigh.` : 'It could be tested within a sprint.'}`;
  },

  canvasChat(s: Snapshot, last: string, decisions?: D[]): string {
    return warnLines(last, decisions) + mock.canvasChatBody(s, last);
  },

  canvasChatBody(s: Snapshot, last: string): string {
    if (s.reports?.length) {
      const summaries = s.reports.map(({ body }) => `${body.title}: ${body.summary}`).join('\n\n');
      return `${summaries}\n\nWhich tradeoff should the decision prioritize, and what evidence would change your mind?`;
    }
    const [a, b, c] = s.notes;
    const first = a ? q(a.text) : 'the first note';
    const second = b ? q(b.text) : 'the second note';
    const own = s.chips.filter((x) => x.private && !x.unread && x.type === 'text').flatMap((x) => factsIn(x.source));
    const ownLine = own.length ? ` Your own notes add: ${q(own[0])}.` : '';
    if (/object|against|risk|wrong|weak/i.test(last)) {
      return [
        'The strongest objections:',
        `1. ${first} describes where people drop, not why. A fix aimed at the wrong cause will not move the number.`,
        `2. ${own.length > 1 ? `${q(own[1])} comes from a small or partial source. It may not hold for every new user.` : 'Every direction here rests on a few notes. Nothing on the board confirms them with a second source.'}`,
        '3. A broader fix might cover this as a side effect, so the narrow fix could be wasted effort.',
      ].join('\n');
    }
    if (/alternative|option|direction|idea/i.test(last)) {
      return [
        'Three different directions:',
        `1. Fix the step itself. Build on ${first}.${ownLine}`,
        `2. Change the order. Build on ${second}: move the hard part later, after people see some value.`,
        `3. Measure first. ${c ? `Before choosing, check ${q(c.text)} against real usage data.` : 'Before choosing, find which step loses the most people.'}`,
        'Which one fits what you know about your users?',
      ].join('\n');
    }
    if (/miss|not seeing|blind|gap/i.test(last)) {
      return [
        'A few things the notes do not cover:',
        '1. Which step loses the most people. The notes describe the drop, not its exact place.',
        '2. Whether the people who leave are different from those who stay.',
        c ? `3. How ${q(c.text)} connects to the others. It may be a separate problem.` : '3. How the team would know a fix worked.',
      ].join('\n');
    }
    return `I have the problem, your ${s.notes.length} ${s.notes.length === 1 ? 'note' : 'notes'} and the context.${ownLine} ${first} is a good place to start. Do you want directions, objections, or what is missing?`;
  },

  /**
   * The offline report (Micro PRD RPT-1 to RPT-8), built only from what the conversation said.
   * Notes and context appear only as evidence when a reply in the conversation quoted them.
   */
  makeReport(s: Snapshot, messages: Turn[], contributor: string): ReportBody {
    const replies = messages.filter((m) => m.role === 'assistant').map((m) => m.text);
    const linesOf = (start: RegExp) =>
      replies
        .filter((t) => start.test(t))
        .flatMap((t) => t.split('\n'))
        .map((l) => l.match(/^\d+\.\s+(.*)$/)?.[1]?.trim())
        .filter((l): l is string => Boolean(l));
    const directions = linesOf(/^Three different directions/);
    const objectionLines = linesOf(/^The strongest objections/);
    const gaps = linesOf(/^A few things the notes do not cover/);
    const said = replies.join('\n');

    const findings: ReportBody['findings'] = directions.map((d) => ({
      text: `A direction worth exploring: ${bare(d.split('. ')[0])}.`,
      reason: `It came up when ${contributor} asked the AI for different directions.`,
    }));

    // Evidence: only notes and context the conversation actually quoted.
    const own = s.chips.filter((x) => x.private && !x.unread && x.type === 'text').flatMap((x) => factsIn(x.source).map((t) => ({ t, title: x.title })));
    const quoted = (t: string) => said.includes(bare(t).slice(0, 40));
    const evidence: ReportBody['evidence'] = findings.length
      ? [
          ...s.notes.filter((n) => quoted(n.text)).map((n) => ({ text: bare(n.text), source: `${n.author}'s note`, supports: 1 })),
          ...own.filter((o) => quoted(o.t)).map((o) => ({ text: bare(o.t), source: o.title, supports: 1 })),
        ]
      : [];

    const objections: ReportBody['objections'] = objectionLines.map((o) => {
      const quoteEnd = o.startsWith('"') ? o.indexOf('"', 1) : -1;
      const split = o.indexOf('. ', quoteEnd + 1);
      return split < 0
        ? { text: o, reason: 'Raised when the AI was asked for the strongest objections.' }
        : { text: o.slice(0, split + 1), reason: o.slice(split + 2) };
    });

    const open_questions: ReportBody['open_questions'] = gaps.map((g) => ({ text: g }));

    const parts = [
      directions.length && `${directions.length} directions`,
      objectionLines.length && 'the strongest objections',
      gaps.length && 'what the notes do not cover',
    ].filter(Boolean);
    const summary = parts.length
      ? `${contributor} explored ${parts.join(', ')} with the AI. ${findings[0] ? findings[0].text : 'No direction was chosen.'}`
      : `${contributor} and the AI spoke briefly, but the conversation did not get to directions, objections or open questions, so there is little to report yet.`;

    return {
      title: findings[0] ? `Directions from ${contributor}'s exploration` : `${contributor}'s exploration so far`,
      summary,
      findings,
      evidence,
      objections,
      rejected_directions: [],
      open_questions,
    };
  },
};

// ---------- Meeting addendum 11: offline meeting replies, built from the real segments ----------

type Seg = { id: string; speaker?: string; text: string };
const STOP = new Set(['about', 'there', 'their', 'which', 'would', 'could', 'should', 'think', 'really', 'going', 'maybe', 'because', 'right', 'something', 'people', 'thing', 'things', 'these', 'those', 'where', 'other', 'still', 'first', 'after', 'before', 'being', 'every', 'never', 'actually', 'just', 'okay', 'yeah']);
const topWord = (texts: string[]) => {
  const c: Record<string, number> = {};
  for (const w of wordsOf(texts.join(' '))) if (!STOP.has(w)) c[w] = (c[w] ?? 0) + 1;
  const w = Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
  return w ? w[0].toUpperCase() + w.slice(1) : '';
};
const sentencesOf = (s: Seg) =>
  (s.text.match(/[^.!?।]+[.!?।]+|[^.!?।]+$/g) ?? [s.text]).map((t) => t.trim()).filter((t) => t.split(' ').length >= 5).map((text) => ({ text, id: s.id }));

export const meetingMock = {
  condense(segments: Seg[], kind: 'transcript' | 'summary', name: string | null) {
    const speakers = [...new Set(segments.map((s) => s.speaker).filter(Boolean))];
    const topic = topWord(segments.map((s) => s.text));
    const title = name?.trim() || (kind === 'summary' ? 'Meeting summary' : 'Meeting transcript');
    const open = segments.flatMap(sentencesOf).filter((x) => x.text.endsWith('?')).length;
    return {
      title: title.split(/\s+/).slice(0, 6).join(' '),
      summary: `${speakers.length ? `${speakers.length} people talked` : 'The notes cover a discussion'}${topic ? ` mostly about ${topic.toLowerCase()}` : ''}, across ${segments.length} parts. ${open ? `${open} questions were raised and are not settled in the text.` : 'The text does not say what was left open.'}`,
    };
  },

  session(segments: Seg[], b: BoardContext) {
    // Three sections from thirds of the meeting; notes from the longest sentences; a sentence
    // ending in "?" is a question. Source ids are the real segment ids.
    const third = Math.ceil(segments.length / 3);
    const parts = [segments.slice(0, third), segments.slice(third, third * 2), segments.slice(third * 2)].filter((p) => p.length);
    const used = new Set<string>();
    const sections = parts.map((p, i) => {
      const picks = p
        .flatMap(sentencesOf)
        .sort((a, c) => c.text.length - a.text.length)
        .filter((x) => !used.has(x.text.toLowerCase()) && (used.add(x.text.toLowerCase()), true))
        .slice(0, 5)
        .map((x) => ({ text: x.text.length > 200 ? `${x.text.slice(0, 196).trimEnd()}…` : x.text, kind: (x.text.endsWith('?') ? 'question' : 'idea') as 'idea' | 'question', sourceIds: [x.id] }));
      return { title: topWord(p.map((s) => s.text)) || ['Opening', 'Middle', 'Closing'][i], notes: picks };
    });
    const topic = topWord(segments.map((s) => s.text));
    const firstQ = segments.flatMap(sentencesOf).find((x) => x.text.endsWith('?'));
    return {
      title: b.title ? b.title : `Meeting on ${topic.toLowerCase() || 'the topic'}`.slice(0, 60),
      problem: firstQ && firstQ.text.length <= 300 ? firstQ.text : '',
      sections: sections.filter((s) => s.notes.length),
      decisions: meetingMock.decisions(segments, b),
    };
  },

  /**
   * Locked decisions 9A, offline: a segment where someone says "agreed" or "decided" (and not "not
   * decided") is a decision. Its text drops the short filler sentences ("Agreed.", "Decided, then.");
   * the segment before it is the reason. At most 5, and none that repeat a decision in force.
   * On the Split Buddy planning call this gives K1 to K4, and the quoted "lock every decision" line
   * gives nothing, since nobody agrees to it.
   */
  decisions(segments: Seg[], b: BoardContext) {
    const out: { text: string; reasons: string; sourceIds: string[]; sectionRef: null; conflictsWith: string | null; conflictLine: string }[] = [];
    segments.forEach((s, i) => {
      if (!/\b(agreed|decided)\b/i.test(s.text) || /\bnot decided\b/i.test(s.text) || /\?\s*$/.test(s.text)) return;
      const sentences = (s.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [s.text]).map((t) => t.trim());
      const text = sentences.filter((t) => t.split(/\s+/).length > 3 && !/^(agreed|decided)\b/i.test(t)).join(' ');
      if (!text || out.some((o) => o.text === text)) return;
      const prev = segments[i - 1];
      const hit = mockConflict(text, b.decisions?.map((d) => ({ id: d.id, text: d.text })));
      if (b.decisions?.some((d) => d.text.toLowerCase() === text.toLowerCase())) return;
      out.push({
        text: text.slice(0, 300),
        reasons: prev ? `${prev.speaker ? `${prev.speaker}: ` : ''}${prev.text}`.slice(0, 500) : '',
        sourceIds: prev ? [prev.id, s.id] : [s.id],
        sectionRef: null,
        conflictsWith: hit?.id ?? null,
        conflictLine: hit ? 'It overlaps a decision already locked on the board.' : '',
      });
    });
    return out.slice(0, 5);
  },
};
