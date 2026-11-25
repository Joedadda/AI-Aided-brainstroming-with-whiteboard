import type { ReportBody } from '../../shared/types.ts';

/*
  The Split Buddy case: the single source of truth for all three case boards.
  Spec: "Adithya added docs/Demo Assets/Split_Buddy_Board_v3_Full.md" (v3). It replaces
  Split_Buddy_Case_v2_Expanded.md and the seed parts of Demo_Whiteboard_PRD.md.

    Fresh case       Frame (A to C), an empty Restate section, What we know (P1 to P8),
                     an empty Ideas section. No context, no reports, no decisions.
    Mid-session      Frame, three restate notes, What we know, the four project context
                     chips, and one big Ideas section holding the 40-note idea bank unsorted.
                     No reports, no decisions. The main demo board.
    Finished example Frame, restate notes, What we know, the 40 notes sorted into seven
                     direction sections, "Inside option C: four changes", the project context
                     plus the Sprint planning call meeting chip, three saved explorations and
                     their reports, and the seven decisions D1 to D7.

  Retained wording (v3 asks to keep the board's wording where it differs, and to say so):
  DES1, DES4, ENG1, ENG2, ENG4 and Dev's restate note keep the wording already on the boards
  and in docs/handouts.md. The meaning is the same as v3's.

  Everything here is fictional. Private facts reach a live session only through
  docs/handouts.md, pasted into a private canvas. Keep that file in step with this one.
*/

export const PEOPLE = {
  facilitator: { id: 'seed-facilitator', name: 'Facilitator', color: '#57544d' },
  kavya: { id: 'seed-kavya', name: 'Kavya', role: 'product designer', color: '#b03a78' },
  dev: { id: 'seed-dev', name: 'Dev', role: 'software engineer', color: '#1e7a4c' },
  asha: { id: 'seed-asha', name: 'Asha', role: 'product manager', color: '#2f5bd3' },
  // The lead in a four-person run. Holds no private facts, owns the decisions, authors six ideas.
  meera: { id: 'seed-meera', name: 'Meera', role: 'lead', color: '#a35a14' },
} as const;
export type PersonKey = keyof typeof PEOPLE;
type Person = (typeof PEOPLE)[keyof typeof PEOPLE];
type Role = 'kavya' | 'dev' | 'asha';

export const TITLE = 'Split Buddy: week-one drop-off';

export const FRAME =
  'Split Buddy is a fictional app for splitting shared bills between flatmates. Six in ten new users stop using Split Buddy within the first week. The team can ship one fix this sprint. Which one?';
export const DESIGN_QUESTION = 'How might we keep more new users past their first week?';

export type Option = 'A' | 'B' | 'C';

export const OPTIONS: { id: string; option: Option; text: string }[] = [
  { id: 'opt-a', option: 'A', text: 'Option A. Cut onboarding from six steps to three.' },
  { id: 'opt-b', option: 'B', text: 'Option B. Add reminders and streaks to bring people back.' },
  { id: 'opt-c', option: 'C', text: 'Option C. Fix the "invite your flatmates" step.' },
];

export interface Fact {
  id: string;
  text: string;
  /** Scored layer 1 facts only. P7, P8 and handout 2 are unscored. */
  option?: Option;
  value?: -1 | 0 | 1;
}

/** v3 3.1 and 3.2: the public notes, blue "Facilitator" notes in "What we know" on every case board. */
export const PUBLIC_FACTS: Fact[] = [
  { id: 'p1', text: 'The biggest drop happens in the first session, during the six-step setup.', option: 'A', value: 1 },
  { id: 'p2', text: 'A three-step onboarding could be designed and built in about a week.', option: 'A', value: 1 },
  { id: 'p3', text: 'Two app-store reviews this month call setup "confusing".', option: 'A', value: 1 },
  { id: 'p4', text: 'A reminders and streaks system would take about six weeks, past this sprint.', option: 'B', value: -1 },
  { id: 'p5', text: 'A reminder email test last quarter got a small bump in opens.', option: 'B', value: 1 },
  { id: 'p6', text: 'The invite step has not been touched since launch.', option: 'C', value: 0 },
  { id: 'p7', text: 'The invite screen has one main button, "Share link", and a small grey "Skip" link.' },
  { id: 'p8', text: 'The sprint has ten working days, one designer and one mobile engineer.' },
];

/** v3 3.1: handout 1, the 12 scored private facts. Never seeded onto a shared board. Board wording kept. */
export const PRIVATE_FACTS: Record<Role, Fact[]> = {
  kavya: [
    { id: 'DES1', text: 'In 8 usability tests of the current onboarding, 7 people finished it without trouble.', option: 'A', value: -1 },
    { id: 'DES2', text: 'In the same tests, 5 of 8 stalled when asked to invite flatmates, and most skipped it.', option: 'C', value: 1 },
    { id: 'DES3', text: 'Several testers said daily reminders would annoy them.', option: 'B', value: -1 },
    { id: 'DES4', text: 'Redrawing the invite screen is about two days of design work.', option: 'C', value: 0 },
  ],
  dev: [
    { id: 'ENG1', text: 'In the logs, 9 in 10 users who reach the last onboarding step finish it.', option: 'A', value: -1 },
    { id: 'ENG2', text: 'The invite link fails to open the app on about 1 in 3 Android phones.', option: 'C', value: 1 },
    { id: 'ENG3', text: 'Reminders only work if people allow notifications, and about 40 percent of new users decline.', option: 'B', value: -1 },
    { id: 'ENG4', text: 'The link fix is about three days of work, plus a few days for an app store release.', option: 'C', value: 0 },
  ],
  asha: [
    { id: 'PM1', text: 'Both reviews calling setup "confusing" also mention the invite not working.', option: 'A', value: -1 },
    { id: 'PM2', text: 'Users who invite at least one flatmate in week one are about 4 times more likely to still be active after a month.', option: 'C', value: 1 },
    { id: 'PM3', text: 'Early users who got the reminder email logged an expense about 10 percent more often.', option: 'B', value: 1 },
    { id: 'PM4', text: 'Reminders only reach people who have already added an expense, so they cannot help someone who stalls at setup.', option: 'B', value: -1 },
  ],
};

