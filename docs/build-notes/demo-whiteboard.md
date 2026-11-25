# Build notes: demo whiteboard data (Wed 25 Nov 2026)

Spec: `Adithya added docs/Locked decisions and updated agent/Demo_Whiteboard_PRD.md`. Blocker: `Split_Buddy_Case_v2_Expanded.md` is still not in the project, so nothing from it was invented. Every slot waiting on it is marked `TODO(v2 case)` in the code.

## What was built

1. **Planning call fixture.** `fixtures/meetings/split-buddy-planning-call.txt`, copied unchanged from `Adithya added docs/Demo Assets/` (36 turns, 566 words). Since it sits in `fixtures/meetings/`, a bare `npm run check:meeting` runs it as well.
2. **`check:meeting` answer key** (`server/check-meeting.ts`). Fixtures listed in `EXPECT` are scored against PRD 5.1, with PASS / FAIL lines, and the script exits 1 if any check fails. For the planning call it checks:
   - 3 to 6 sections, 12 to 22 notes, 3 to 5 decisions;
   - a chip title that names the call;
   - K1 to K4 present as decisions (K2 also passes when it comes back split into a Dev decision and a Kavya decision);
   - K5 reported as an INFO line, since either form is fine;
   - QR, web version, iPhone and "hide the invite for half" are not decisions;
   - the quoted "lock every decision" line creates no decision (a note that mentions it is allowed);
   - no invented source ids in the model's raw answer.

   It reads `draft.decisions` if the locked-decisions build adds that list, and otherwise uses notes of kind `decision`. It also prints the decision texts.
3. **Seven decisions on the finished example** (`DECISIONS` in `server/cases/split-buddy.ts`, written by `seedCase` with `writeDecision`):
   - **Ids:** stable, `d_sb1` to `d_sb7`.
   - **Text and reasons:** word for word from PRD section 4.
   - **Lockers:** Meera (new seed person `seed-meera`) for D1 and D3 to D6, Asha for D2, Kavya for D7.
   - **Times:** "hours before seed". D4, D5 and D6 sit about a minute apart (48, 47.98 and 47.96 h), so the list reads D6, D5, D4 as PRD 4.3 asks.
   - **Meeting decisions:** D4 to D6 have `via: 'meeting'` and `meetingChipId: 'ctx-planning-call'`.
   - **D1:** `reportIds` point at the real Kavya, Dev and Asha reports, and `rich` holds the expanded card.
   - **D7:** `status: 'reopened'`, reopened by Dev 36 h before seed, with history `lock` (Kavya) then `reopen` (Dev).
4. **Meeting chip** "Sprint planning call" on the finished example (PRD 4.2): type `meeting`, added by Meera, with the neutral summary from the PRD and `source` and `sourceName` set to the meeting name. It has no `sourceId` and no transcript text.
5. **Seeds no longer write `meta.decision`**, in either `seedCase` or `seedBlank`.
6. **Mid-session board**:
   - `BoardKind` gains `'mid'`, and `seedCase(doc, 'mid')` builds it.
   - Row 1 holds Frame (A to C), Restate (the 3 restate notes) and "What we know" (P1 to P6, 4 across, blue, from the Facilitator).
   - Row 2 holds one "Ideas" section at exactly 1,880 x 1,220 px (8 x 5 notes of 200 px, 32 px gaps, 28 px padding, 64 px header).
   - It has the four project context chips, empty Reports and Decisions, and no decisions.
   - `IDEA_BANK` in `split-buddy.ts` is the single array for the 40 notes. The seed lays them out 8 across in the given order, each moved by a stable offset of up to 10 px. Notes marked `ai` get `origin: 'ai'`. `MORE_FACTS` is the slot for P7 and P8.
7. **Start screen** (`src/screens/Home.tsx`). Four buttons in PRD order: Start a fresh case (primary), Start mid-session, See a finished example, New whiteboard. The explainer line now covers three case boards. In the recent-boards list, mid-session boards get a "Mid-session example" badge.
8. **Header badge** "Mid-session example" (`src/ui/BoardHeader.tsx`, one line).
9. **Board creation route** (`server/index.ts`): the `kind` enum accepts `'mid'` (one token).
10. **`docs/demo-script.md`** is replaced with the PRD section 8 script. It keeps updated "If something goes wrong" and "Lines worth having ready" tables (the paperclip now lives in the left sidebar) and has a note on what cannot run until the v2 case file arrives.

