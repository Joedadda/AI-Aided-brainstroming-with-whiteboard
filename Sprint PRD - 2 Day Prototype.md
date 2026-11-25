# Sprint PRD: 2-Day Prototype

AI-native collaborative whiteboard (Concept 1). This is the build scope for a two-day sprint. It replaces the full PRD for building purposes.

## 1. Background

**Problem.** Brainstorming now happens across meetings, private AI chats, individual research and different tools. The reasoning behind an idea stays with the person who explored it. The group gets a conclusion without the evidence, the objections or the rejected options.

**Design question.** How might we help teams carry shared context into and out of AI-aided exploration, so they can build on ideas collectively?

**Users.** Mid-sized product, design or engineering teams of about 5 to 12 people, digital only.

| Persona | Role in the product |
|---|---|
| Asha, Hands-on Contributor (primary) | Takes cards into a private exploration, approves a report, returns it |
| Dev, Peer Reviewer (secondary) | Reads reports, questions them, builds on them |
| Meera, Lead or Stakeholder (tertiary) | Reads the summary and reasoning, signs off |

**What the research says.** Five interviews and nine papers. Teams move context between tools by hand (3 of 5). People keep the final decision (5 of 5). What travels between people is the recommendation and its reasoning (3 of 3 asked). AI output is checked by hand (3 of 5). There is little time for setup (2 of 5). No existing tool lets a private AI branch start from the shared board's context and return a structured synthesis to the group.

**Why this concept.** Concept 1 scored 94 against 68 and 55 for the alternatives. Its weak point is setup, so first use must need no setup.

## 2. Problem solving framework

The product is built on the Nominal Group Technique (Delbecq and Van de Ven, 1971; citation still to be verified). In its classic form, people write ideas silently, share them in turn, clarify them, then vote. The product keeps that shape and adds a frame step at the start. The wider loop is diverge, explore, converge, which the working title names: split, explore, merge.

| Step | Classic technique | In the product | Prototype status |
|---|---|---|---|
| 1. Frame | Not a separate step | The group frames the problem on the shared board | Built |
| 2. Silent generation | Each person writes ideas alone | A person takes cards into a private canvas and explores with the AI | Built |
| 3. Sharing | Ideas shared one at a time | The approved report lands on the board | Built |
| 4. Clarification | The group asks about each idea | Readers open findings, evidence, objections and rejected directions | Partly built (reading and expanding; asking the author is not built) |
| 5. Decision | The group votes or ranks | The group records a decision with its reasons | Mocked |

How the product departs from the classic method: it is not run live and not timed, the AI takes part in the silent generation step, a person approves what comes back before the group sees it, and the decision is recorded with its reasons and the reports behind it.

Rule for the sprint: a feature stays only if it serves one of these five steps.

## 3. Principles

- Context follows the idea.
- Exploration can be messy. The shared board stays clean.
- A merge is a synthesis, not a transcript dump.
- The AI takes part in the thinking. Humans decide. The AI never publishes to the board.

## 4. What the prototype must prove

Cards from a shared board go into a private AI exploration with the context already loaded, and a report with reasons comes back to the board for teammates to read.

## 5. The demo loop

Each step is tagged with its framework step.

1. Frame: the board shows a framed problem and a few cards.
2. Silent generation: the user selects cards and clicks Take cards with you.
3. Silent generation: a private canvas opens with the problem and cards loaded. A read-only list of context chips shows what the AI was given.
4. Silent generation: the user chats with the AI, including asking for alternatives and objections.
5. Sharing: the user clicks Make report. The AI fills the fixed template.
6. Sharing: the user clicks Approve. The report lands on the board with the contributor's name.
7. Clarification: the viewer switches to a teammate (Dev) and reads the report, summary first, then the other sections.
8. Decision (mock): one static decision card on the board, or the demo ends at step 7.

## 6. Build list

| Piece | What it is | Framework step | Day |
|---|---|---|---|
| Board | Problem statement at the top. Cards that can be added and selected. Approved reports in their own area | Frame | 1 |
| Take cards with you | Selected cards plus the problem open a private canvas | Silent generation | 1 |
| Context chips | Read-only list of the problem and cards the AI was given | Silent generation | 1 |
| Canvas chat | One real model call per message, with the chips as context | Silent generation | 1 |
| Make report | One model call that returns the fixed template as structured output | Sharing | 2 |
| Approve | One button. Puts the report on the board with the contributor's name | Sharing | 2 |
| Viewer switch | Toggle between Asha (contributor) and Dev (reader) in one browser. No sync | Clarification | 2 |
| Report view | Summary at the top, other sections collapsible | Clarification | 2 |
| Decision card mock | One static card | Decision | 2, if time |
| Polish and demo script | Empty and loading states, a rehearsed run | All | 2 |

## 7. Report template

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

## 8. AI behaviour (one system prompt)

- Use only the context given in the chips and what the user types.
- Give a reason for every finding, objection and rejected direction.
- Put anything uncertain under open questions, never under findings.
- Offer several directions and state objections when asked.
- Draft only. A person approves. Never record a group decision.
- All AI chat happens inside the product's own chat window. No connection to Claude, ChatGPT or other tools in this version.

## 9. Cut for the sprint

- Reservation dot and any live multi-user sync.
- Editing or removing context chips.
- Editing report sections before approval. Approve or regenerate only.
- The decision card as a working feature. It stays a mock.
- Locked decisions, Drop anything in, Overlap view, MCP or outside tool connections, voice input, decision history.
- Acceptance criteria tables, success measure targets and risk tables. These stay in the thesis.

## 10. Cut order if time runs short

1. Static decision card.
2. Collapsible sections in the report view.
3. Viewer switch. Show the report on the board instead.
4. Never cut Make report, Approve or the context chips.

## 11. Wording to use in the thesis

The prototype covers the framework up to the returned report. Clarification is partly covered and the decision step is shown as a mock. Multi-user sync, chip editing and report editing are left for later versions.