/** v3 3.3: handout 2, unscored. It shapes what to build inside option C. Not pre-loaded anywhere. */
export const PRIVATE_FACTS_2: Record<Role, Fact[]> = {
  kavya: [
    { id: 'DES5', text: 'Of the 5 testers who stalled on the invite step, 3 said they did not know yet whom to invite or their flatmates were not around. The other 2 were on Android and got an error when sharing.' },
    { id: 'DES6', text: '"Skip" is small grey text. 4 of the 5 who stalled took over a minute to find it, and 1 quit the test.' },
    { id: 'DES7', text: 'All 3 testers who actually sent an invite had a flatmate in the room at the time.' },
    { id: 'DES8', text: '6 of 8 testers said a weekly summary of who owes what would be fine. Daily reminders were the problem.' },
    { id: 'DES9', text: 'The 8 testers were recruited by email from existing users, so they are more committed than a typical new sign-up.' },
    { id: 'DES10', text: '3 of 8 testers asked how they would invite someone later.' },
  ],
  dev: [
    { id: 'ENG5', text: '"A third" comes from 12 Android phones from the office drawer: on 4 of them the link opened the website instead of the app.' },
    { id: 'ENG6', text: 'When the link opens the website, the invite code is lost, so the flatmate cannot join even after installing the app.' },
    { id: 'ENG7', text: 'After someone skips the invite, the only way back is Settings, then Home, then Members: three taps. Nothing prompts them later.' },
    { id: 'ENG8', text: 'A three-step onboarding would merge the name, currency and split-rule screens. The invite step would stay exactly as it is.' },
    { id: 'ENG9', text: 'Android is about 4 in 10 new users.' },
    { id: 'ENG10', text: 'The app logs that someone finished the invite step, but not whether a link was sent, opened or accepted.' },
    { id: 'ENG11', text: 'iPhone review takes 1 to 2 days. An Android release reaches everyone in about a week.' },
  ],
  asha: [
    { id: 'PM5', text: 'Of 100 people who sign up: 95 pass step 2, 92 pass step 3, 59 pass the invite step, 53 add a first expense, 47 finish step 6, and 40 are retained. The invite step loses 33 of the 60 who stop.' },
    { id: 'PM6', text: 'Of people who skip the invite, about 1 in 8 invite later, and most do it right after adding their first expense.' },
    { id: 'PM7', text: 'The "4 times" number compares two groups. It is not an experiment, and committed users may simply be the ones who invite.' },
    { id: 'PM8', text: 'Invite-step completion is about 7 in 10 on iPhone and under 6 in 10 on Android.' },
    { id: 'PM9', text: 'A competing app launched streaks in October, and one reviewer on its page praised them.' },
  ],
};

/** v3 section 2: board-level project context. Background only, not scored. */
export interface CaseChip {
  id: string;
  type: 'link' | 'text';
  source: string;
  title: string;
  summary: string;
}
export const PROJECT_CONTEXT: CaseChip[] = [
  {
    id: 'ctx-about',
    type: 'text',
    title: 'About Split Buddy',
    source:
      'Split Buddy is a mobile app for flatmates. People log shared expenses, such as rent, groceries and internet, and the app shows who owes whom. A new user goes through a six-step setup: 1 sign up, 2 name your home, 3 choose a currency, 4 invite flatmates, 5 add your first expense, 6 choose split rules.',
    summary: 'A mobile app where flatmates log shared expenses and see who owes whom. New users go through a six-step setup, and inviting flatmates is step 4.',
  },
  {
    id: 'ctx-sprint',
    type: 'text',
    title: 'This sprint',
    source:
      'Team: Asha (product manager), Dev (software engineer), Kavya (product designer). One two-week sprint. We can ship one fix. Goal: more new users still using Split Buddy after their first week.',
    summary: 'Asha, Dev and Kavya have one two-week sprint to ship one fix that keeps more new users past their first week.',
  },
  {
    id: 'ctx-measure',
    type: 'text',
    title: 'How we measure it',
    source:
      'A new user counts as retained if they log a second expense within 7 days of signing up. Right now about 4 in 10 new users are retained, so about 6 in 10 stop.',
    summary: 'A new user is retained if they log a second expense within 7 days. About 4 in 10 are retained today.',
  },
  {
    id: 'ctx-funnel',
    type: 'link',
    title: 'Setup funnel dashboard (week-one drop-off)',
    source: 'https://splitbuddy.example/dashboard/setup-funnel',
    summary: 'Fictional placeholder link. Excerpt: the biggest drop happens in the first session, during setup.',
  },
];

/** v3 section 8 and Part 4: what each person pastes into their private canvas. Mirrors docs/handouts.md. */
const intro = (who: Role, more: boolean) => {
  const p = PEOPLE[who];
  const kind = { kavya: 'usability test notes', dev: 'engineering notes', asha: 'product notes' }[who];
  return more
    ? `You are ${p.name}, the ${p.role} on the Split Buddy team. These are more ${kind}, handed out once option C is on the table.`
    : `You are ${p.name}, the ${p.role} on the Split Buddy team. These are your ${kind}.`;
};
const noteText = (who: Role, more: boolean) =>
  `${intro(who, more)}\n${(more ? PRIVATE_FACTS_2 : PRIVATE_FACTS)[who].map((f) => `- ${f.text}`).join('\n')}`;

