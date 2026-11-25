# Split Buddy demo boards: spec

Purpose: give the thesis prototype two ready-made boards for the same fictional problem. One is unsolved, for people to work through live. One is fully solved, for showing what a finished session looks like. This file holds the research reasoning, the case content, every fact, the pretend AI chats, the reports, the decision card, and notes for building the fixtures.

Note for Claude Code: read the whole file first. Inspect the existing board data model before writing any fixture, and adapt the structure in section 11 to what the app already stores. Do not invent new features. Section 1b lists the features the demo should exercise and where each one came from. Some were cut from the Sprint PRD and later re-added by the owner (whiteboard with AI alongside, context input, multiplayer), so check the codebase and drop any part of a fixture that has no matching feature. Features that are cut (locked decisions, overlap view, chip editing, report editing, voice, images, outside tool connections) stay cut.

---

## 1. Context

The product is an AI-native collaborative brainstorming whiteboard built on the Nominal Group Technique. The loop: frame the problem, silent generation (a person takes cards into a private AI exploration), sharing (an approved report lands on the board), clarification (teammates read the reasoning), decision (the group records a decision with its reasons).

The core claim being tested: context follows the idea. A private AI exploration starts from the shared board, and what comes back is a structured report with reasons, not a single note.

Users are members of product, design and engineering teams. The demo case therefore uses exactly those three roles.

AI rules for the demo (from the Sprint PRD): the AI uses only the context in the chips and what the user types, gives a reason for every finding, objection and rejected direction, puts anything uncertain under open questions, drafts only, never publishes to the board and never records a decision.

---

## 1b. Features the demo must exercise

Source key: PRD means the Sprint PRD for Review 3. Owner means features described in chat that are not in the Sprint PRD. Verify every row against the codebase.

| Feature | Source | Status | Where the demo uses it |
|---------|--------|--------|------------------------|
| Board with the problem statement fixed at the top, in sections (frame, context, ideas, reports, decision) | PRD interface spec, owner | Built (verify section names) | Unsolved board starts with the frame filled. Solved board fills every section |
| Sticky notes: add, select, author name | PRD | Built | Six public notes, plus idea notes from three people (9.1b) |
| AI that brainstorms alongside people while they whiteboard | Owner | Re-added (verify) | Three AI-suggested notes, marked as AI (9.1b) |
| Select sticky notes and ask the AI for its opinion | Owner | Re-added (verify). May be the same action as Take cards with you, in which case merge the two | One quick ask on two notes (9.1b) |
| Context input: add context as plain text or links | Owner. "Drop anything in" was cut from the PRD | Re-added, links and plain text only (verify) | Board-level project context (4.1, 9.0). Personal context that each person adds (7.3) |
| Context chips | PRD FR-2, read-only in the sprint | Built | Every exploration shows project context, cards and added context |
| Take cards with you, Explore this | PRD | Built | Each exploration |
| Private canvas chat, one real model call per message | PRD | Built | The three chats |
| Make report into the fixed template, reason on every item | PRD | Built | The three reports |
| Approve | PRD | Built | Reports land on the board |
| Report view: summary on top, collapsible sections, teammate name | PRD | Built | Reports section |
| Decision card | PRD | Mock | Static card (9.6) |
| Multiplayer with temporary profiles, no accounts | Owner | Re-added (verify). Replaces the viewer switch, which stays as a solo fallback | Three authors on notes and reports |
| Reservation dot | PRD core in the concept, cut in the sprint | Verify | Optional: a dot on cards while someone explores them |

Cut and not shown: locked decisions, overlap view, chip editing, report editing, voice, images, outside tool connections (MCP).

---

## 2. Research basis

These are the papers and guides behind the scenario design.

- McGrath (1984), typology of group tasks. Group tasks have four goals: generating, choosing, negotiating, executing. The product loop is generate then choose, so the task needs an open exploration part and a decision at the end.
- Task selection and design for group support research (Indiana University essay). Key rules: keep the scenario within participants' existing knowledge, give each person a defined role (it encouraged information sharing), make sure people feel a real stake, pilot test because pilots showed participants were often not engaged, and choose a task with a demonstrably correct answer if you want to score decision quality. Hidden profile tasks split information so no single member can solve the problem alone.
- Stasser and Titus, hidden profile paradigm. Groups often fail to pool information that only one member holds, and over-discuss what everyone already knows.
- Bringing Everyone to the Table (arXiv 2508.08242), an experiment with an LLM facilitating hidden profile groups. Template used here: three options, 30 facts, each member holding only some of them, fictional content, scored mainly by how many distinct facts the group surfaced. Fictional content matters because it stops the AI answering from general knowledge.
- Hocking and Vernon (2017), structured techniques on an ill-defined problem. Structured techniques raised the number of ideas on an ambiguous problem but lowered quality. Lesson: do not make the problem too vague, and measure quantity and quality separately.
- Reiter-Palmon and Murugavel (2018), team problem construction. Three-person teams solving a realistic problem who restated the problem before solving it reported more satisfaction and less conflict, with only a marginal gain in originality. Lesson: include an explicit restate step. It maps to the Frame step.
- Human-AI brainstorming studies. In one experiment (n = 75), people supported by an LLM did not perform better individually than people alone, and the authors describe "smart loafing". Another large experiment (800+ participants) found AI ideas raised collective diversity but not individual creativity. Lesson: record how much people write before they first ask the AI.
- Nominal Group Technique guides (University of South Carolina and others). Works best with 4 to 10 people. The demo uses 1 to 4, so it is a scaled-down version, and the thesis should say so.