## Files changed

Mine:
- `server/cases/split-buddy.ts`: Meera, `PersonKey`, `D1_RICH`, `MEETING_CHIP`, `DECISIONS`, `IDEA_BANK`, `MORE_FACTS`, header comment. The old `DECISION` constant stays as the source for `D1_RICH`.
- `server/demo-seed.ts`: rewritten.
- `server/check-meeting.ts`
- `src/screens/Home.tsx`
- `fixtures/meetings/split-buddy-planning-call.txt` (new)
- `docs/demo-script.md`
- this file

One-line edits in shared files:
- `shared/types.ts`: `BoardKind`.
- `src/ui/BoardHeader.tsx`: the badge.
- `server/index.ts`: the enum.
- **`shared/ydoc.ts` line 114** (`readMeta`): now accepts `kind === 'mid'`. This file belongs to the locked-decisions builder. I made the edit because without it a mid board reads as `blank`, and then the badge, the recent label and the Reports and Decisions slots would all be wrong. It was one targeted Edit, made after re-reading the file.

## Differences from the PRD

- **D3 and D4 are board locks, not section locks.** The "Not this problem" and "Bring people back" sections come from v2. The seed looks the section up by title, so once those sections are seeded, D3 and D4 become section locks with no code change. Until then, the finished example has no Locked pills.
- **`sourceNoteIds` are empty** for D1 (PRD: i01, i02, i03, i31, i39) and D7 (i11, i20). The planned ids are kept in `plannedSourceNoteIds`, and the seed writes only the ones that exist on the board. They fill in by themselves once `IDEA_BANK` is filled.
- **D1's rich card is the v1 card:** 5 reasons, 2 set-aside items, 3 follow-ups, effort, written by "Asha, Dev, Kavya". The PRD asks for the v2 card: 7 reasons, 3 set aside, 5 follow-ups and the "What we do not know" paragraph (`unknowns`).
- **The finished example keeps the v1 layout** (Frame, Restate, Ideas with P1 to P6 and 6 ideas). PRD section 3 asks for "What we know", the seven direction sections and "Inside option C". All three need v2.
- **The report timeline now follows the seed time.** The saved explorations and reports are dated about 77 to 79 h before seed, so all three are approved before D1 is locked at 72 h. They were fixed at 23 Nov before, which would have put the reports after the decision built on them. Note times are relative too (130 h before seed).
- **The fresh case is unchanged** (v1 section 8, not v2 section 7.1). Its Decisions empty state is the locked builder's UI.
- **The card footer text** ("Written by the group, locked by Meera. The AI did not write this.") is UI and belongs to the locked builder. Not done by me.

## Checked

- **Typecheck:** clean for my files. The one remaining error, `server/agent/mock.ts(30,7) 'has' is declared but never read`, is the agent builder's. Earlier, `src/screens/Canvas.tsx` imported a `LockedBlock.tsx` that did not exist yet (locked builder, mid-edit); that has since resolved.
- **`npm test`:** 23 pass.
- **Seed script, reading the Yjs docs directly (a temporary script, since deleted):**
  - The finished example has 7 decisions, 6 in force, and D7 reopened, with history lock:Kavya then reopen:Dev.
  - List order is D6 D5 D4 D1 D3 D2 D7.
  - D1 points at the 3 real report ids and has `rich`. D4 to D6 link the chip.
  - Every `sourceNoteId` exists. `meta.decision` is null. All reports are approved before D1.
  - No line of the planning call, and no "(mm:ss)" timestamp, appears anywhere in the doc.
  - The decision numbers agree: "33 of every 100", "5 of the 33", "4 in 10" (40 retained). The only other numbers are 7 days, 100, 40 percent and 10.
  - Mid-session: kind `mid`, 0 decisions, 0 reports, the Ideas section 1880 x 1220, every note's centre inside its section, 12 notes and 4 chips.
  - Fresh case: 0 decisions.