export const HANDOUTS: Record<Role, { note: CaseChip; more: CaseChip; link: CaseChip }> = {
  kavya: {
    note: {
      id: 'hand-kavya',
      type: 'text',
      title: 'Usability test notes',
      source: noteText('kavya', false),
      summary: '7 of 8 testers finished onboarding without trouble, but 5 of 8 stalled at inviting flatmates. Testers said daily reminders would annoy them. Redrawing the invite screen is about two days of design.',
    },
    more: {
      id: 'hand-kavya-2',
      type: 'text',
      title: 'More from the usability tests',
      source: noteText('kavya', true),
      summary: 'Of the 5 who stalled, 3 were not ready to invite and 2 hit an Android error. Skip is hard to find. Senders had a flatmate in the room. A weekly summary was acceptable. Testers were existing users.',
    },
    link: { id: 'hand-kavya-link', type: 'link', title: 'Usability test recordings', source: 'https://splitbuddy.example/research/usability-tests', summary: '' },
  },
  dev: {
    note: {
      id: 'hand-dev',
      type: 'text',
      title: 'Engineering notes',
      source: noteText('dev', false),
      summary: '9 in 10 users who reach the last onboarding step finish it. The invite link fails on about 1 in 3 Android phones; the fix is about three days plus an app store release. About 40 percent decline notifications.',
    },
    more: {
      id: 'hand-dev-2',
      type: 'text',
      title: 'More engineering notes',
      source: noteText('dev', true),
      summary: 'The Android figure comes from 12 phones. A failed link loses the invite code. Skipping has no prompt back. A three-step onboarding leaves the invite step as it is. Sends, opens and accepts are not logged.',
    },
    link: { id: 'hand-dev-link', type: 'link', title: 'Invite link bug ticket', source: 'https://splitbuddy.example/tickets/invite-link', summary: '' },
  },
  asha: {
    note: {
      id: 'hand-asha',
      type: 'text',
      title: 'Product notes',
      source: noteText('asha', false),
      summary: 'Both "confusing" reviews also mention the invite not working. Users who invite a flatmate in week one are about 4 times more likely to stay. Reminders only reach people who already added an expense.',
    },
    more: {
      id: 'hand-asha-2',
      type: 'text',
      title: 'More product notes',
      source: noteText('asha', true),
      summary: 'Per 100 sign-ups, the invite step loses 33 of the 60 who stop. About 1 in 8 who skip invite later, mostly after their first expense. The 4 times figure is a correlation. Android completes the step less often.',
    },
    link: { id: 'hand-asha-link', type: 'link', title: 'App store reviews, this month', source: 'https://splitbuddy.example/reviews/this-month', summary: '' },
  },
};

// ---------- Restate notes (Mid-session and Finished example) ----------

export const RESTATES: { id: string; by: Person; text: string }[] = [
  { id: 'rs-kavya', by: PEOPLE.kavya, text: 'New users are not sticking. We need to find what makes them leave in week one and fix one thing this sprint.' },
  { id: 'rs-dev', by: PEOPLE.dev, text: 'Six in ten new users are gone within a week. We need the one change that keeps the most of them.' },
  { id: 'rs-asha', by: PEOPLE.asha, text: 'Most new users never become regular users. We have one sprint, so which single fix is worth it?' },
];

// ---------- v3 section 4: the seven directions ----------

export type Direction = 'INV' | 'VAL' | 'ONB' | 'RET' | 'EXP' | 'LRN' | 'PARK';

/** In the order the finished example lays them out. Titles are topic labels, never conclusions. */
export const DIRECTIONS: { code: Direction; sectionId: string; title: string }[] = [
  { code: 'INV', sectionId: 's-inv', title: 'Fix the invite step' },
  { code: 'VAL', sectionId: 's-val', title: 'Make inviting worth it' },
  { code: 'ONB', sectionId: 's-onb', title: 'Shorten and reorder setup' },
  { code: 'RET', sectionId: 's-ret', title: 'Bring people back' },
  { code: 'EXP', sectionId: 's-exp', title: 'Explain the product' },
  { code: 'LRN', sectionId: 's-lrn', title: 'Learn before building' },
  { code: 'PARK', sectionId: 's-park', title: 'Not this problem' },
];

// ---------- v3 section 5: the idea bank, with its answer key ----------

export type Stage = 'PRE' | 'SET' | 'INV' | 'W1' | 'M1' | null;
export type Effort = 'S' | 'N' | 'L' | null;
export type Evidence = 'Backed' | 'Mixed' | 'Against' | 'Untested' | 'n/a';

export interface BankNote {
  /** 'i01' to 'i40', stable so the agent checks can use them. */
  id: string;
  by: PersonKey;
  text: string;
  /** I09, I16 and I22 are "from AI", credited to Dev, Kavya and Asha. */
  ai?: boolean;
  dir: Direction;
  /** The eight borderline notes: correct in either direction. */
  second?: Direction;
  stage: Stage;
  effort: Effort;
  evidence: Evidence;
  /** Kept on the board on purpose: a duplicate or a vague note the agent should flag, not delete. */
  flag?: string;
}

const B = (id: number, by: PersonKey, text: string, dir: Direction, stage: Stage, effort: Effort, evidence: Evidence, extra: Partial<BankNote> = {}): BankNote => ({
  id: `i${String(id).padStart(2, '0')}`,
  by,
  text,
  dir,
  stage,
  effort,
  evidence,
  ...extra,
});