Rejected task types: classic ranking exercises such as Lost on the Moon (famous answer, no context to carry, only 15 items), and abstract creativity prompts (no background, so they cannot test context carrying).

---

## 3. Design rules that follow

1. Use a hidden profile structure. Each person holds private facts that only matter when combined. This tests exactly what the product claims.
2. Use fictional content with specific numbers. The AI cannot answer from world knowledge, so any use of the numbers proves the context chips were used.
3. Use three options, one clearly best when all facts are combined, and a tempting wrong answer when facts are viewed one person at a time.
4. Keep it easy to understand. Plain consumer app, three roles, no jargon.
5. Include a restate step first.
6. Score on facts surfaced and reasons attached, not only on which option was picked.

---

## 4. The case

Frame text for the board:

> Split Buddy is a fictional app for splitting shared bills between flatmates. Six in ten new users stop using Split Buddy within the first week. The team can ship one fix this sprint. Which one?

Design question shown under it:

> How might we keep more new users past their first week?

Options (shown as three option cards in the Frame section):

- A. Cut onboarding from six steps to three.
- B. Add reminders and streaks to bring people back.
- C. Fix the "invite your flatmates" step.

Step 1 on the board is a restate: each person writes the problem in their own words on a card, about two minutes.

The correct answer, once all facts are combined, is C. Option A is the decoy.

### 4.1 Project context (board-level, not scored)

Added once through the context input and visible to every exploration. It is background only. It adds no scored facts and does not favour any option. It uses the same two input types the app supports: plain text and links.

Text item 1, titled "About Split Buddy":

> Split Buddy is a mobile app for flatmates. People log shared expenses, such as rent, groceries and internet, and the app shows who owes whom. A new user goes through a six-step setup: 1 sign up, 2 name your home, 3 choose a currency, 4 invite flatmates, 5 add your first expense, 6 choose split rules.

Text item 2, titled "This sprint":

> Team: Asha (product manager), Dev (software engineer), Kavya (product designer). One two-week sprint. We can ship one fix. Goal: more new users still using Split Buddy after their first week.

Text item 3, titled "How we measure it":

> A new user counts as retained if they log a second expense within 7 days of signing up. Right now about 4 in 10 new users are retained, so about 6 in 10 stop.

Link item, titled "Setup funnel dashboard (week-one drop-off)":

> https://splitbuddy.example/dashboard/setup-funnel (fictional placeholder). Pair it with a one-line text excerpt: "The biggest drop happens in the first session, during setup."

The invite step is step 4 of the six. That is background, not a scored fact, and it is worded neutrally.

---

## 5. The facts

Each fact is tagged with the option it bears on and its value: +1 supports the option, -1 counts against it, 0 is neutral.

### 5.1 Public facts (six cards on the board, visible to everyone)

| ID | Fact | Option | Value |
|----|------|--------|-------|
| P1 | The biggest drop happens in the first session, during the six-step setup. | A | +1 |
| P2 | A three-step onboarding could be designed and built in about a week. | A | +1 |
| P3 | Two app-store reviews this month call setup "confusing". | A | +1 |
| P4 | A reminders and streaks system would take about six weeks, past this sprint. | B | -1 |
| P5 | A reminder email test last quarter got a small bump in opens. | B | +1 |
| P6 | The invite step has not been touched since launch. | C | 0 |

### 5.2 Private facts, held by role

Product designer (Kavya)

| ID | Fact | Option | Value |
|----|------|--------|-------|
| DES1 | In 8 usability tests of the current onboarding, 7 people finished it without trouble. | A | -1 |
| DES2 | In the same tests, 5 of 8 stalled when asked to invite flatmates, and most skipped it. | C | +1 |
| DES3 | Several testers said daily reminders would annoy them. | B | -1 |
| DES4 | Redrawing the invite screen is about two days of design work. | C | 0 |

