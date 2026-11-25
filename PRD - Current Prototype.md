# Split, Explore, Merge

**Product requirements document · Review 3 prototype · 26 November 2026**

## 1. Product and problem

Split, Explore, Merge is an AI-assisted collaborative whiteboard for product, design, and engineering teams of roughly 5–12 people. It helps a team frame a problem together, gives each contributor space to investigate it privately, and brings the reasoning back to the people making the decision.

Today, shared brainstorming, private AI chats, research, and meetings often take place in different tools. When contributors share only their recommendation, teammates have to reconstruct what evidence they used, which objections they considered, and why alternatives were set aside. The project’s research notes report that 3 of 5 interviewees moved context between tools manually, and all 5 wanted people to retain the final decision.

**Prototype hypothesis.** Carrying board context into an individual exploration and bringing back an approved, structured report lets teammates understand and build on that work with less manual reconstruction. The prototype also tests whether reviewable AI actions can reduce the work of organizing notes and turning meeting material into a usable board.

**Product principle.** People decide what becomes shared work. The Agent can suggest, answer, draft, and prepare board changes. The contributor chooses what to place, apply, approve, or lock.

## 2. Users and outcomes

| User | Job to be done | Desired outcome |
| --- | --- | --- |
| Contributor such as Asha | Pick up a thread from the board, explore tradeoffs with AI, and share what matters | Start with relevant context and publish a concise account in their own name |
| Peer reviewer such as Dev | Understand another contributor’s reasoning and inspect the source material | See findings, evidence, objections, and unresolved questions without needing access to the conversation |
| Lead or stakeholder such as Meera | Understand the options and record what the group agreed | See which decisions are in force, why they were made, and which notes or reports support them |
| Meeting participant or facilitator | Continue a discussion asynchronously from a transcript or summary | Review a proposed board with traceable notes and decisions before adding it |

## 3. Primary journey

1. **Frame.** Create or join a board and define the problem. A blank board offers meeting and general context alongside the Problem card. Context can also be added later from the sidebar.
2. **Split.** Select the notes to investigate and choose **Explore privately**, or start an Agent conversation with the whole board in scope.
3. **Explore.** Ask about alternatives, missing evidence, objections, or tensions with existing decisions. Continue in the sidebar or expand into the private canvas. Add private context there as needed.
4. **Return.** Request a report, review and edit the draft, then approve it. The report appears on the board under the contributor’s name.
5. **Converge.** Teammates read reports and inspect their references. Select approved reports to talk them through privately or draft a decision immediately. Review the draft and lock it to share the decision with its sources. The team can reopen a decision if circumstances change.

This adapts the framing, individual generation, sharing, clarification, and decision stages described in the project’s Nominal Group Technique background. The prototype supports asynchronous work and real-time collaboration on the same board.

## 4. Functional requirements