/** In ID order. Totals by direction: INV 10, VAL 6, ONB 6, RET 7, EXP 4, LRN 4, PARK 3 = 40. */
export const IDEA_BANK_BY_ID: BankNote[] = [
  B(1, 'dev', 'Open the invite link in the app, not the browser, on Android.', 'INV', 'INV', 'S', 'Backed'),
  B(2, 'dev', 'If the link fails, let people type a six-letter group code.', 'INV', 'INV', 'S', 'Backed'),
  B(3, 'kavya', 'Make Skip a clear button, not small grey text.', 'INV', 'INV', 'S', 'Backed'),
  B(4, 'dev', 'Let people share the invite from their usual group chat.', 'INV', 'INV', 'S', 'Untested'),
  B(5, 'kavya', 'Show a QR code a flatmate in the room can scan.', 'INV', 'INV', 'S', 'Backed'),
  B(6, 'dev', 'Keep the invite code if the flatmate installs the app first.', 'INV', 'INV', 'N', 'Backed'),
  B(7, 'asha', 'Show who has joined, with a one-tap resend.', 'INV', 'W1', 'N', 'Untested'),
  B(8, 'dev', 'Let flatmates join with just their phone number, no link.', 'INV', 'INV', 'L', 'Untested', { second: 'ONB' }),
  B(9, 'dev', 'Show a preview of what flatmates will see before sending the invite.', 'VAL', 'INV', 'S', 'Backed', { ai: true }),
  B(10, 'kavya', 'Ask who you split with first, and fill in the names.', 'VAL', 'SET', 'S', 'Backed', { second: 'ONB' }),
  B(11, 'asha', 'Let people add the first expense before inviting anyone.', 'VAL', 'SET', 'N', 'Backed', { second: 'ONB' }),
  B(12, 'kavya', 'Show a sample shared balance so the point of the app is clear.', 'VAL', 'INV', 'S', 'Untested', { second: 'EXP' }),
  B(13, 'asha', 'Give both people a free month when a flatmate joins.', 'VAL', 'INV', 'N', 'Untested', { second: 'PARK' }),
  B(14, 'meera', 'Say plainly that the app works best with flatmates, and why.', 'VAL', 'INV', 'S', 'Untested'),
  B(15, 'kavya', 'Merge steps 2 and 3 into one screen.', 'ONB', 'SET', 'S', 'Against'),
  B(16, 'kavya', 'Add a progress bar across setup.', 'ONB', 'SET', 'S', 'Untested', { ai: true }),
  B(17, 'dev', 'Let people add a first expense before they sign up.', 'ONB', 'SET', 'L', 'Untested'),
  B(18, 'dev', "Pick the currency from the phone's region automatically.", 'ONB', 'SET', 'S', 'Untested'),
  B(19, 'asha', 'Call the home "Home" by default and let people rename it later.', 'ONB', 'SET', 'S', 'Untested'),
  B(20, 'asha', 'Move the invite step to after the first expense.', 'ONB', 'INV', 'N', 'Backed', { second: 'VAL' }),
  B(21, 'asha', 'Weekly "who owes what" summary push.', 'RET', 'M1', 'N', 'Mixed'),
  B(22, 'asha', 'Celebrate the first logged expense with a short message.', 'RET', 'W1', 'S', 'Untested', { ai: true }),
  B(23, 'meera', 'Email people who have added nothing by day two.', 'RET', 'W1', 'S', 'Against'),
  B(24, 'dev', 'Daily streak for logging expenses.', 'RET', 'M1', 'L', 'Against'),
  B(25, 'kavya', 'Remind the person who owes money, not the one who is owed.', 'RET', 'M1', 'N', 'Untested'),
  B(26, 'asha', 'Send a settle-up reminder on the 1st, when rent is due.', 'RET', 'M1', 'S', 'Mixed'),
  B(27, 'meera', 'Rewrite the app-store screenshots to show rent splitting.', 'EXP', 'PRE', 'S', 'Untested'),
  B(28, 'asha', 'Reply to the two "confusing" reviews and ask what confused them.', 'EXP', 'PRE', 'S', 'Backed'),
  B(29, 'kavya', 'Add a 20-second video on the first screen.', 'EXP', 'SET', 'N', 'Untested'),
  B(30, 'kavya', 'Let people try a sample home before signing up.', 'EXP', 'PRE', 'N', 'Untested', { second: 'ONB' }),
  B(31, 'dev', 'Log whether each invite is sent, opened and accepted.', 'LRN', 'INV', 'S', 'Backed'),
  B(32, 'kavya', 'Run five more usability tests, this time on Android.', 'LRN', 'INV', 'S', 'Backed'),
  B(33, 'asha', 'Compare week-four activity for inviters and non-inviters, by phone type.', 'LRN', 'M1', 'S', 'Backed'),
  B(34, 'asha', 'Hide the invite step for half of new users and compare.', 'LRN', 'INV', 'N', 'Backed'),
  B(35, 'dev', 'Build a web version so flatmates can join without installing.', 'INV', 'INV', 'L', 'Untested', { second: 'ONB' }),
  B(36, 'meera', 'Cut the subscription price.', 'PARK', null, null, 'n/a'),
  B(37, 'dev', 'Refresh the logo and brand colours.', 'PARK', null, null, 'n/a'),
  B(38, 'kavya', 'Add dark mode.', 'PARK', null, null, 'n/a'),
  B(39, 'meera', 'Show the invite code on screen in case the link fails.', 'INV', 'INV', 'S', 'Backed', { flag: 'duplicate of I02' }),
  B(40, 'meera', 'Reminders so people come back after the first week.', 'RET', 'M1', 'L', 'Against', { flag: 'vague, overlaps I21, I23' }),
];

const byId = new Map(IDEA_BANK_BY_ID.map((n) => [n.id, n]));
export const bankNote = (id: string) => byId.get(id)!;

/** v3 7.2: the fixed, unsorted order of the mid-session pile (8 by 5). */
const PILE_ORDER = [24, 9, 36, 21, 1, 15, 31, 40, 12, 3, 27, 33, 19, 6, 38, 22, 11, 30, 2, 26, 37, 16, 5, 34, 13, 28, 4, 23, 18, 8, 35, 20, 10, 29, 14, 7, 25, 32, 17, 39];
export const IDEA_BANK: BankNote[] = PILE_ORDER.map((n) => bankNote(`i${String(n).padStart(2, '0')}`));

/** The notes of one direction, ordered by ID (the finished example's layout). */
export const notesIn = (dir: Direction) => IDEA_BANK_BY_ID.filter((n) => n.dir === dir);

