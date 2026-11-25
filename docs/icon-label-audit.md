# Icon plus label audit (25 Nov 2026)

Every place in `src/` that shows an icon and visible text side by side. Read only: no code was changed. Icon-only buttons (aria-label, no visible text) are left out.

Screenshots were taken at a 1440x900 viewport in the app-alt copy. The browser pane draws that page at about 0.56 scale, so each crop was enlarged 2x when saved and looks soft.

| # | Visible text | Icon | Code | Where in the UI | Screenshot |
|---|---|---|---|---|---|
| 1 | Add finding, Add objection, Add rejected direction, Add question | `Plus` (lucide) | `src/ui/ReportEditor.tsx:282` (one `ListSection` button; labels at 163, 215, 232, 249) | Draft report sheet. Start a fresh case, Take section with you, send a chat message, Make report. Under each list | [finding](screenshots/icon-label/add-finding.png), [objection](screenshots/icon-label/add-objection.png), [rejected direction](screenshots/icon-label/add-rejected-direction.png), [question](screenshots/icon-label/add-question.png) |
| 2 | Add evidence | `Plus` (lucide) | `src/ui/ReportEditor.tsx:397` | Draft report sheet, under each finding's evidence | [add-evidence](screenshots/icon-label/add-evidence.png) |
| 3 | Your session draft is ready (plus Review button) | `Sparkles` (lucide) | `src/canvas/BoardCanvas.tsx:563` | Board, bottom left toast. Context (paperclip), Meeting, paste text, Add and build session, then close the panel before the draft finishes | [session-draft-ready-toast](screenshots/icon-label/session-draft-ready-toast.png) |
| 4 | AI named this board "..." (plus Rename, Undo) | `Sparkles` (lucide) | `src/canvas/BoardCanvas.tsx:643` | Board, bottom left toast. New whiteboard, add 3 notes with text; shows when the AI sets the title, then hides after about 8 seconds | [ai-named-this-board-toast](screenshots/icon-label/ai-named-this-board-toast.png) |
| 5 | Open a file | `FileText` (lucide) | `src/canvas/MeetingContext.tsx:84` | Board, Context panel (paperclip), Meeting tab, beside the meeting name field | [open-a-file](screenshots/icon-label/open-a-file.png) |
| 6 | From the meeting | `ChevronRight` (lucide, turns to point down when open) | `src/screens/MeetingSheet.tsx:182` | Session review sheet (Review on the toast in row 3), under each drafted note | [from-the-meeting](screenshots/icon-label/from-the-meeting.png) |
| 7 | Your canvas, 3 notes, Open | `LockIcon` (custom, wraps lucide `Lock`) | `src/canvas/BoardCanvas.tsx:502` | Board, under the Problem card, once you have taken a section | [your-canvas-chip](screenshots/icon-label/your-canvas-chip.png) |
| 8 | You (or the explorer's name) | colour dot plus `LockIcon` | `src/canvas/nodes.tsx:158` | Board, bottom right of each note someone is exploring privately | [lock-reservation-badge](screenshots/icon-label/lock-reservation-badge.png) |
| 9 | Select value, for example "Pick a finding" | `ChevronDown` (lucide) | `src/ui/Select.tsx:52` (used at `src/ui/ReportEditor.tsx:198`) | Draft report, only for evidence not tied to a finding ("Supports" picker) | Not captured: cannot be reached from the UI. Removing a finding also removes its evidence (`ReportEditor.tsx:127`), so loose evidence only appears if the AI returns evidence pointing at a finding that does not exist. No draft so far has had any |
| 10 | Select option label, for example "Finding 1" | `Check` on the chosen option | `src/ui/Select.tsx:67` | Same picker as row 9, when open | Not captured, same reason as row 9 |

## Not counted

- Colour dots before a name (author on notes `nodes.tsx:146`, others exploring `BoardCanvas.tsx:513`, report cards `nodes.tsx:412`, read-only canvas header `screens/Canvas.tsx:190`, report header `ui/ReportHeader.tsx:40`, connection state `ui/BoardHeader.tsx:218`). These are person or status markers, not icons, but the designer may want to judge them too.
- Live cursors with a name tag (`BoardCanvas.tsx:697`): a pointer shape plus name, standard for multiplayer.
- Toolbar tools, panel buttons (Context, AI ideas, Answer), Back to board, close and delete buttons: icon only with tooltips or aria-labels.
- Dock panel headers show text only; the icon lives on the toolbar button.
