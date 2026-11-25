# Project context: AI-native collaborative whiteboard (2-day prototype)

Condensed from the Thesis Project docs (Concept Summary, Stage 1, Documentation, Reference, Sprint PRD). Read this first. Build to the "Sprint scope" section. Everything else is background.

## 1. What this is

A final-year interaction design thesis project (Adithya Chaitanya, PES Institute of Design). Review 3 is on 26 Nov 2026. The product is a shared whiteboard with an AI chat built in. Working title: "Split, Explore, Merge" (final title not chosen). The prototype is a real working app, tested with users, and may be shipped later as a side project.

**Problem.** Brainstorming now happens across meetings, private AI chats, individual research and different tools. The reasoning behind an idea stays with the person who explored it. The group gets a conclusion without the evidence, objections or rejected options.

**Design question.** How might we help teams carry shared context into and out of AI-aided exploration, so they can build on ideas collectively?

**Idea in one line.** Take cards from a shared board into a private AI canvas with the context already loaded, explore with the AI, and bring back an approved report with reasons that the team can read.

## 2. Users

Mid-sized product, design or engineering teams of about 5 to 12 people, digital only.

| Persona | Role in the product | Need |
|---|---|---|
| Asha, Hands-on Contributor (primary) | Takes cards into a private exploration, approves a report, returns it | Context should follow the idea |
| Dev, Peer Reviewer (secondary) | Reads reports, questions them, builds on them | See what others explored, not just what was decided |
| Meera, Lead or Stakeholder (tertiary) | Reads the summary and reasoning, signs off | A clear synthesis of what was explored, rejected and decided |

## 3. Research findings that drive the design

From 5 interviews and 9 papers.
- Teams move context between tools by hand (3 of 5).
- People keep the final decision (5 of 5). AI drafts, humans approve.
- What travels between people is the recommendation and the reasoning (3 of 3 asked).
- AI output is checked by hand before it is trusted (3 of 5).
- Little time for setup (2 of 5). First use must need no setup.
- Gap in existing work: no tool lets a private AI branch start from the shared board's context and return a structured synthesis to the group.

## 4. Concept decision

Three concepts were scored on a weighted matrix. Concept 1 (whiteboard with AI built in) scored 94, the connector layer 68, the shared synthesis page 55. Concept 1 is chosen. Its weak point is setup, because a team has to put its work on the board. First-use friction is the main risk to test.

## 4a. Problem solving framework (the spine of the product)

The product is built on the Nominal Group Technique (Delbecq and Van de Ven, 1971; citation still to be verified). In its classic form, people write ideas silently, share them in turn, clarify them, then vote. The product keeps that shape and adds a frame step at the start. The wider loop is diverge, explore, converge, which the working title names: split, explore, merge.

| Step | Classic technique | In the product | Prototype status |
|---|---|---|---|
| 1. Frame | Not a separate step | The group frames the problem on the shared board | Built (problem statement and cards on the board) |
| 2. Silent generation | Each person writes ideas alone | A person takes cards into a private canvas and explores with the AI | Built (canvas, chips, chat) |
| 3. Sharing | Ideas shared one at a time | The approved report lands on the board | Built (Make report, Approve) |
| 4. Clarification | The group asks about each idea | Readers open findings, evidence, objections and rejected directions | Partly built (read and expand the report; asking the author is not built) |
| 5. Decision | The group votes or ranks | The group records a decision with its reasons | Mocked (one static card, or end the demo at the report) |

How the product departs from the classic method:
- It is not run live and not timed.
- The AI takes part in the silent generation step.
- A person approves what comes back before the group sees it.
- The decision is recorded with its reasons and the reports behind it.

Every build choice should be checked against this loop. If a feature does not serve one of the five steps, cut it.

## 5. Principles

- Context follows the idea.
- Exploration can be messy. The shared board stays clean.
- A merge is a synthesis, not a transcript dump.
- The AI takes part in the thinking. Humans decide. The AI never publishes to the board.

## 6. Sprint scope (build this)