/** v3 7.3 row 3 (Part C): green notes in "Inside option C: four changes". */
export const OPTION_C_SECTION = { id: 's-optc', title: 'Inside option C: four changes' };
export const OPTION_C_NOTES: { id: string; text: string; ideas: string[] }[] = [
  { id: 'c1', text: 'C1. Fix the Android link and add a typed group code.', ideas: ['i01', 'i02', 'i06', 'i39'] },
  { id: 'c2', text: 'C2. Make Skip obvious and prompt an invite after the first expense.', ideas: ['i03', 'i07', 'i20'] },
  { id: 'c3', text: 'C3. Move the invite out of setup, to after the first expense.', ideas: ['i11', 'i20', 'i34'] },
  { id: 'c4', text: 'C4. Show what flatmates will see before sending.', ideas: ['i09', 'i10', 'i12', 'i14'] },
];

/** Text of any note id a report, decision or snapshot can point at. */
export function noteById(id: string): { text: string; by: Person } | null {
  const fact = PUBLIC_FACTS.find((f) => f.id === id);
  if (fact) return { text: fact.text, by: PEOPLE.facilitator };
  const idea = byId.get(id);
  if (idea) return { text: idea.text, by: PEOPLE[idea.by] };
  return null;
}

// ---------- v3 section 9 and 11: saved explorations and their reports ----------

type Turn = { role: 'user' | 'assistant'; text: string };

export interface ExampleExploration {
  who: Role;
  cards: string[];
  messages: Turn[];
  report: ReportBody;
}

