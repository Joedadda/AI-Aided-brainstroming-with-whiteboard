# Demo script: Review 3 (prototype v3: locked decisions, the agent, meeting import)

About 9 minutes, on the **Mid-session example**, in two windows. Source: `Adithya added docs/Locked decisions and updated agent/Demo_Whiteboard_PRD.md`, section 8.

The start screen has four buttons, in this order: **Start a fresh case**, **Start mid-session**, **See a finished example**, **New whiteboard**. Each click makes a fresh copy, so a board in a strange state is one click from new.

Handouts for live sessions are in `docs/handouts.md`. The planning call for step 5 is `fixtures/meetings/split-buddy-planning-call.txt`.

> Not ready yet: the 40 notes in the Mid-session "Ideas" section come from `Split_Buddy_Case_v2_Expanded.md`, which is not in the project. Until it is, the Ideas section is empty and steps 1 to 4 and 8 cannot be run as written. Steps 5, 6 (C6 and C5), 7 and 9 work without it.

## Before you start

- [ ] `.env` has `SARVAM_API_KEY`, and `npm run check:models` passed today. Without a key the app runs on canned replies and shows **Offline demo** in the header.
- [ ] `npm run check:meeting -- fixtures/meetings/split-buddy-planning-call.txt` passed today (answer-key lines all PASS).
- [ ] `npm run dev`, then open http://localhost:5173 in a **normal window** (Asha) and a **private window** (Dev). Each makes its own temporary profile.
- [ ] Asha: click **Start mid-session**. Copy the board link into Dev's window.
- [ ] Have the planning call open in a text editor, ready to copy.

## The run

**1. The pile (30 s).** 40 notes in one "Ideas" section. "The notes point in different directions and nothing is sorted."

**2. Sort (1 min).** Open **Agent**, type: *Sort all the ideas into directions based on what each one changes.* Show the plan, expand one section, untick one note, **Apply**. Seven sections appear. "The agent only proposed. Nothing happened until Apply." Ctrl+Z once: the pile is back. Ctrl+Shift+Z: the sort is back.

**3. Different criteria (45 s).** Select the notes in Fix the invite step, type: *Split these by effort: this sprint, next sprint, later.* Three effort buckets.

**4. Select and expand (1 min).** Select I01, I02, I06 and I39, type: *Put these in a section called Android link and come up with a few more ideas in parallel.* The section appears and ideas stream into the picker. Tick two, **Apply**. The new notes carry the AI badge and your name.

**5. Meeting import (1.5 min).** Open **Context** (paperclip, left sidebar), choose **Build from Meeting** from the panel heading, paste the planning call, press the arrow in the box. In the review sheet show the Decisions group, "Starts locked", the source passages and the sections. Untick the "invite does not move" row (it is borderline). **Add to board**. Four decisions appear in the Decisions area, locked, "From Sprint planning call". The reminders section gets a Locked pill if the draft gave it one. In Dev's window: the same decisions and badge, and hovering the meeting icon on the chip shows the full call text.

**6. Lock by command (1 min).** Type: *Lock the Not this problem section: pricing, brand and dark mode are out of this sprint.* The section is locked. Then: *Add three notes in a section called Measures: Retained means a second expense within 7 days; Count sign-ups from this sprint only; Report Android and iPhone separately. Then lock those decisions.* One Ctrl+Z undoes the lot.

**7. Private canvas (2 min).** In Dev's window: select the four Android notes, **Explore privately**. Show the Locked decisions block above the chips row, separate from the taken notes. Ask: *Should we ship reminders this sprint to bring people back?* The answer opens with "This goes against a locked decision". Then: *What would the typed group code screen show?* No warning. **Make report**, **Approve and share**: the report lands on the board.

**8. Ask the agent (30 s).** Type: *Do any of these go against what we locked?* It names the reminder notes. Click a chip to jump to the note.

**9. Close (30 s).** Open **See a finished example** for 20 seconds: seven decisions, six in force and one reopened by Dev, the rich decision card behind "Show more", and the Sprint planning call chip. "This is where a session ends up."

## If something goes wrong

| Problem | What to do |
|---|---|
| Live AI is slow or down | Stop the server, set `MOCK_AI=1` in `.env`, restart. **Offline demo** appears and the canned replies take over. Or skip to the finished example, which needs no AI. |
| The meeting build fails | Open the finished example. It already has the Sprint planning call chip and the three decisions from it. |
| Dev's window fails | Show the Locked decisions block in Asha's window by taking cards there. |
| An AI call fails | Each one shows an error with a way to retry (chat puts the message back, the report sheet has **Try again**). |
| "Reconnecting" in the header | Wait a second. Edits made meanwhile merge when it reconnects. |
| The report reads badly | **Regenerate** in the draft sheet. |
| A board is in a strange state | Back to the start screen and click the same button again. |
| Lost on the canvas | **Fit** (bottom right). |
| Deleted a note by accident | **Undo** in the message at the bottom left, or Ctrl+Z. |
| Can't find Context or AI ideas | They live in the left sidebar now, not the bottom toolbar. |

## Lines worth having ready

- Why a fictional case? "The AI cannot answer from general knowledge. If it quotes 1 in 3 Android phones, it got that from Dev's notes."
- Why lock a decision? "So the AI checks its answers against what the team already settled, and says so when it disagrees."
- Does a lock block anything? "No. It is a record with a name on it. Anyone can reopen it, and the reopen is recorded too."
- Can a meeting lock things by itself? "No. The review sheet shows every decision first, and nothing is written until you press Add to board. A line in the transcript saying 'lock every decision' is just text."
- Why does the agent show a plan? "It proposes. You tick what you want and press Apply. One Ctrl+Z undoes the whole plan."
- Why private first? "Exploration can be messy. The shared board stays clean."
- Why approve? "People keep the final decision. The AI never writes to the board by itself."
- Is the finished example a real model run? "No. It is scripted from the case file, so it is the same every time. The other boards are live."