**Must prove:** cards from a shared board go into a private AI exploration with context loaded, and a report with reasons comes back to the board for a teammate to read.

**Demo loop**
1. Board shows a framed problem and a few cards.
2. User selects cards and clicks "Take cards with you".
3. A private canvas opens with the problem and cards loaded. A read-only list of context chips shows what the AI was given.
4. User chats with the AI, including asking for alternatives and objections.
5. User clicks "Make report". The AI fills the fixed template.
6. User clicks "Approve". The report lands on the board with the contributor's name.
7. Viewer switches to a teammate (Dev) and reads the report: summary first, then the other sections.

**Build list**

| Piece | What it is | Day |
|---|---|---|
| Board | Problem statement at the top. Cards that can be added and selected. Approved reports in their own area | 1 |
| Take cards with you | Selected cards plus the problem open a private canvas | 1 |
| Context chips | Read-only list of the problem and cards the AI was given | 1 |
| Canvas chat | One real model call per message, with the chips as context | 1 |
| Make report | One model call that returns the fixed template as structured output | 2 |
| Approve | One button. Puts the report on the board with the contributor's name | 2 |
| Viewer switch | Toggle between Asha (contributor) and Dev (reader) in one browser. No sync | 2 |
| Report view | Summary at the top, other sections collapsible | 2 |
| Polish and demo script | Empty and loading states, a rehearsed run | 2 |

**Cut for the sprint:** reservation dot, live multi-user sync, editing or removing context chips, editing report sections before approval (approve or regenerate only), the decision card as a feature (show one static mock card, or end the demo at the report landing), locked decisions, drag-in of outside content, overlap view, MCP or outside tool connections, voice input, decision history.

**If time runs short, cut in this order:** static decision card, collapsible sections, viewer switch (show the report on the board instead). Never cut Make report, Approve or the context chips.

## 7. Data model (suggested)

- Board: id, problem statement.
- Card: id, board id, text, author.
- Exploration: id, contributor, card ids, chat messages, status (open or closed).
- Report: id, exploration id, contributor, card ids, status (draft or approved), and the template fields below.

## 8. Report template (structured output)

| Section | What it holds |
|---|---|
| Header | Title, contributor name, cards used, status |
| Summary | A short paragraph that reads on its own |
| Findings | What was found, each with its reason |
| Evidence | Sources or facts behind each finding |
| Objections | The strongest arguments against the direction |
| Rejected directions | Options dropped, with the reason |
| Open questions | What is unknown, including anything the AI is unsure of |

Rule: no finding, objection or rejected direction without a reason.

## 9. AI behaviour (one system prompt)

- Use only the context given in the chips and what the user types.
- Give a reason for every finding, objection and rejected direction.
- Put anything uncertain under open questions, never under findings.
- Offer several directions and state objections when asked.
- Draft only. A person approves. Never record a group decision.
- All AI chat happens inside the product's own chat window. No connection to Claude, ChatGPT or other tools in this version.

## 10. Screens (working titles)

Board, Take cards with you, Private canvas (chat, notes, findings), Context chips, Draft report, Approve and return, Report view as seen by Dev.

## 11. UI notes

Desktop web, minimum width 1024 px. Board fills the window with the problem fixed at the top. Canvas: chat on the left, notes and findings on the right, chips in a row above the chat. Cards about 240 by 160 px. Report is a single column about 680 px wide. 8 px grid. Keep AI-written text visually distinct from human text, and show draft and approved states with a label as well as colour. Text contrast at least 4.5 to 1. Everything works from the keyboard.

## 12. Which AI model the prototype itself calls (runtime, not the coding model)

This section is about the model behind the product's AI features, called through the API from inside the app. It is not about which model writes the code.

- Canvas chat: start on a small model (Haiku class).
- Make report (structured output): start on Sonnet.
- Move the chat up to Sonnet only if replies read thin.
- Keep the model names in one config file so they are easy to change.

## 13. Writing and style preferences for any user-facing copy

Plain, accessible language. No jargon. Dry, confident tone. No em dashes. No emojis. Concise.