/** Scripted, not a live model run. Order on the board, newest first: Kavya, Dev, Asha. */
export const EXPLORATIONS: ExampleExploration[] = [
  {
    who: 'kavya',
    cards: ['p1', 'p2', 'p3', 'p6', 'p7', 'i03', 'i05'],
    messages: [
      { role: 'user', text: 'I added both sets of usability notes and the recordings link. What do these cards say, and do my notes agree?' },
      {
        role: 'assistant',
        text: 'Three cards point toward onboarding: the biggest drop is during setup, a three-step version could ship in about a week, and two reviews call setup confusing. Your notes complicate that. 7 of 8 testers finished the current setup without trouble. Either people leave at one particular step rather than across setup, or your testers behave differently from real new users. I cannot tell which yet.',
      },
      { role: 'user', text: 'Where in setup could people be leaving?' },
      {
        role: 'assistant',
        text: 'The invite step. 5 of 8 testers stalled when asked to invite flatmates and most skipped it. The board says that step has not been touched since launch, and the screen has one main button, "Share link", with a small grey "Skip". That makes it the strongest candidate. 8 testers is a small group, so I would hold this loosely.',
      },
      { role: 'user', text: 'Give me the strongest case against the invite step.' },
      {
        role: 'assistant',
        text: 'Four objections. First, 8 testers is a small sample. Second, your testers were recruited by email from existing users, so they are more committed than a typical new sign-up, and real new users may stall even more, or somewhere else. Third, skipping a step in a test is not the same as leaving the app. Fourth, the board says the drop is across setup, and the invite is one step of six.',
      },
      { role: 'user', text: 'Why did the testers stall?' },
      {
        role: 'assistant',
        text: 'Two different reasons, which matters for the fix. 3 of the 5 said they did not know yet whom to invite, or their flatmates were not around. The other 2 were on Android and got an error when sharing. Separately, Skip is small grey text: 4 of the 5 took over a minute to find it and 1 quit. All 3 testers who did send an invite had a flatmate in the room, which fits the QR idea on the board, though 3 people is very few.',
      },
      { role: 'user', text: 'What about reminders?' },
      {
        role: 'assistant',
        text: 'Several testers said daily reminders would annoy them, and the board says a reminders and streaks system is about six weeks, past this sprint. But 6 of 8 were fine with a weekly summary of who owes what. So I would set daily reminders and streaks aside, and keep a weekly summary on the list as a small later idea.',
      },
      { role: 'user', text: 'Okay, make the report.' },
    ],
    report: {
      title: 'Setup finishes fine; the invite step is where people stall',
      summary:
        'In usability tests 7 of 8 people finished the current setup without trouble. The place people stalled was the invite step (5 of 8). Those stalls had two causes: three testers were not ready to invite anyone, and two on Android hit an error. The Skip link is easy to miss. The testers were existing users, so the real stall rate may be higher.',
      findings: [
        { text: 'Setup length is not the main problem.', reason: '7 of 8 testers finished the current six steps.' },
        { text: 'The invite step is the weak point and has two different causes.', reason: '5 of 8 stalled: 3 were not ready or their flatmates were absent, 2 got an Android error.' },
        { text: 'Skip is hard to find.', reason: 'It is small grey text. 4 of the 5 who stalled took over a minute to find it, and 1 quit.' },
        { text: 'People send invites when a flatmate is physically there.', reason: 'All 3 testers who sent an invite had a flatmate in the room, and 3 testers asked how to invite later.' },
      ],
      evidence: [
        { text: '7 of 8 testers finished the current onboarding without trouble', source: 'Usability test notes (8 testers)', supports: 1 },
        { text: 'The biggest drop happens in the first session, during the six-step setup', source: 'Facilitator', supports: 1 },
        { text: '5 of 8 testers stalled when asked to invite flatmates, and most skipped it', source: 'Usability test notes (8 testers)', supports: 2 },
        { text: '3 of the 5 were not ready to invite; the other 2 were on Android and got an error when sharing', source: 'More from the usability tests', supports: 2 },
        { text: 'The invite step has not been touched since launch', source: 'Facilitator', supports: 2 },
        { text: 'The invite screen has one main button, "Share link", and a small grey "Skip" link', source: 'Facilitator', supports: 3 },
        { text: '4 of the 5 who stalled took over a minute to find Skip, and 1 quit the test', source: 'More from the usability tests', supports: 3 },
        { text: 'All 3 testers who sent an invite had a flatmate in the room; 3 of 8 asked how to invite later', source: 'More from the usability tests', supports: 4 },
      ],
      objections: [
        { text: 'The sample is 8 people.', reason: 'A pattern in 8 may not hold for real users.' },
        { text: 'The testers were recruited from existing users.', reason: 'They are more committed, so real new users may stall more.' },
        { text: 'Skipping a step in a test is not leaving the app.', reason: 'Nothing here links skipping to churn.' },
      ],
      rejected_directions: [
        { text: 'Cut onboarding to three steps (option A).', reason: '7 of 8 finished the current version, and the three-step version leaves the invite step unchanged.' },
        { text: 'Daily reminders and streaks (option B).', reason: 'Several testers said daily reminders would annoy them. A weekly summary was acceptable to 6 of 8, so it stays on the list as a small idea.' },
      ],
      open_questions: [
        { text: 'Do real new users stall at the same rate as these testers?' },
        { text: 'What happens to people who skip: do they come back?' },
        { text: 'Are the Android testers who hit the error the same people who would drop off?' },
      ],
    },
  },
  {
    who: 'dev',
    cards: ['p1', 'p2', 'p4', 'p6', 'p7', 'i01', 'i02'],
    messages: [
      { role: 'user', text: 'I added both sets of engineering notes and the ticket. How big is the Android link problem?' },
      {
        role: 'assistant',
        text: 'Your first notes say the link fails to open the app on about 1 in 3 Android phones. Your second notes say where that comes from: 12 phones from the office drawer, and on 4 of them the link opened the website instead of the app. That is a small test, so the real share could be anywhere from about a fifth to a half. Android is about 4 in 10 new users, so even at a third this touches roughly 1 in 8 sign-ups. It is worse than it sounds, though: when the link opens the website the invite code is lost, so the flatmate cannot join either.',
      },
      { role: 'user', text: 'What does the fix cost?' },
      {
        role: 'assistant',
        text: 'About three days of engineering, plus the release. iPhone review takes 1 to 2 days, but an Android release takes about a week to reach everyone. With ten working days in the sprint, the release timing is the real constraint, not the code. It would need to be submitted by around day six.',
      },
      { role: 'user', text: 'Would cutting setup to three steps fix it instead?' },
      {
        role: 'assistant',
        text: 'No. Your notes say a three-step onboarding would merge the name, currency and split-rule screens, and the invite step would stay exactly as it is. Your logs also say 9 in 10 people who reach the last step finish it. So option A shortens the part that works and leaves the failing step alone.',
      },
      { role: 'user', text: 'What are you unsure about?' },
      {
        role: 'assistant',
        text: 'Two things. The app logs that someone finished the invite step, but not whether a link was sent, opened or accepted, so nobody knows how many real users hit the broken link. And the Android bug cannot explain why iPhone users also stall at the invite step. I have nothing on the board that explains that. Both go under open questions.',
      },
      { role: 'user', text: 'Make the report.' },
    ],
    report: {
      title: 'The invite link fails on some Android phones, and fixing it is only part of the job',
      summary:
        'The invite link opens the website instead of the app on about a third of Android phones tested (4 of 12). When that happens the invite code is lost, so the flatmate cannot join either. The fix is about three days of engineering plus a release. Cutting setup to three steps would leave the invite step exactly as it is. The "third" comes from 12 phones, and the app does not log whether invite links are sent, opened or accepted.',
      findings: [
        { text: 'The Android link fails on some phones.', reason: 'It opened the website instead of the app on 4 of 12 phones tested.' },
        { text: 'A failed link breaks both sides.', reason: 'The invite code is lost, so the flatmate cannot join after installing.' },
        { text: 'The fix is small, but release takes time.', reason: 'About three days of engineering, then 1 to 2 days on iPhone review and about a week for Android to reach everyone.' },
        { text: 'After skipping, there is no way back that people would find.', reason: 'Settings, Home, Members is three taps, and nothing prompts later.' },
        { text: 'Option A does not touch the invite step.', reason: 'It merges the name, currency and split-rule screens and keeps the invite step as it is.' },
      ],
      evidence: [
        { text: 'The invite link fails to open the app on about 1 in 3 Android phones', source: 'Engineering notes', supports: 1 },
        { text: 'On 4 of 12 office phones the link opened the website instead of the app', source: 'More engineering notes', supports: 1 },
        { text: 'When the link opens the website, the invite code is lost', source: 'More engineering notes', supports: 2 },
        { text: 'The link fix is about three days of work, plus a few days for an app store release', source: 'Engineering notes', supports: 3 },
        { text: 'iPhone review takes 1 to 2 days; an Android release reaches everyone in about a week', source: 'More engineering notes', supports: 3 },
        { text: 'After a skip, the only way back is Settings, Home, Members, and nothing prompts later', source: 'More engineering notes', supports: 4 },
        { text: 'A three-step onboarding would merge the name, currency and split-rule screens and keep the invite step', source: 'More engineering notes', supports: 5 },
        { text: 'A three-step onboarding could be designed and built in about a week', source: 'Facilitator', supports: 5 },
      ],
      objections: [
        { text: '12 phones is a small test.', reason: '"A third" could be anywhere from a fifth to a half.' },
        { text: 'The app does not log sends, opens or accepts.', reason: 'Nobody knows how many real users hit the failure.' },
        { text: 'A three-day fix does not use a sprint.', reason: 'It may need to ride along with something larger.' },
      ],
      rejected_directions: [
        { text: 'Cut onboarding to three steps (option A).', reason: '9 in 10 people who reach the last step finish it, and the change leaves the failing step as it is.' },
        { text: 'Reminders and streaks (option B).', reason: 'About 40 percent of new users decline notifications, and the build is about six weeks.' },
        { text: 'A web version so flatmates can join without installing.', reason: 'Much larger than one sprint.' },
      ],
      open_questions: [
        { text: 'How many real users hit the broken link?' },
        { text: 'Why do iPhone users also stall at the invite step? The Android bug does not explain that.' },
        { text: 'Can the code fallback be built in the same three days?' },
      ],
    },
  },
  {
    who: 'asha',
    cards: ['p1', 'p3', 'p5', 'p6', 'p7', 'i20', 'i31'],
    messages: [
      { role: 'user', text: 'I added both sets of product notes and the reviews link. I need a recommendation for this sprint. What is the evidence for each option?' },
      {
        role: 'assistant',
        text: 'For A, three cards support it: the drop is in setup, a three-step version is quick, and two reviews call setup confusing. Your notes weaken the third: both of those reviews also mention the invite not working.\n\nFor B, the reminder email raised opens a little, and users who got it logged an expense about 10 percent more often. But reminders only reach people who have already added an expense, so they cannot help someone who stalls at setup.\n\nFor C, your funnel is the strongest evidence. Of 100 sign-ups, 33 are lost at the invite step, more than at any other step, and users who invite a flatmate in week one are about 4 times more likely to be active after a month.',
      },
      { role: 'user', text: 'What is the strongest case against C?' },
      {
        role: 'assistant',
        text: 'The 4 times figure compares two groups. It is not an experiment, and committed users may simply be the ones who invite. The second problem is in the funnel: "continuing" past the invite step counts both people who sent an invite and people who skipped, so it cannot say who stalled and left later. And steps 2 and 3 still lose 8 in 100, so a broader onboarding change is not worthless.',
      },
      { role: 'user', text: 'How much of the loss is the Android bug?' },
      {
        role: 'assistant',
        text: 'Less than it looks. Invite-step completion is about 7 in 10 on iPhone and under 6 in 10 on Android. Android is about 4 in 10 sign-ups, so about 37 of 100 reach the step on Android and 21 continue. If Android matched iPhone, about 26 would continue, which is 5 more. So the bug explains about 5 of the 33 lost at the step. The other 28 are lost on both platforms and are about the step itself.',
      },
      { role: 'user', text: 'What should we do about people who skip?' },
      {
        role: 'assistant',
        text: 'About 1 in 8 people who skip invite later, and most of them do it right after adding their first expense. That suggests the first expense is the moment to ask again: the person has just seen the app do something useful. The note on the board about moving the invite to after the first expense goes in that direction, though moving the whole step is a bigger change than prompting there.',
      },
      { role: 'user', text: 'Make the report.' },
    ],
    report: {
      title: 'Inviting a flatmate is the strongest retention signal we have',
      summary:
        'Of 100 sign-ups, 33 are lost at the invite step, more than at any other, and 53 of the 60 who stop never finish setup. People who invite a flatmate in week one are about 4 times more likely to still be active after a month, though that comparison is not an experiment. The two "confusing" reviews also mention the invite. Reminders cannot reach people who stall in setup. The Android difference explains only about 5 of the 33.',
      findings: [
        { text: 'The invite step is where most people leave.', reason: '33 of 100 are lost there, and 53 of the 60 who stop leave during setup.' },
        { text: 'Inviting predicts staying.', reason: 'Week-one inviters are about 4 times more likely to be active after a month.' },
        { text: 'The Android bug is a small part of the loss.', reason: 'Completion is about 7 in 10 on iPhone and under 6 in 10 on Android, which accounts for about 5 of the 33.' },
        { text: 'People who skip rarely come back, and when they do it is right after the first expense.', reason: 'About 1 in 8 who skip invite later, mostly right after adding an expense.' },
        { text: 'The "confusing" reviews are about invites.', reason: 'Both also say the invite did not work.' },
      ],
      evidence: [
        { text: 'Of 100 sign-ups, 59 pass the invite step; the step loses 33 of the 60 who stop', source: 'More product notes (setup funnel)', supports: 1 },
        { text: 'The biggest drop happens in the first session, during the six-step setup', source: 'Facilitator', supports: 1 },
        { text: 'Users who invite a flatmate in week one are about 4 times more likely to be active after a month', source: 'Product notes', supports: 2 },
        { text: 'Invite-step completion is about 7 in 10 on iPhone and under 6 in 10 on Android', source: 'More product notes', supports: 3 },
        { text: 'About 1 in 8 who skip the invite invite later, mostly right after their first expense', source: 'More product notes', supports: 4 },
        { text: 'Two app-store reviews this month call setup "confusing"', source: 'Facilitator', supports: 5 },
        { text: 'Both of those reviews also mention the invite not working', source: 'Product notes', supports: 5 },
      ],
      objections: [
        { text: 'The 4 times figure is a correlation.', reason: 'Committed users may simply be the ones who invite.' },
        { text: 'Skipping and stalling are counted together as "continuing".', reason: 'The funnel cannot say who stalled and left.' },
        { text: 'A broader onboarding fix might still help other steps.', reason: 'Steps 2 and 3 lose 8 in 100, small but not zero.' },
      ],
      rejected_directions: [
        { text: 'Reminders and streaks (option B).', reason: 'Reminders only reach people who have already added an expense, and the one reminder test lifted opens and expense logging only among users who were already active.' },
        { text: 'Cut onboarding to three steps (option A).', reason: 'The evidence puts the exit at the invite step, not at the length of setup.' },
        { text: "Copying a competitor's streaks.", reason: "One reviewer's praise is not evidence." },
      ],
      open_questions: [
        { text: 'Does inviting cause retention, or only mark committed users?' },
        { text: 'Why do iPhone users, who are not affected by the link bug, still skip or stall at 3 in 10?' },
        { text: 'What share of week-one inviters invite after the first expense instead of at setup?' },
      ],
    },
  },
];