Software engineer (Dev)

| ID | Fact | Option | Value |
|----|------|--------|-------|
| ENG1 | In the logs, 9 in 10 users who reach the last onboarding step finish it. | A | -1 |
| ENG2 | The invite link fails to open the app on about 1 in 3 Android phones. | C | +1 |
| ENG3 | Reminders only work if people allow notifications, and about 40 percent of new users decline. | B | -1 |
| ENG4 | The link fix is about three days of work, plus a few days for an app store release. | C | 0 |

Product manager (Asha)

| ID | Fact | Option | Value |
|----|------|--------|-------|
| PM1 | Both reviews calling setup "confusing" also mention the invite not working. | A | -1 |
| PM2 | Users who invite at least one flatmate in week one are about 4 times more likely to still be active after a month. | C | +1 |
| PM3 | Early users who got the reminder email logged an expense about 10 percent more often. | B | +1 |
| PM4 | Reminders only reach people who have already added an expense, so they cannot help someone who stalls at setup. | B | -1 |

Names Asha (product manager) and Dev (software engineer) match the thesis personas. Kavya is new.

---

## 6. Scoring check

Totals by option, adding every fact:

- Option A: P1 +1, P2 +1, P3 +1, DES1 -1, ENG1 -1, PM1 -1 = 0
- Option B: P4 -1, P5 +1, DES3 -1, ENG3 -1, PM3 +1, PM4 -1 = -2
- Option C: P6 0, DES2 +1, DES4 0, ENG2 +1, ENG4 0, PM2 +1 = +3

Public view only: A +3, B 0, C 0.

Each role's own view (public facts plus that role's four private facts):

| Role | A | B | C |
|------|---|---|---|
| Designer | +2 | -1 | +1 |
| Engineer | +2 | -1 | +1 |
| Product manager | +2 | 0 | +1 |

So from any single seat, A looks best. Combined, C wins by 3 over A and 5 over B.

Two-person limitation: any two briefs together give A +1 and C +2, so C already leads. A two-person session is an easier version of the task. Say so in the thesis.

---

## 7. People and role distribution

### 7.1 Unsolved board (1 to 4 people)

| People | Who holds what |
|--------|----------------|
| 1 | One person holds all three briefs. They read back their own reports through the viewer switch. |
| 2 | One person holds two briefs, the other holds one. Easier than the designed case (see section 6). Suggested split: Person 1 holds product manager plus designer, Person 2 holds engineer. |
| 3 | One brief each: designer, engineer, product manager. This is the designed case. |
| 4 | Three people hold one brief each. The fourth is the Lead (persona: Meera). The Lead holds no private facts, reads the reports, and owns the decision card. This tests the stakeholder reading path. |

Join flow: temporary profile, no account creation. On join, a person picks or is assigned a role (Kavya, Dev, Asha, or Meera in a four-person run).

### 7.3 How private facts are delivered

Private facts are not auto-loaded. They are delivered through the context input, so the demo exercises that feature.

Each role gets a handout with one text note and one link:

| Role | Text note (copy the four facts from 5.2) | Link (fictional placeholder) |
|------|-------------------------------------------|------------------------------|
| Kavya, designer | "Usability test notes": DES1 to DES4 | "Usability test recordings", https://splitbuddy.example/research/usability-tests |
| Dev, engineer | "Engineering notes": ENG1 to ENG4 | "Invite link bug ticket", https://splitbuddy.example/tickets/invite-link |
| Asha, product manager | "Product notes": PM1 to PM4 | "App store reviews, this month", https://splitbuddy.example/reviews/this-month |

Start each text note with an intro line, for example: "You are Kavya, the product designer on the Split Buddy team. These are your usability test notes."

In a live session, each person pastes their note and adds their link through the context input in their private canvas before asking the AI anything. For a quick demo, pre-add them.

Check whether the app fetches link content. If it does, make sure a failed fetch degrades gracefully, and keep every fact in the plain text note. If it does not fetch, the link works as a reference label only. Either way the facts must live in the text.

Only that person's exploration can see their handout.

### 7.2 Solved board (3 people)

Kavya (product designer), Dev (software engineer), Asha (product manager). All three explorations, reports and the decision card are present. No Lead.

---

## 8. Unsolved board spec

Same problem and same facts as the solved board. Nothing has been produced yet.

Sections, in order:

1. Frame
   - Problem card with the frame text and design question from section 4.
   - Three option cards (A, B, C).
   - A "Restate the problem" prompt, with space for one card per person.
2. Context (the context window or panel, whichever the app has)
   - Empty at the start. The project context from 4.1 is added through the context input, either by the facilitator before the session or live as the first task. Offer both. The live version tests the input.
