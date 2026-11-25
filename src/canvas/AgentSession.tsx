import { useState } from 'react';
import { AGENT_LIMITS } from '../../shared/agent-schema.ts';
import { isEmptyReport } from '../../shared/report-schema.ts';
import type { Exploration } from '../../shared/types.ts';
import { useAgent } from '../lib/agent.ts';
import { api } from '../lib/api.ts';
import { AddOwnContext, GivenChips } from '../screens/Canvas.tsx';
import { DraftSheet } from '../screens/DraftSheet.tsx';
import { LockedBlock } from '../screens/LockedBlock.tsx';
import { useStore } from '../store.ts';
import { Button } from '../ui/Button.tsx';

/*
  The full-screen Agent is the private canvas (user, 25 Nov): context chips, your own context,
  findings and the report. The sidebar agent has no server record, so one is made the first time
  something needs it (adding your own context, or making a report): an exploration holding the
  notes in scope and the exchanges so far. Later exchanges are appended to it.
*/

/** The notes the agent is sent: the selection, else every note, newest first up to the cap. */
function useScopeNotes() {
  const cards = useStore((s) => s.cards);
  const selected = useStore((s) => s.selected);
  const withText = cards.filter((c) => c.text.trim());
  const picked = withText.filter((c) => selected.includes(c.id));
  return [...(picked.length ? picked : withText)]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, AGENT_LIMITS.scopeNotes)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Create the session's exploration, or bring it up to date. */
async function syncSession(boardId: string, noteIds: string[]): Promise<Exploration> {
  const { log, session } = useAgent.getState();
  const sent = log.length;
  const ex = await api.agentSession({ boardId, noteIds, messages: log, explorationId: session?.ex.id, sent: session?.sent ?? 0 });
  useAgent.setState({ session: { ex, sent } });
  return ex;
}

const setEx = (fn: (e: Exploration | null) => Exploration | null) =>
  useAgent.setState((s) => {
    const ex = s.session && fn(s.session.ex);
    return ex ? { session: { ...s.session!, ex } } : {};
  });

/** What the agent is sent with its next instruction (server/agent/context.ts), read from the live board. */
export function AgentGiven({ boardId }: { boardId: string }) {
  const problem = useStore((s) => s.problem);
  const chips = useStore((s) => s.chips);
  const notes = useScopeNotes();
  const session = useAgent((s) => s.session);
  const [opening, setOpening] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState('');
  const own = session?.ex.snapshot.chips.filter((c) => c.private) ?? [];
  const note = 'Only you see this. The agent reads it. Nothing goes on the board unless you apply a plan or approve a report.';

  const start = async () => {
    setOpening(true);
    setError('');
    try {
      await syncSession(boardId, notes.map((n) => n.id));
      setStarted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add context. Try again.');
    } finally {
      setOpening(false);
    }
  };

  // Capped, so a whole board of chips does not push the conversation off screen.
  return (
    <div className="flex max-h-[45vh] shrink-0 flex-col overflow-y-auto rounded-md border border-line [&>*]:shrink-0">
      <LockedBlock boardId={boardId} seen={null} />
      <GivenChips
        snapshot={{
          problem,
          boardTitle: '',
          notes: notes.map((n) => ({ id: n.id, text: n.text, author: n.author })),
          chips: [...chips.filter((c) => c.status === 'ready').map((c) => ({ id: c.id, type: c.type, title: c.title, summary: c.summary, source: c.source })), ...own],
        }}
      >
        {session ? (
          <AddOwnContext key={session.ex.id} ex={session.ex} setEx={setEx} startOpen={started} note={note} />
        ) : (
          <>
            <button type="button" disabled={opening || !notes.length} onClick={() => void start()} className="mt-3 text-[13px] font-medium text-accent hover:underline disabled:text-ink-3">
              {opening ? 'Opening…' : 'Add your own context'}
            </button>
            {error && (
              <p role="alert" className="mt-1 text-[12px] text-danger">
                {error}
              </p>
            )}
          </>
        )}
      </GivenChips>
    </div>
  );
}

/** Findings and the report, beside the full-screen Agent. */
export function AgentFindings({ boardId, onApproved }: { boardId: string; onApproved: () => void }) {
  const session = useAgent((s) => s.session);
  const answered = useAgent((s) => s.log.some((m) => m.role === 'assistant'));
  const running = useAgent((s) => s.run?.status === 'running');
  const notes = useScopeNotes();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const ex = session?.ex;
  const draft = ex?.draft;
  const stale = Boolean(draft && isEmptyReport(draft.body) && answered);

  const make = async () => {
    setDrafting(true);
    setError(undefined);
    try {
      const cur = await syncSession(boardId, notes.map((n) => n.id));
      const r = await api.makeReport(cur.id);
      setEx((e) => (e ? { ...e, draft: { id: r.reportId, explorationId: cur.id, status: 'draft', body: r.body, createdAt: r.createdAt } } : e));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setDrafting(false);
    }
  };

  return (
    <aside aria-label="Findings" className="flex w-[320px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line px-5 py-4">
      <h3 className="text-[13px] font-semibold">Findings</h3>
      {draft && !drafting ? (
        <ul className="flex flex-col gap-2">
          {draft.body.findings.map((f, i) => (
            <li key={i} className="rounded-md border border-ai-line bg-ai-bg px-3 py-2.5 text-[13px] leading-snug">
              <p className="text-ink">{f.text}</p>
              <p className="mt-1 text-ink-2">
                <span className="font-medium text-ink-3">Reason: </span>
                {f.reason}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-line-strong px-4 py-5 text-[13px] leading-relaxed text-ink-2">
          {drafting ? 'The AI is drafting the report…' : answered ? 'Make a report and the AI drafts the findings here for you to approve or regenerate.' : 'Ask the agent something first. The report is written from that conversation.'}
        </p>
      )}
      {error && !sheetOpen && (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      )}
      <Button
        variant="primary"
        disabled={drafting || running || !notes.length || (!draft && !answered)}
        onClick={() => {
          setSheetOpen(true);
          if (!draft || stale) void make();
        }}
      >
        {drafting ? 'Drafting…' : draft && !stale ? 'Review draft' : 'Make report'}
      </Button>
      {ex && (
        <DraftSheet
          boardId={boardId}
          ex={ex}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          drafting={drafting}
          error={error}
          onRegenerate={() => void make()}
          onSaved={(body, editedAt) => setEx((e) => (e?.draft ? { ...e, draft: { ...e.draft, body, editedAt } } : e))}
          onApproved={() => {
            useAgent.setState({ session: null, log: [] });
            onApproved();
          }}
        />
      )}
      {/* The first draft is being made, so there is no exploration to hang the sheet on yet. */}
      {!ex && sheetOpen && drafting && (
        <p role="status" className="text-[12px] text-ink-3">
          Saving the conversation…
        </p>
      )}
    </aside>
  );
}