// ---------- v3 section 10: the decision card, the expanded view of D1 ----------

export const D1_RICH = {
  because: [
    'People stall at the invite step: 5 of 8 testers, and 33 of every 100 sign-ups are lost there, more than any other step (Kavya, Asha).',
    'The invite link is broken for about a third of Android phones tested, and a failed link also stops the flatmate from joining (Dev).',
    'Inviting is the strongest retention signal: week-one inviters are about 4 times more likely to be active after a month (Asha).',
    'The Android bug explains only about 5 of the 33 lost, so fixing the link alone would not be enough. The rest is the step itself: people are not ready to invite, Skip is hard to find, and there is no way back (Kavya, Dev, Asha).',
    'Most people who invite later do it right after their first expense, so that is where to prompt (Asha).',
    'The reviews calling setup confusing also say the invite did not work (Asha).',
    'The invite step has not been touched since launch, so it is likely overdue.',
  ],
  setAside: [
    'Cut onboarding to three steps. 7 of 8 testers finished the current version, 9 in 10 who reach the last step finish, and the change leaves the invite step as it is. Revisit once the invite step is fixed.',
    'Reminders and streaks. About six weeks of work, past this sprint. 40 percent of new users decline notifications, reminders only reach people who have already added an expense, and testers said daily reminders would annoy them. A weekly summary stays on the list for a later sprint.',
    'Moving the invite out of setup entirely (C3) and a web version for flatmates. Too large or too uncertain for this sprint. Test moving the invite later with the new logs.',
  ],
  followUps: [
    'Check the share of week-one inviters before and after the release, split by phone type.',
    'Run five more usability tests on Android with real new sign-ups.',
    'Compare week-four activity for inviters and non-inviters (idea I33).',
    'Next sprint, test hiding the invite for half of new users (idea I34) and moving it to after the first expense.',
    'Find out why iPhone users also stall at the invite step.',
  ],
  effort:
    'Part 1, make it work: about 3 days of engineering (ideas I01, I02, I39). Part 2, easier to skip and to come back to: about 2 days of design and 1 day of engineering (ideas I03, I20 in its lighter form). Part 3, measure: log sends, opens and accepts (idea I31). The sprint has ten working days, and an Android release takes about a week to reach everyone, so submit by day 6 at the latest.',
  writtenBy: 'Asha, Dev and Kavya',
  unknowns: 'The "third" comes from 12 phones, the testers were more committed than new users, and the 4 times figure is a correlation.',
};