3. Ideas
   - The six public facts as cards: P1 to P6.
   - Space for people to add their own sticky notes. If the AI-alongside feature is built, AI-suggested notes appear here marked as AI.
4. Reports
   - Empty.
5. Decision
   - Empty decision card slot. This is a mock in the sprint, so a static empty card is fine.

Private context (not on the shared board):

- Each role has a handout with its four private facts as a text note plus one link (section 7.3). Nothing is pre-loaded. Each person adds their handout through the context input in their private canvas.
- Only that person's exploration can see their handout. Other people on the board cannot.

Behaviour required:

- Add context through the context input (plain text and links), at board level and personally.
- Add sticky notes, and select notes to ask the AI for its opinion.
- Select cards, take them to a private canvas. Chips show the project context, the selected cards and the person's added context.
- Chat with the AI, make a report, approve, report lands in the Reports section with the contributor's name.
- Viewer switch to read others' reports.

Reset: provide a way to restore this board to its starting state without redeploying, for example a "Start a fresh case" action.

---

## 9. Solved board spec

Everything in the unsolved board, plus the content below. Same board, same cards, same briefs.

### 9.0 Project context (already added)

The four items from 4.1 are present in the context window: three text items ("About Split Buddy", "This sprint", "How we measure it") and one link ("Setup funnel dashboard"). Each exploration below shows them as chips.

### 9.1 Restate cards (Frame section)

- Kavya: "New users are not sticking. We need to find what makes them leave in week one and fix one thing this sprint."
- Dev: "Six in ten new users are gone within a week. We need the one change that keeps the most of them."
- Asha: "Most new users never become regular users. We have one sprint, so which single fix is worth it?"

### 9.1b Sticky notes, AI suggestions and a quick ask

The Ideas section holds the six public facts (P1 to P6), plus these idea notes. They are background for the demo and are not scored. Each note shows its author, since three temporary profiles are in the session.

| Note | Author | Leans toward |
|------|--------|--------------|
| Merge steps 2 and 3 into one screen | Kavya | A |
| Let people share the invite from their usual group chat | Dev | C |
| Weekly "who owes what" summary push | Asha | B |
| Add a progress bar across setup | AI (suggested while people whiteboarded) | A |
| Show a preview of what flatmates will see before sending the invite | AI | C |
| Celebrate the first logged expense with a short message | AI | B |

The three AI notes use the AI colour role so people can tell them from human notes. The AI wrote them from the project context and the public cards only. It had no access to anyone's private notes.

Quick ask (select sticky notes, ask the AI for its opinion). Asha selects "Merge steps 2 and 3 into one screen" and "Add a progress bar across setup":

> **Asha:** What do you think of these two?
>
> **AI:** Both aim to make setup feel shorter. From the board I know the biggest drop happens in the first session during setup, but not which step loses people, so I cannot say whether shortening helps. Merging steps 2 and 3 removes a real screen. A progress bar changes how long setup feels, not how long it is. I would treat both as unproven until we know where people leave. Open question: which step has the biggest drop.

If the app treats this as the same action as Take cards with you, fold this exchange into Asha's exploration instead.

### 9.2 Exploration 1: Kavya (product designer)

Cards taken: P1, P2, P3, P6.

Context chips shown:
- Problem: Split Buddy week-one drop-off, one fix this sprint
- Card: The biggest drop happens in the first session, during the six-step setup
- Card: A three-step onboarding could be built in about a week
- Card: Two app-store reviews this month call setup "confusing"
- Card: The invite step has not been touched since launch
- Project context: About Split Buddy, This sprint, How we measure it, Setup funnel dashboard link
- Added by Kavya through the context input: text note "Usability test notes" (DES1 to DES4) and link "Usability test recordings"

Chat:

> **Kavya:** I added my usability notes and the recordings link. I want to check whether simplifying onboarding is actually the right fix. What does this context say?
>
> **AI:** Three cards point toward onboarding: the biggest drop is during setup, a three-step version could ship in about a week, and two reviews call setup confusing. Your usability notes complicate that. 7 of 8 testers finished the current onboarding without trouble. Those two things do not fit together neatly. Either people leave at one specific step rather than across setup, or testers behave differently from real users. I cannot tell which from what I have.
>
> **Kavya:** Where in setup could people be leaving?
>
> **AI:** Your notes say 5 of 8 testers stalled when asked to invite flatmates, and most skipped it. The board also says the invite step has not been touched since launch. That makes it a candidate. I only have 8 testers, and nothing here says whether skipping the invite leads to leaving the app, so I will list that as an open question.
>
> **Kavya:** Give me the strongest case against focusing on the invite step.
>
> **AI:** Four objections. First, 8 testers is a small sample. Second, skipping a step in a test is not the same as leaving the product. Third, a three-step onboarding might remove the invite friction as a side effect, so the broad fix could cover it. Fourth, the cards say the drop is in setup as a whole, and the invite is one step of six.
>
> **Kavya:** What about reminders and streaks?
>
> **AI:** Your notes say several testers said daily reminders would annoy them. The cards add that the build would take about six weeks, past this sprint, and the one reminder test so far only raised email opens. Opens are not the same as people coming back. I would list this as set aside, with those reasons.
>
> **Kavya:** Okay, make the report.

