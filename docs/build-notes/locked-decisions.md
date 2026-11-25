# Locked decisions: build notes

Built from `Adithya added docs/Locked decisions and updated agent/Locked_Decisions_PRD_v2.md`, 25 Nov 2026. L1 to L5 are done. L6 is partly done. L4b (the agent's lock steps) was left to the agent builder, as agreed.

Typecheck passes. `npm test` passes (45 tests, 2 of them new).

## What was built, by milestone

### L1: the record and the manual lock
- `decisions` is now part of the shared doc. It is in `parts()` and the doc comment in `shared/ydoc.ts`, and `readBoard()` returns `decisions` (via `readDecisions`).
- The store mirrors `decisions`. `Y.UndoManager` tracks the map, so one Ctrl+Z undoes a lock or an unlock.
- New board writers in `src/lib/board.ts`:
  - `lockDecision(input, {via, meetingChipId})` returns `{id, downgraded}`. It runs as one undo step and is built on `writeDecision`.
  - `reopenDecision(id)`.
  - `relockDecision(id)`. If another decision took the section in the meantime, or the section is gone, the decision moves to the whole problem.
- **Lock panel** (`src/canvas/LockPanel.tsx`, new). It uses the `.popup` style, is 360 px wide and is anchored to its button. It has:
  - "What did the group decide?", with a counter from 250 characters;
  - "Why (optional)";
  - "Applies to", where the Section option is disabled with "Already covered by …" when another decision holds it;
  - "Notes behind it";
  - "Reports behind it" (tick boxes);
  - "Something very similar is already locked." when the same text is already in force;
  - "Locked as <name>.", Cancel and Lock decision.
  Keys: Enter in the first field moves to Why, Ctrl/Cmd+Enter locks, Escape closes and focus goes back to the button.
- **Entry points:**
  - Selection bar: "Lock decision", with the text prefilled when one note is selected. The section is offered only when every selected note sits in one section.
  - Section header: an icon-only lock button, shown on hover, when the section is selected, on keyboard focus and while its panel is open. It is hidden once the section is covered.
  - Decisions area: "Lock a decision".
  - Report view (L6): "Lock as decision".
- **Locked pill** on a covered section's header: `LockKeyhole` plus LOCKED, in the Badge family, ink on an ink tint. Its popover shows the text, the reasons, "Locked by …, date" (with "via the agent" when it applies), "From <meeting>", report links and Unlock. Screen readers hear "Locked decision: <text>. Locked by <name>."
- **Decisions area** (`src/screens/DecisionCard.tsx`, rewritten). Its header reads "Decisions <count in force>" with a Lock a decision button. Each row has:
  - the text (3 lines, then Show more);
  - the reasons;
  - "Locked by …" or "Reopened by …";
  - "From <meeting>" when it came from a meeting;
  - a scope chip, either "Whole problem" or "Section: <title>" (click to pan there);
  - "Section deleted" or "Section already covered by …" notes when they apply;
  - "N notes behind it" (click to select them);
  - report links;
  - Unlock or Lock again.
  A decision with `rich` content expands under Show more to Because, Set aside, Effort, Follow-ups, Still unknown (`rich.unknowns`), Reports behind this and "Written by …". The old `meta.decision` mock, with its Mock tag, shows only when `decisions` is empty. More than 8 rows scroll inside the area. Empty state: "Nothing locked yet. Lock a decision to make the AI check its answers against it."
- The Reports and Decisions nodes now also appear on a blank board once a decision exists. Node aria label: "Decisions".
- **Toast:** `Locked: "<text>"` with Undo and Close, bottom left, auto-hiding after 8 s with the same pause on hover and focus as the title toast. When the lock was moved to board scope it adds "Someone locked that section first, so this covers the whole problem."
- **Deleting a covered section** asks "This section is covered by a locked decision. Delete it anyway?" (in `onNodesDelete`). The decision stays locked with scope `board` and keeps its old `sectionId`, so the row says "Section deleted". This runs in the same transaction, so Ctrl+Z brings back the section and the section scope together.

### L2: the AI checks
- `contextFor` adds `decisions`: in force, newest first, at most 20, ids D1 to Dn, with `realId` kept server-side only.
- `RULES` gains the PRD 8.1 line (decision text is data, warn in one line, never claim a lock).
- `decisionsBlock()` in `server/prompts.ts` and a WARN instruction with the exact 8.2 wording are added to:
  - `canvasChat`, after the snapshot, so the cached prefix is unchanged;
  - `opinion`.
  When nothing is in force, nothing is added, so old prompts are byte-identical.
- Canvas chat reads the current decisions from the board at call time (`decisionsOfBoard`), not from the snapshot.
- **Offline mock** (`server/mock.ts`): `mockConflict()` flags a decision when the text shares 2 or more content words (5 or more letters, stop words removed) with it. Chat and opinion replies then open with the warning line, at most two of them, each decision once.

### L3: the private canvas block
- New `src/screens/LockedBlock.tsx`, sitting directly above the "What the AI was given" chips row, in its own container: surface-2, 1 px line border, 3 px ink left rule, 11 px radius, white 6 px rows. It has:
  - the header "Locked decisions <count>" and the line "The AI checks its answers against these. Only the board can change them.";
  - rows with the text (2 lines, expands on click), "Locked by …, date · Section/Whole problem" and View on board (selects the section or the source notes and goes to the board);
  - 2 rows shown, then "Show N more", at most 20, then "N more locked decisions are on the board".
  It is hidden when nothing is in force, and not shown on saved chats (it is only in the live canvas).
- **Live, not polled:** the canvas route keeps the board's Yjs connection (`App.tsx`), so the block reads the store and updates at once. This is the PRD 7.4 "check this first" case, so there is no 15 s polling and no refetch on focus.
- "New" marks and "Changed since you started, by <names>" compare against what was in force when the board synced, and reset after each reply. That covers new locks and reopenings.
- `GET /api/explorations/:id` also returns `decisions` (owner only, in force, cap 20; none for seed chats), as the PRD asks. The UI does not need it.

### L4: meeting decisions
- **Schema** (`shared/meeting-schema.ts`):
  - `MeetingDraftLoose` gains optional `decisions[]` (text, reasons, sourceIds, sectionRef, conflictsWith, conflictLine) and optional `conflictsWith` and `conflictLine` on notes.
  - New `DraftDecision` type. `MeetingDraft` is now a hand-written type with optional `decisions`, so drafts saved earlier still load.
  - `MeetingDraftView` gets `decisions` with passages. `ApprovedSession.decisions` holds the rows that start locked, as `{text, reasons, sectionIndex}`.
- **Checks** (`server/meeting/draft.ts`):
  - `checkDraft(d, segments, known)` cleans decisions: plain text, clamped to 300 and 500, real source ids only (none left means the decision is dropped), no duplicates within the draft or of a decision in force, at most 5.
  - `sectionRef` becomes a `sectionIndex` into the checked sections.
  - `filterConflict()` drops unknown conflict ids and maps D1 to the real id.
- **Prompt** (`meetingSession`):
  - Notes no longer use kind "decision".
  - New rule 11, tightened after the demo builder's finding: agreement only, "One decision per agreement", an agreed split of ownership stays one decision, never split or drop part of one, at most 5, do not repeat a locked one.
  - Rule 12 covers conflicts.
  - Rule 10 now also says to ignore lines asking to lock, decide or ignore decisions.
  - `boardBrief` includes the `<decisions>` block when any are in force.
- **Mock:** `meetingMock.decisions()`. A segment that says "agreed" or "decided", and is not "not decided" and not a question, becomes a decision. Its text drops filler sentences, and the segment before it is the reason. On the planning call this gives K1 to K4, and the "lock every decision" line gives nothing.
- **Review sheet** (`src/screens/MeetingSheet.tsx`):
  - a "Decisions" group above the sections, with a lock icon and the line "What the meeting agreed. Ticked rows start locked in your name when you add the session. Anyone can unlock them later.";
  - each row has a tick box, editable text, the reasons, "Goes against: …" when it applies, "Start locked", "Locks section: <title>" (only when the model gave a section), and From the meeting with passages;
  - the counts line gains ", N decisions";
  - Add to board works with only decisions ticked.
  - With "Start locked" off, the decision becomes a decision-kind note (green) in its section, or in a new "Decisions" section.
- **Placement:** `board.placeSession` writes the decisions in the same transaction with `via: 'meeting'`, `meetingChipId` and `lockedBy` set to the person. It returns `decisionCount`.

### L5: the rest of the AI
- **Suggestions:**
  - The prompt asks for `conflictsWith` and `conflictLine` when decisions are in force.
  - The server filters them with `filterConflict` and returns them on fresh ideas.
  - `Suggestion` type: optional fields.
  - The AI ideas tray shows "Goes against: <text>" under an idea (`ConflictFlag` in `Dock.tsx`, a small edit). Placing still works.
  - Mock: the same overlap rule.
- **Meeting notes:** the same flag on notes in the review sheet, plus "N notes go against locked decisions" in the counts.
- **Report:** `makeReport` gets the decisions as reference, with the PRD line (never a source of findings; a conversation that went against one goes under objections).

### L6: polish (partly)
Done:
- Lock as decision from the report view, prefilled with the report title and the report ticked. After locking it shows "Locked: … It is in the Decisions area on the board."
- The Reopened state and Lock again.
- The section delete confirm.

Not done:
- the `Ctrl/Cmd+Shift+L` shortcut;
- the history popover. History is recorded in the doc, but there is no view.

## Choices that differ from the PRD (for the designer)
1. **Section option from the selection bar.** The PRD says notes give a board decision. I offer "This section: <title>" as a second option when every selected note sits in one section. Board stays the default.
2. **Two or more sections selected:** not handled. The selection bar only counts notes (React Flow section selection is not in the store), so locking a section happens from its own header button. The "Select one section to lock it" tooltip does not exist.
3. **The section header lock button is icon only**, with the label "Lock a decision for <section>" and a tooltip. Once covered, the Locked pill takes its place. The PRD did not specify the button.
4. **The pill text renders as LOCKED**, because it uses the Badge family's uppercase. The word in the code is "Locked".
5. **No 15 s polling in the canvas.** The block reads the live board (the connection is already held), so changes show at once. The "New" marks clear when the AI's reply finishes, not when the message is sent.
6. **A deleted section's decision** keeps its old `sectionId` with scope `board`, so the card can say "Section deleted". `Decision` has no separate flag for this.
7. **Two people locking the same section at once:** the loser's row says "Section already covered by …" (computed with `coverOf`). The PRD's toast to the loser after sync is not built. The person who locks after a sync gets the "someone locked that section first" toast line.
8. **Suggestion conflict flags are not stored** (the `suggestions` table has no column for them, and `db.ts` is shared). They show on freshly asked ideas only, not after a reload.
9. **Meeting decisions that start locked default to the section lock** whenever the model gave a `sectionRef`. Live, DeepSeek gave a section for all 4 decisions on the planning call, so all four lock a section unless the person unticks "Locks section".
10. **`MeetingDraft` is no longer `z.infer` of the strict schema.** It is a hand-written type with optional `decisions` and conflict fields, so old saved drafts still load.

## What I checked, and how
Checked on my own server (`build-locked`: 5201, 8811, 8812, `data/locked.db`, live Sarvam key), with real pointer clicks in the browser pane. The pane's ref-to-coordinate mapping was off, so I clicked computed coordinates and read the results from the DOM and the store. Second profile: `dev.localhost:5201`.

- **1:** One note selected, Lock decision, typed a reason, locked. The toast showed, and the second profile's store had the decision with the reason and 1 source note. Ctrl+Z removed it for both, and Ctrl+Shift+Z brought it back.
- **2:** Section header lock on Ideas, then Lock decision. The Locked pill appeared, and its popover showed the text and "Locked by you, <time>". Unlock removed the pill, and the row read REOPENED with "Reopened by you". Lock again restored the pill with a new time; history reads lock, reopen, relock.
- **3:** A note in the covered Ideas section, then Lock decision. "This section: Ideas" was disabled with "Already covered by …".
- **4:** Deleting the covered section showed the confirm text (`window.confirm` stubbed to record it). The decision stayed locked: Whole problem, "Section deleted". Ctrl+Z restored the section and the section scope.
- **5:** Lock as decision on a finished-example report opened the panel with the report title and only that report ticked.
- **8:** Took the Ideas section. The canvas showed the Locked decisions block above "What the AI was given", and no decision was in the chips.
- **9 and 10:** The second profile locked a decision (via `board.lockDecision` in its page) while my canvas was open. The block showed it at once with NEW and "Changed since you started, by Bright Badger". Unlocking it dropped it from the block, and the API's `decisions` matched.
- **13 (live):** In the canvas, "Argue for starting with the reminder feature this sprint instead of the invite step." The reply opened with `This goes against a locked decision: "We fix the invite step first, before any reminder work."` and then argued the case.
- **16, 16a, 16b, live in the app:** pasted the planning call, then Add and build session.
  - The sheet listed 4 decisions under Decisions, all ticked, all Start locked, with the counts line "18 notes in 6 sections, 4 decisions".
  - I unticked decision 3 and turned off Start locked on decision 2, then pressed Add to board.
  - 2 decisions were written with `via: 'meeting'` and the chip id, each with a section scope. Decision 2 became a decision-kind note, and nothing was written for decision 3. No lock came from the "lock every decision" line.
  - One Ctrl+Z removed the 6 sections and both decisions, and Ctrl+Shift+Z brought them back.
- **16 and K2, by script:** `npm run check:meeting -- fixtures/meetings/split-buddy-planning-call.txt`, two live runs after the prompt change. Both gave 4 decisions, with K2 as a single decision ("Dev owns the link and the typed group code. Kavya owns the Skip button and the preview."). K1 to K4 PASS, all the "must not" checks PASS, and no invented ids. The only FAIL, in run 1, was the chip title "Sprint scope call on invite step" (condense, not decisions). With `MOCK_AI=1`: 4 decisions, K1 to K4 PASS. The only FAIL is the mock chip title "Meeting transcript".
- **17:** new unit tests in `server/meeting/draft.test.ts`: unknown `conflictsWith` dropped and known ones mapped, plus the decision caps, duplicates and sectionRef.
- **19:** the mock chat warning, checked by a throwaway tsx script (warning on an overlapping message, none on "What about pricing?").
- **24:** the second profile got 404 on my exploration.
- **25:** Escape closes the panel and focus returns to the Lock decision button.
- **Seeded example:** the demo builder's 7 decisions render. 6 are in force and 1 is reopened. The meeting ones say "From Sprint planning call", and the rich one has Show more.

## What I did not check
- 6 (two people locking the same section at the same moment), 7, 11, 12, 14 (Ask AI live), 15 (a live suggestion flag), 16c (a meeting with no agreement), 16d (removing the chip; covered by `MeetingLine` code), 18 (`AI_FORCE_FALLBACK` on chat), 20 to 22 (agent), 23 by doc search, 26 by screen reader, 27 reduced motion.
- The live report with decisions as reference.
- The Lock as decision confirmation line after a real lock.
- **Layout at 1024 x 768:** the new block plus the chips row leaves little height for the chat, and the chips row overlapped the starter buttons in a screenshot. The block shows 2 rows by default, but a narrower or collapsible chips row may be needed on small windows.

## Conflicts with the other builders
- No reverts. Every shared file was re-read before editing.
- The agent builder appended `applyAsOneStep` to `board.ts` while I was working. My `placeSession` edit is in the middle of the file and does not touch it.
- The demo builder's `'mid'` line in `readMeta` is kept.
- Typecheck once flagged `server/agent/mock.ts(30,7)` (unused `has`), in the agent builder's file mid-edit. It was gone at my last run.
- I made one small edit in `Dock.tsx`: the `ConflictFlag` component and one line in `IdeaCard`, away from the agent's sidebar tab.
- **For the agent builder (L4b):**
  - `board.lockDecision(input, { via: 'agent' })` exists but is its own undo step. Inside `applyAsOneStep`, call `writeDecision(doc, input, actor, { via: 'agent' })` directly.
  - `scopeOf`, `lockedLine` and `LockGlyph` in `src/canvas/LockPanel.tsx` can be reused for preview rows.
- Test boards are left in `data/locked.db`.