- **Browser** (my server on `build-demo`, ports 5221, 8831 and 8832, `data/demo.db`, real clicks):
  - The start screen shows the four buttons in order.
  - **Start mid-session** opens the board with the "Mid-session example" badge, the three row-1 sections, the empty Ideas section, Context showing 4, and the empty Reports and Decisions nodes.
  - **See a finished example** shows the locked builder's Decisions node listing all seven, in the PRD order:
    - "From Sprint planning call" on D4 to D6;
    - "Show more" on D1, which expands to the card ("Because" heading present);
    - D7 marked "Reopened by Dev", with "Lock again".
  - The Context panel shows the meeting chip: MEETING, the summary, "Added by Meera", "Full text is private".
  - The only console errors were websocket retries while the API restarted (other builders' edits trigger `tsx watch`).
- **`npm run check:meeting -- fixtures/meetings/split-buddy-planning-call.txt`, live, twice** (DeepSeek drafted both, no fallback):
  - **Run 1:** 6 sections, 17 notes, 5 decisions. K1, K3 and K4 passed. K2 failed: the model wrote only "Dev owns the link and the typed group code" as a decision, and Kavya's part was not a decision. That run used the earlier, stricter K2 check, but it would fail the split rule too.
  - **Run 2:** 5 sections, 13 notes, 6 decisions. K1 to K4 passed, with K2 split into two decisions. K5 came back as a decision. The count check failed (6 against 3 to 5) because of the split.
  - **Both runs:** no QR, web, iPhone or "hide half" decision; no lock from the injection line; no invented source ids; neutral chip titles ("Sprint planning for invite step", "Invite fix sprint planning").
  - So K1 and K3 held on every run, as PRD 10.3 asks. K2 is not reliable as a single decision. The locked builder's `decisions[]` prompt (max 5, one per agreement) is where to fix it.
- **`MOCK_AI=1`:** the script runs. The canned draft has no decisions, so the decision checks FAIL by design until the locked builder adds the meeting-decision mock to `server/mock.ts`. The PASS lines are the counts (3 sections, 15 notes), no QR, web, iPhone or "hide half" decisions, no injection lock, and no invented ids.

## Not checked

- A second profile unlocking a seeded decision (PRD 10.8). That is UI from the locked builder.
- Clicking from a section pill to its section: there are no section locks until v2.
- The full section 8 demo script. Steps 1 to 4 and 8 need the 40 notes and the agent.
- A live meeting import on the mid board through the UI. Only the script was run.

## Waiting on `Split_Buddy_Case_v2_Expanded.md`

Each item below is one edit in `server/cases/split-buddy.ts` unless noted:
1. `IDEA_BANK`: the 40 notes `i01` to `i40` in v2 section 7.2 order, with authors from v2 section 5. Set `ai: true` on I09, I16 and I22 (credited to Dev, Kavya and Asha). Nothing else changes: the mid-session seed lays them out.
2. `MORE_FACTS`: P7 and P8. Check whether v2 also rewords P1 to P6 (`PUBLIC_FACTS`); `check:models` uses p1, p2 and p6.
3. `D1_RICH`: the v2 card (7 reasons, 3 set aside, 5 follow-ups, `unknowns`).
4. The finished example's layout (`server/demo-seed.ts`):
   - "What we know" in row 1;
   - the seven direction sections in row 2, holding the i-notes;
   - "Inside option C" (C1 to C4) in row 3.

   Once sections titled "Not this problem" and "Bring people back" exist, D3 and D4 become section locks by themselves, and D1's and D7's source notes fill in.
5. The v2 reports and saved chats, if they differ from v1 (`EXPLORATIONS`).
6. The fresh case as v2 section 7.1.
7. The agent builder's answer keys and `check:agent` scoring, which use the same 40 ids.

## Conflicts with the other builders

- **`shared/ydoc.ts`** (locked builder): my one-line `readMeta` edit for `'mid'`, described above. Please keep it.
- **Mock meeting decisions** (`server/mock.ts`, locked builder): `check:meeting` under `MOCK_AI=1` fails its decision checks until that mock exists.
- **`check:meeting` and `draft.decisions`:** once the locked builder adds `decisions[]` to the meeting draft schema and the checks, the script picks it up. If they rename the field, update `listed` in `server/check-meeting.ts`.
- **Agent builder:** the type error in `server/agent/mock.ts` is theirs.
- **Shared database:** none. I used only `data/demo.db`, and test boards were left there.