Report (approved by Kavya):

- Header: "Onboarding finishes fine; the invite step is where people stall". Contributor: Kavya, product designer. Cards used: P1, P2, P3, P6 plus designer notes. Status: approved.
- Summary: Simplifying onboarding looks less promising than it first appears. In usability tests, 7 of 8 people finished the current setup without trouble. The step where people stalled was inviting flatmates (5 of 8). The invite step is also the one part nobody has touched since launch. Recommend looking at the invite step first. The evidence comes from only 8 testers.
- Findings:
  1. The current onboarding is mostly completable. Reason: 7 of 8 testers finished it without trouble.
  2. The invite step is the weak point. Reason: 5 of 8 testers stalled there and most skipped it, and it has not changed since launch.
- Evidence: usability test notes (8 testers); board cards on the setup drop, the three-step estimate, the two reviews, and the untouched invite step.
- Objections:
  1. The sample is small (8 testers). Reason: a pattern in 8 people may not hold for real users.
  2. Skipping a step in a test is not leaving the app. Reason: no data here links skipping to churn.
  3. A broader simplification could cover the invite step as well. Reason: if the invite is one of the steps removed, the three-step version might fix it for free.
- Rejected directions:
  1. Reminders and streaks. Reason: several testers said daily reminders would annoy them, it needs about six weeks, and the only evidence so far is a small rise in email opens.
  2. Cut onboarding to three steps (set aside for now). Reason: 7 of 8 testers finished the current version, so length does not look like the problem.
- Open questions:
  1. Do people who skip the invite leave the app?
  2. Is the stall about the screen, or something behind it? Not clear from usability tests alone.
  3. Does the 8-tester pattern match real users' behaviour?

### 9.3 Exploration 2: Dev (software engineer)

Cards taken: P1, P2, P4, P6.

Context chips shown:
- Problem: Split Buddy week-one drop-off, one fix this sprint
- Card: The biggest drop happens in the first session, during the six-step setup
- Card: A three-step onboarding could be built in about a week
- Card: A reminders and streaks system would take about six weeks
- Card: The invite step has not been touched since launch
- Project context: About Split Buddy, This sprint, How we measure it, Setup funnel dashboard link
- Added by Dev through the context input: text note "Engineering notes" (ENG1 to ENG4) and link "Invite link bug ticket"

Chat:

> **Dev:** I added my engineering notes and the ticket link. Look at options A and C from the engineering side.
>
> **AI:** On A, the card says a three-step onboarding could be built in about a week. Your logs say 9 in 10 users who reach the last onboarding step finish it. That means people leave before the last step, not at it. Shortening could help only if the exit points are among the removed steps, and the context does not say which steps people leave at. On C, your notes say the invite link fails to open the app on about 1 in 3 Android phones. If the invite flow depends on that link, a third of Android users cannot complete it. I do not have the share of users on Android, so I cannot size the effect.
>
> **Dev:** What would fixing the link take?
>
> **AI:** About three days of work, plus a few days for an app store release. Both fit in a sprint, but "a few days" is not exact, so the release is the main schedule risk.
>
> **Dev:** What are the objections to prioritising the link fix?
>
> **AI:** It only helps Android users, and I do not know how many there are. It would not help anyone who leaves before the invite step. It does not explain whether the failed links are what makes people leave. And the release timing could slip past the sprint.
>
> **Dev:** And reminders?
>
> **AI:** Your notes say reminders need notification permission and about 40 percent of new users decline. So reach is capped at around 60 percent even if it worked perfectly. On top of that, the cards say it takes about six weeks. I would list it as set aside for both reasons.
>
> **Dev:** Make the report.

Report (approved by Dev):