// ---------- v3 Part 2 section 4: the seven decisions on the finished example ----------

export const MEETING_CHIP = {
  id: 'ctx-planning-call',
  type: 'meeting' as const,
  title: 'Sprint planning call',
  // A meeting chip's source holds only the meeting name. The full text is never seeded (private).
  source: 'Sprint planning call',
  summary:
    'A planning call after the group chose to fix the invite step. It covers who owns the link and the Skip button, the Android release deadline, what is out of this sprint, and what to log.',
  by: 'meera' as PersonKey,
  hoursBefore: 49,
};

export interface CaseDecision {
  /** Stable id in the doc: 'd_sb1' to 'd_sb7'. */
  id: string;
  key: `D${1 | 2 | 3 | 4 | 5 | 6 | 7}`;
  text: string;
  reasons: string;
  /** The section it covers. Seeded after the sections, so the id resolves. */
  sectionId?: string;
  by: PersonKey;
  via: 'person' | 'meeting';
  hoursBefore: number;
  /** Whose approved reports sit behind it. */
  reports: Role[];
  sourceNoteIds: string[];
  rich?: typeof D1_RICH;
  reopened?: { by: PersonKey; hoursBefore: number };
}

/** Seven records, six in force and one reopened (D7). Listed in force newest first: D6, D5, D4, D1, D3, D2, then D7. */
export const DECISIONS: CaseDecision[] = [
  {
    id: 'd_sb2',
    key: 'D2',
    text: 'Retained means a second expense within 7 days of sign-up. About 4 in 10 new users are retained today.',
    reasons: 'One shared definition, so every test and report counts the same thing.',
    by: 'asha',
    via: 'person',
    hoursBefore: 120,
    reports: [],
    sourceNoteIds: [],
  },
  {
    id: 'd_sb3',
    key: 'D3',
    text: 'Pricing, branding and dark mode are not part of this sprint.',
    reasons: 'None of the three touches week-one drop-off.',
    sectionId: 's-park',
    by: 'meera',
    via: 'person',
    hoursBefore: 96,
    reports: [],
    sourceNoteIds: ['i36', 'i37', 'i38'],
  },
  {
    id: 'd_sb1',
    key: 'D1',
    text: 'Fix the invite step this sprint (option C), in three parts: make the link work and add a typed group code; make Skip clear and prompt an invite after the first expense; log whether each invite is sent, opened and accepted.',
    reasons: '33 of every 100 sign-ups are lost at the invite step. The Android bug explains only about 5 of the 33, so fixing the link alone would not be enough.',
    by: 'meera',
    via: 'person',
    hoursBefore: 72,
    reports: ['kavya', 'dev', 'asha'],
    sourceNoteIds: ['i01', 'i02', 'i03', 'i31', 'i39'],
    rich: D1_RICH,
  },
  {
    id: 'd_sb4',
    key: 'D4',
    text: 'No reminders or streaks this sprint. A weekly summary stays on the list for a later sprint.',
    reasons:
      'Reminders take about six weeks and about 40 percent of new users decline notifications. Testers disliked daily reminders and were fine with a weekly summary.',
    sectionId: 's-ret',
    by: 'meera',
    via: 'meeting',
    hoursBefore: 48,
    reports: [],
    sourceNoteIds: [],
  },
  {
    id: 'd_sb5',
    key: 'D5',
    text: 'Submit the Android release by day six of the sprint, at the latest.',
    reasons: 'An Android release takes about a week to reach everyone, and the sprint has ten working days.',
    by: 'meera',
    via: 'meeting',
    hoursBefore: 47.98, // a minute apart, so the list reads D6, D5, D4
    reports: [],
    sourceNoteIds: [],
  },
  {
    id: 'd_sb6',
    key: 'D6',
    text: 'Dev owns the link fix and the typed group code. Kavya owns the Skip button and the invite preview.',
    reasons: 'Matches the three-day engineering estimate and the two-day design estimate.',
    by: 'meera',
    via: 'meeting',
    hoursBefore: 47.96,
    reports: [],
    sourceNoteIds: [],
  },
  {
    id: 'd_sb7',
    key: 'D7',
    text: 'Move the invite step to after the first expense in this sprint.',
    reasons: 'Most people who invite later do it right after their first expense.',
    by: 'kavya',
    via: 'person',
    hoursBefore: 70,
    reports: [],
    sourceNoteIds: ['i11', 'i20'],
    reopened: { by: 'dev', hoursBefore: 36 },
  },
];