| ID | Surface | Requirements and acceptance criteria |
| --- | --- | --- |
| FR-01 | Entry and identity | A visitor can create a temporary display-name profile and open a board through a link. The home screen offers a blank board and three fresh copies of the fictional Split Buddy case. Recently opened boards can be reopened. Profile identity is tied to browser storage. |
| FR-02 | Shared board | Users can name the board, edit its Problem card, create and edit colored sticky notes, move notes into or out of sections, select notes, pan, zoom, and undo their own edits. Notes grow to fit their content. AI can propose a title or offer to turn a large idea into a section. A person accepts those changes. |
| FR-03 | Collaboration | Two profiles with the same link see shared content, edits, cursors, and selections. Each person controls their own viewport. Shared work persists across reloads. Sticky notes show the author’s name or **AI** in the footer. An icon with a tooltip shows who is exploring a note privately. The first sidebar tab lists teammates with active note reservations under **Exploring privately**. Meeting provenance wraps alongside other indicators. |
| FR-04 | Board context | Users can add text or a link in Context. The board shows a chip with a title, summary, and processing state. Board AI can use shared context. A failed link or summary must be distinguishable from a ready chip. |
| FR-05 | Agent conversation | Ask from the sidebar with the whole board in scope or use **Ask the agent** from a note selection. The sidebar and expanded view can continue the same saved conversation with follow-up history. Answers can reference notes and let users locate them. Individual ideas can be placed on the board by the contributor, and their placement state is retained with the conversation. |
| FR-06 | Agent plans | The Agent can group and move notes, create or rename sections, propose notes or ideas, and offer to remove sections emptied by the plan. It can answer a question or ask for clarification without producing a plan. Before applying a plan, the user can inspect warnings, edit supported text fields, choose steps or ideas, refine the plan, or discard it. Apply creates one undoable board change. Stale items are checked again before application. Lock or reopen steps require explicit intent in the user’s instruction. |
| FR-07 | Private canvas | **Explore privately** and the expanded Agent provide entry to a saved private exploration. A selection carries the relevant notes and board context into the conversation. A contributor can add private text or links and reopen the canvas after returning to the board. In-force decisions inform AI answers. Other profiles cannot open the contributor’s conversation or draft. The finished example includes scripted, read-only explorations for demonstration. |
| FR-08 | Report draft and approval | **Make report** or a direct report request opens the private review flow. A draft contains a summary and relevant findings, evidence, objections, rejected directions, and open questions. A short or inconclusive conversation can yield a compact report. The contributor can edit the draft, regenerate it, or add an optional Decision field that persists through regeneration. The report records explicitly selected notes where applicable. Approval publishes the reviewed report under the contributor’s name and releases the exploration’s reserved notes. |
| FR-09 | Report reading | Teammates can open an approved report from the board, read the summary first, inspect supporting sections, and locate its selected source notes. A report can be used as a source when locking a decision. The optional Decision field is part of the report. A separate lock action records a decision in force. |
| FR-10 | Locked decisions | Users can record decisions from the board, a section, a note selection, or a report. The selection toolbar uses one button for **Lock** and **Unlock**. For a mixed selection, Lock applies to the remaining unlocked notes. When all selected notes are locked, Unlock reopens their linked decisions in one undoable action. Locking the same unchanged note again reuses its matching reopened decision and preserves its history. Each decision records its statement, author, status, optional reasons and references, and whole-problem or section scope. AI uses in-force decisions to flag potential conflicts. Section locks record an agreement while the section remains editable. |
| FR-11 | Build from meeting | A person can paste a transcript or summary or open a TXT, Markdown, VTT, or SRT file. The private draft includes topical sections, notes, identified agreements, and a proposed Problem question. The AI uses the meeting’s explicit question when available and infers one from the discussion otherwise, including critiques and informational meetings. If the model leaves it blank, the app uses the validated draft topics to frame a fallback question. The owner can inspect source passages, edit the question, and choose what to add. **Add to board** fills an empty Problem by default and places the approved material in one undoable change. An existing Problem is preserved. Raw passages and draft details are available to the importer. |
| FR-12 | Blank-board onboarding | A new blank board opens with three cards: **Problem**, **Add meeting context**, and **Add other context**. Both context cards open their corresponding sidebar forms and can be skipped independently. A successful context import hides its matching prompt. The first written sticky note clears both prompts. Skip and completion are remembered for the current profile and board in the browser. A shared hint points to the sidebar’s **Context** tab for adding context later. |
| FR-13 | Your sessions | The first sidebar tab lists the current person’s private sessions for this board, newest activity first. The rail icon shows the session count. Each row shows the **Explore** or **Decide** tag, title, note or report count, last-used time, and **Open**, **Draft ready**, or **Decision locked** status. Selecting a row opens it. **Discard** removes the session from the list and releases its note reservations. Published decisions stay on the board. |
| FR-14 | Decide from reports | In **Reports**, select approved reports to enable **Talk it through** and **Draft now**. Talk it through opens a private Decide session with chat, the in-force Locked decisions block when applicable, and a chip for each selected report under **What the AI was given**. **Draft decision** generates an editable statement and reasons. Draft now generates that draft immediately from the selected reports. The snapshot holds the approved report bodies and reserves no sticky notes. **Lock decision** publishes the reviewed decision with links to its source reports. The draft and conversation remain private. |

## 5. Privacy, data, and runtime