- Header: "The invite link fails for a third of Android users, and onboarding is not where most people leave". Contributor: Dev, software engineer. Cards used: P1, P2, P4, P6 plus engineer notes. Status: approved.
- Summary: Users who reach the last onboarding step almost always finish it (9 in 10), so people are leaving earlier in setup, not at the end. Separately, the invite link fails to open the app on about 1 in 3 Android phones. Fixing it is about three days of work plus a few days for an app store release. The share of users on Android is unknown.
- Findings:
  1. Most people who reach the end of onboarding finish it. Reason: 9 in 10 do, per the logs.
  2. The invite link is broken for a large slice of Android users. Reason: it fails to open the app on about 1 in 3 Android phones.
  3. The link fix fits the sprint, with a release risk. Reason: about three days of work plus a few days for an app store release.
- Evidence: onboarding completion logs; invite link failure data; board cards on the setup drop, the three-step estimate, the six-week reminders build, and the untouched invite step.
- Objections:
  1. It only helps Android users. Reason: the Android share of all users is not known.
  2. It does not help people who leave before the invite step. Reason: logs show exits happen before the last step.
  3. The release timing is vague. Reason: "a few days" for the app store could push past the sprint.
- Rejected directions:
  1. Reminders and streaks. Reason: about 40 percent of new users decline notifications, so reach is limited, and the build takes about six weeks.
  2. Cut onboarding to three steps (set aside for now). Reason: people who reach the end finish it, and nothing says which of the removed steps people actually leave at.
- Open questions:
  1. What share of users are on Android?
  2. At which step do people actually leave?
  3. Are the users who hit the failed link the same users who drop off?

### 9.4 Exploration 3: Asha (product manager)

Cards taken: P1, P3, P5, P6.

Context chips shown:
- Problem: Split Buddy week-one drop-off, one fix this sprint
- Card: The biggest drop happens in the first session, during the six-step setup
- Card: Two app-store reviews this month call setup "confusing"
- Card: A reminder email test last quarter got a small bump in opens
- Card: The invite step has not been touched since launch
- Project context: About Split Buddy, This sprint, How we measure it, Setup funnel dashboard link
- Added by Asha through the context input: text note "Product notes" (PM1 to PM4) and link "App store reviews, this month"

Chat:

> **Asha:** I added my product notes and the reviews link. I need a recommendation for this sprint. What is the evidence for each option?
>
> **AI:** For A, three cards support it: the drop is in setup, a three-step version is quick, and two reviews call setup confusing. Your notes weaken the third. Both of those reviews also mention the invite not working, so they may be about the invite rather than the length of setup. For B, the board says the reminder email raised opens a little, and your notes say users who got it logged an expense about 10 percent more often. But reminders only reach people who have already added an expense, so they cannot help someone who stalls at setup. For C, the strongest signal is your retention data: users who invite at least one flatmate in week one are about 4 times more likely to be active after a month.
>
> **Asha:** What is the strongest case against C?
>
> **AI:** That is correlation, not cause. People who invite flatmates may simply be the more committed users. I also have no data here on why people fail to invite, whether it is the screen, a bug, or something else. And a broader onboarding fix might still help steps other than the invite.
>
> **Asha:** Make the report.

Report (approved by Asha):

- Header: "Inviting a flatmate is the strongest retention signal we have". Contributor: Asha, product manager. Cards used: P1, P3, P5, P6 plus product manager notes. Status: approved.
- Summary: Users who invite at least one flatmate in week one are about 4 times more likely to still be active after a month. The two reviews calling setup "confusing" also mention the invite not working, so they may be about invites, not setup length. Reminders cannot reach people who stall at setup. Recommend putting the invite step first. Causation is unproven.
- Findings:
  1. Inviting predicts staying. Reason: invited-flatmate users are about 4 times more likely to be active after a month.
  2. The "confusing" reviews point at invites. Reason: both also mention the invite not working.
  3. Reminders reach the wrong people. Reason: only users who have already added an expense receive them. The email test raised expense logging by about 10 percent among those users.
- Evidence: week-one invite versus one-month activity data; the two app-store reviews; reminder email test results; board cards on the setup drop and the untouched invite step.
- Objections:
  1. This is correlation, not cause. Reason: committed users may invite more.
  2. There is no data here on why people fail to invite. Reason: it could be design, a bug, or both.
  3. A broader onboarding change might help other steps. Reason: the drop is described as happening across setup.
- Rejected directions:
  1. Reminders and streaks. Reason: they only reach people who already added an expense, so they cannot help people stuck at setup, and the only test showed a small rise in opens.
  2. Cut onboarding to three steps as proposed. Reason: the reviews that suggested it also mention the invite not working, so it would address a different problem.
- Open questions:
  1. Does inviting cause retention, or does it only mark committed users?
  2. Why do people fail to invite: the screen, the link, or both?
  3. How many new users currently invite anyone in week one?

### 9.5 Reports section on the board

Three approved report cards, each showing the contributor's name, title, and summary at the top, with the sections collapsible below. Order: Kavya, Dev, Asha.

