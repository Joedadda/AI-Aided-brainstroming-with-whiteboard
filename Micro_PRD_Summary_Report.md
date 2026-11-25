# Micro PRD: The Summary Report

Status: work in progress.

## Purpose and readers

The summary report is the unit that moves from a private exploration back to the group. It is the part of the product that carries context and reasoning, so it gets its own spec. This micro PRD sits under the main PRD for the AI-native collaborative whiteboard.

The AI drafts the report from the exploration. The Hands-on Contributor edits and approves it. Peer Reviewers read it and build on it. The Lead or Stakeholder reads it to understand the reasoning behind a direction, and in some teams to decide what can be promised to a client or marketed.

**What a good report does.** A reader can see what was explored and why in about a minute, and can open the evidence, objections and rejected directions when they want the detail.

## Report structure

Every report uses one fixed template.

| Section | What it holds | Why it is there |
|---|---|---|
| Header | Title, the contributor's name, the cards used, the date and the status (draft or approved) | Readers know who explored what, and from which cards |
| Summary | A short paragraph a non-technical teammate can read on its own | Lets a reader decide in seconds whether to read further |
| Findings | What the exploration found, each with its reason | Reasoning travels with the result |
| Evidence | The sources and facts behind each finding, linked where possible | Readers can check the claim |
| Objections | The strongest arguments against the direction | Keeps the group from building on an untested idea |
| Rejected directions | Options that were considered and dropped, with the reason | Stops the group from repeating the same exploration |
| Open questions | What is still unknown, including anything the AI is unsure of | Separates what is known from what is guessed |

## Requirements

| ID | Requirement | Acceptance criteria | Source |
|---|---|---|---|
| RPT-1 | The report follows the fixed template | Every section is present; a section with nothing to report says so | Requirement 9 (P2) |
| RPT-2 | The AI drafts from the exploration only | The draft uses the chat, notes and context chips of that exploration and nothing else | Requirements 1 and 2 (P2, P5) |
| RPT-3 | Every item carries its reason | No finding, objection or rejected direction appears without a reason | Requirement 10 (P2) |
| RPT-4 | The summary opens the report | A short summary sits at the top and reads on its own, in about a minute (target to confirm) | Requirement 12 (P2) |
| RPT-5 | The contributor can edit every section | Any section can be edited, removed or redrafted before approval | Requirement 11 (all five) |
| RPT-6 | A report stays a draft until a person approves it | A draft is visible only to its author; only an approved report appears on the board | Requirement 11 (all five) |
| RPT-7 | The contributor's name is on the report | The name shows on the report and on its board card | Requirement 14 (P2, P4) |
| RPT-8 | Uncertainty goes to open questions | Anything the AI marks as unsure appears under open questions and not as a finding | AI behaviour rule AI-6 |
| RPT-9 | The report links back to its source | A reader can open the cards used and see which exploration it came from | Review 2 ideas 1 and 9 |
| RPT-10 | The decision card links to reports | A decision card lists the reports that informed it | Requirement 15 (P2, hypothesis) |

## Sharing and open questions

**What is settled.** An approved report is placed on the shared board, where the whole team can see it with the contributor's name on it. The decision card links to it. In this version there is no other way to share a report.

**What is not settled.** No export, link or outside-the-board sharing method has been agreed. The options below are listed so the choice can be made on purpose.

| Option | What it would do | Who it helps |
|---|---|---|
| Board only | The report lives on the board and readers need access to it | Teammates already in the workspace |
| Read-only link | Anyone with the link can read the report without an account | Stakeholders in sales or marketing, and clients' contacts if allowed |
| Export as a document | Download the report as a PDF or markdown file | Readers who want it in an email or a doc; developers read markdown |
| Copy as text | Copy the report into a message or another tool | Quick sharing in chat |

The interviews hint that the reader decides the format: developers read markdown, and non-technical teams want artifacts or slides. That finding rests on one participant and is a hypothesis.

**Open questions**

- Does a stakeholder outside the team, such as someone in sales or marketing, need to read a report without a board account?
- Can a report be edited after approval, and if so, does the board show a version history?
- Does the report update when the exploration continues, or does a new one replace it?
- Which sharing option, if any, goes into the first build?

## Note for the 2-day sprint

The prototype builds a reduced version of this spec: the fixed template (RPT-1), drafting from the exploration only (RPT-2), a reason on every item (RPT-3), the summary on top (RPT-4), draft until approved (RPT-6), the contributor's name (RPT-7), and uncertainty under open questions (RPT-8). Editing sections (RPT-5), source links (RPT-9), decision card links (RPT-10) and any sharing beyond the board are left out.