| Boundary | Product contract |
| --- | --- |
| By board link | The link admits another temporary profile to the shared board. Shared state includes the problem, notes, sections, public context chips, approved reports, and locked decisions. Cursors and active selections are transient presence data. |
| By profile | Exploration snapshots, chat, draft reports, unplaced AI suggestions, Agent runs, and meeting sources and drafts are private. The server enforces ownership on private reads. An approved artifact exposes the material the person chose to share. |
| Session access | `GET /api/boards/:boardId/sessions` returns only the signed-in profile’s private sessions for the board. Direct access to another profile’s session returns HTTP 404. The separately seeded, read-only demo chats remain available in the finished example. |
| AI context | The server assembles board context from saved shared state. Private chats can also draw on their exploration context. Board content is input data. The Agent validates structured plans against real board references and checks decision intent against the person's instruction. |
| Runtime | The desktop browser client uses React and an infinite canvas. Yjs and Hocuspocus synchronize board state, SQLite persists board and private data, and the Node API handles AI requests. Live AI uses Sarvam Token Factory. Offline demo mode supplies sample responses. |

The prototype uses temporary profiles and link-based access. Account recovery, organization permissions, formal voting, native meeting capture, and production hosting guarantees are outside the demonstrated product scope.

## 6. Demo modes

| Start option | What it lets the team test |
| --- | --- |
| Start a new board | Framing a real problem, adding context, and collaborating from an empty workspace |
| Start a sample case | Beginning with the Split Buddy retention problem, options, and facts, then exploring and publishing original reasoning |
| Start mid-session | Organizing an existing pile of ideas and evaluating the Agent’s proposed changes |
| See a finished example | Inspecting how sorted ideas, scripted explorations, approved reports, and locked decisions relate |

## 7. Prototype evaluation

| Question | Observable evidence |
| --- | --- |
| Does shared context carry into private exploration? | The contributor identifies the scope and asks a useful first question without copying the selected notes into a separate chat. |
| Can a contributor find context after skipping setup? | The contributor skips a starter card, writes a note, then finds the matching form through **Context** in the sidebar. |
| Does the report preserve reasoning? | A second participant can explain the main finding, name a tradeoff or open question, and locate a source after reading the report. |
| Do people understand when work becomes shared? | Before publication, a second profile sees the shared notes and any reservation indicator. After approval, it sees the report. The contributor can explain what remained private. |
| Can people correct AI proposals before they affect the board? | A participant edits, excludes, or discards a proposed change, then applies and undoes a reviewed change. |
| Can a meeting provide a usable starting point? | A participant checks the source passage for a generated note or agreement, removes an unsupported item, and places the remaining draft. |
| Can the team recover the rationale behind a decision? | A peer opens a locked decision, follows a source reference, and explains what the decision covers and why it is in force. |
| Can a contributor turn reports into a decision? | The contributor selects reports, checks the source chips, edits the draft, and locks the decision. A peer can follow the published report links, while the discussion remains private. |

These are proposed observation criteria derived from the prototype. The repository contains scripted case material and implementation checks, with no measured product success thresholds in the sources reviewed.

## 8. Evidence and remaining verification

- Recorded verification includes TypeScript, 47 unit tests, and headless Chrome runs with offline AI for session privacy, drafting and locking decisions, toolbar lock and unlock, and the blank-board context and meeting flows. A second profile’s session list excluded the owner’s sessions, and a direct request returned HTTP 404. Live model quality for inferred meeting questions and report-based decision drafts remains unverified.
- The earlier sprint proposed a viewer switch, limited draft editing, and treated decisions as a static demo. The current implementation includes real-time profiles, editable drafts, and shared decision records.
- The progress log records prior manual checks and remaining gaps. Live AI classification and conflict detection vary across runs. The user-test record also leaves larger-board performance, network-loss recovery, and a full public two-device rehearsal open.
- Product rationale and planned scope come from [project context](project_context.md) and the [v2 build PRD](Build_PRD-1.md). Implementation history and differences are captured in the [progress log](PROGRESS.md) and [feature build notes](docs/build-notes/whiteboard-agent.md).
- Current behavior was traced through the [home screen](src/screens/Home.tsx), [board](src/canvas/BoardCanvas.tsx), [Agent conversation](src/canvas/AgentChat.tsx), [private canvas](src/screens/Canvas.tsx), [draft editor](src/screens/DraftSheet.tsx), [report reader](src/screens/ReportView.tsx), [decision surface](src/screens/DecisionCard.tsx), [meeting review](src/screens/MeetingSheet.tsx), and [server routes](server/index.ts).