### 9.6 Decision card (written by the group, not the AI)

- Title: Decision: fix the invite step this sprint (option C)
- Recorded by: Asha, Dev, Kavya
- Direction: Redraw the invite screen and fix the invite link on Android.
- Reasons:
  1. People stall at the invite step. 5 of 8 usability testers stalled there and most skipped it (Kavya).
  2. The invite link is broken for about a third of Android phones (Dev).
  3. Inviting is the strongest retention signal. Users who invite a flatmate in week one are about 4 times more likely to be active after a month (Asha).
  4. The reviews calling setup confusing also mention the invite not working (Asha).
  5. The invite step has not been touched since launch, so it is likely overdue.
- Set aside:
  - Cut onboarding to three steps. 7 of 8 testers finished the current version and 9 in 10 who reach the last step finish. The setup drop is real, but the evidence puts the exit at the invite step and not at the length of onboarding.
  - Reminders and streaks. About six weeks of work, past this sprint. 40 percent of new users decline notifications, and reminders only reach people who have already added an expense, so they cannot help people who stall at setup. Testers also said daily reminders would annoy them.
- Effort: about two days of design, about three days of engineering, plus a few days for the app store release.
- Follow-ups: measure the share of new users who invite a flatmate in week one before and after; find the Android share of users; test whether inviting causes retention or only marks committed users.
- Reports behind this decision: Kavya, Dev, Asha (linked).

The decision card is a static card in the prototype, so no logic is needed.

---

## 10. Fact coverage check

Every one of the 18 facts appears in at least one report or on the decision card. Use this to verify the fixtures and to test whether a live session surfaced a given fact.

| Fact | Where it appears in the solved board |
|------|--------------------------------------|
| P1 | Kavya, Dev and Asha chats; decision card (setup drop is real) |
| P2 | Kavya chat and report (rejected A); Dev chat |
| P3 | Asha findings 2; decision card reason 4 |
| P4 | Kavya rejected B; Dev chat; decision card |
| P5 | Asha chat and findings 3; Kavya chat |
| P6 | Kavya finding 2; Dev; Asha; decision card reason 5 |
| DES1 | Kavya finding 1; decision card (set aside) |
| DES2 | Kavya finding 2; decision card reason 1 |
| DES3 | Kavya rejected B; decision card (set aside) |
| DES4 | Decision card effort |
| ENG1 | Dev finding 1; decision card (set aside) |
| ENG2 | Dev finding 2; decision card reason 2 |
| ENG3 | Dev rejected B; decision card (set aside) |
| ENG4 | Dev finding 3; decision card effort |
| PM1 | Asha finding 2; decision card reason 4 |
| PM2 | Asha finding 1; decision card reason 3 |
| PM3 | Asha finding 3 (reminder test among users who already logged expenses) |
| PM4 | Asha finding 3 and rejected B; decision card (set aside) |

Project context, idea notes and AI-suggested notes are background. They are not part of the 18 scored facts, and a report that cites only them does not count toward the coverage score.

---

## 11. Notes for building the fixtures

I do not know how boards are currently stored. Inspect the app first. The structure below is neutral and should be mapped onto whatever exists.

Single source of truth:

- Keep one fixture file for the case: facts, roles, briefs, restate prompts, options, and the solved layers.
- Derive both boards from it. The unsolved board uses the frame, public cards and briefs. The solved board adds restate cards, three explorations, three reports and the decision card. This prevents the two boards drifting apart.

Suggested shape (adapt to the existing model):

```json
{
  "case": {
    "id": "split-buddy",
    "title": "Split Buddy: week-one drop-off",
    "frame": "Split Buddy is a fictional app for splitting shared bills between flatmates. Six in ten new users stop using Split Buddy within the first week. The team can ship one fix this sprint. Which one?",
    "designQuestion": "How might we keep more new users past their first week?",
    "options": [
      { "id": "A", "text": "Cut onboarding from six steps to three." },
      { "id": "B", "text": "Add reminders and streaks to bring people back." },
      { "id": "C", "text": "Fix the \"invite your flatmates\" step." }
    ],
    "publicFacts": [ { "id": "P1", "text": "...", "option": "A", "value": 1 } ],
    "roles": [
      { "id": "designer", "name": "Kavya", "brief": [ { "id": "DES1", "text": "...", "option": "A", "value": -1 } ] },
      { "id": "engineer", "name": "Dev", "brief": [] },
      { "id": "pm", "name": "Asha", "brief": [] },
      { "id": "lead", "name": "Meera", "brief": [] }
    ]
  },
  "solved": {
    "restates": [],
    "explorations": [
      { "roleId": "designer", "cardsTaken": ["P1","P2","P3","P6"], "chips": [], "messages": [], "report": {} }
    ],
    "decision": {}
  }
}
```

Tasks:

0. Before writing any fixture, inventory the features that exist in the codebase and match them to the table in section 1b. Drop any fixture part that has no matching feature. Do not build new features to fit the fixture.
1. Create the case fixture and the two boards (unsolved, solved) from it.
2. Unsolved board: load for 1 to 4 participants, assign briefs by the table in section 7.1, and make each brief visible only to its holder.
3. Solved board: load with all layers, read-only or resettable. Label it clearly as an example board. Explorations should open as saved chats, not live ones.
4. Add two entry points: "Start a fresh case" (unsolved) and "See a finished example" (solved).
5. Keep the report in the fixed template (header, summary, findings, evidence, objections, rejected directions, open questions). Every finding, objection and rejected direction carries its reason.
6. Make the decision card static.
7. Add a reset action for the unsolved board.
8. Check that the solved board's contents match the coverage table in section 10.

Authenticity note: the solved board is scripted content, not a live model run. The cleanest approach is to seed it from this file. If you also want a real-run version, play the three roles once in the unsolved board with the demo models (GLM 5.3 Flash, Qwen 3.8 Flash, DeepSeek V4.1 Flash via OpenRouter), keep the best run as a second fixture, and do not edit the chats. Say in the thesis which of the two the example board is.

---

## 12. Test protocol and measures

Run three kinds of session.

1. Solo smoke test, about 10 minutes. One person holds all briefs and runs every step. Edge cases to try: select zero cards, one card and all six; ask the AI something outside the context (it should answer that it does not know, and put the gap under open questions); a very long note; a dead link in a brief.
2. Multi-tab test. Two or three tabs on one machine, each a different person. Check that private briefs stay private and that reports land on the shared board.
3. Live session with 3 or 4 real people, about 25 minutes (this timing is an estimate, not from a paper): 2 minutes to restate the problem, 8 for private exploration with the AI, 5 reading reports, 5 recording a decision, plus time to close. Give tasks rather than instructions, for example: "Your lead asks why option A was set aside. Find out."

Measures:

- Facts surfaced: how many of the 18 facts appear in approved reports or the decision card.
- Decision correct: did the group pick option C.
- Reasons attached: does every rejected option have its reason.
- Human writing before AI: how many notes or restatements each person wrote before first asking the AI (guards against passive use).
- Reader comprehension: can a person who did not write a report say what was rejected and why without asking its author.
- Process: time to first AI response, number of explorations, whether reports were approved without regenerating.
- Short post-session ratings of conflict and satisfaction.
- Feature use: did each person add their handout through the context input before asking the AI, did they add their own sticky notes before asking for AI suggestions, did they use select-and-ask on notes, and did they accept or ignore the AI-suggested notes.
- Quantity and quality separately: do not treat more cards or longer reports as better.

Caution on scoring: retrieval-style or "fix the invite" answers could be guessed by an AI from general knowledge. Always score on specific facts cited (for example "5 of 8" or "1 in 3 Android phones"), not only on the chosen option.

---

## 13. Sources

- McGrath (1984), Groups: Interaction and Performance, typology of tasks. Summary: https://acawiki.org/Typology_of_tasks
- Task selection and design for group research (Indiana University scholarworks): https://scholarworks.iu.edu/iuswrrest/api/core/bitstreams/af312051-8951-4635-8493-ccf9c98a1509/content
- Stasser and Titus, hidden profile overview: https://en.wikipedia.org/wiki/Hidden_profile
- Bringing Everyone to the Table: An Experimental Study of LLM-Facilitated Group Decision Making: https://arxiv.org/pdf/2508.08242
- Hocking and Vernon (2017), The right tool for the right task: https://core.ac.uk/download/287636632.pdf
- Reiter-Palmon and Murugavel (2018), The Effect of Problem Construction on Team Process and Creativity: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.02098/full
- Diehl and Stroebe (1987), Productivity Loss in Brainstorming Groups: https://homepages.se.edu/cvonbergen/files/2013/01/Productivity-Loss-In-Brainstorming_Toward-the-Solution-of-a-Riddle.pdf
- Brainstorming with a Generative Language Model (Springer, 2025): https://link.springer.com/article/10.1007/s12599-025-00974-y
- How AI Ideas Affect the Creativity, Diversity, and Evolution of Human Ideas: https://arxiv.org/pdf/2401.13481v3
- Nominal Group Technique guide (University of South Carolina): https://www.sc.edu/about/offices_and_divisions/organizational_excellence/resources/facilitation/nominal_group_technique.php
