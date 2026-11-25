import { useEffect, useRef, useState } from 'react';
import { BoardCanvas } from './canvas/BoardCanvas.tsx';
import { setAgentWorkspace } from './lib/agent.ts';
import { api } from './lib/api.ts';
import { connect, disconnect } from './lib/board.ts';
import { useProfile } from './lib/profile.ts';
import { go, useRoute } from './lib/router.ts';
import { refreshSessions } from './lib/sessions.ts';
import { Canvas } from './screens/Canvas.tsx';
import { DecisionView } from './screens/DecisionCard.tsx';
import { Home } from './screens/Home.tsx';
import { ProfileCard } from './screens/ProfileCard.tsx';
import { ReportView } from './screens/ReportView.tsx';
import { useStore } from './store.ts';
import { Badge } from './ui/Badge.tsx';
import { BoardTitle, ConnectionState, People, ProfileMenu, ShareLink } from './ui/BoardHeader.tsx';
import { Tooltip, TooltipProvider } from './ui/Tooltip.tsx';

export function App() {
  const route = useRoute((s) => s.route);
  const profile = useProfile((s) => s.profile);
  const [mockAI, setMockAI] = useState(false);
  useEffect(() => {
    api
      .health()
      .then((h) => setMockAI(h.mock))
      .catch(() => {});
  }, []);

  const boardId = route.name === 'home' ? null : route.boardId;
  const userId = profile?.userId;
  useEffect(() => setAgentWorkspace(boardId && userId ? `${userId}:${boardId}` : null), [boardId, userId]);

  // Stay connected to the board while moving between the board, a canvas and a report.
  useEffect(() => {
    if (!profile || !boardId) return;
    connect(boardId);
  }, [boardId, profile]);
  useEffect(() => () => disconnect(), []);
  useEffect(() => {
    if (!boardId) disconnect();
  }, [boardId]);

  useEffect(() => {
    if (userId && boardId) void refreshSessions(boardId);
  }, [userId, boardId, route.name]);

  const reportTitle = useStore((s) => (route.name === 'report' ? s.reports.find((r) => r.id === route.reportId)?.body.title : undefined));
  const decisionTitle = useStore((s) => route.name === 'decision'
    ? s.decisions.find((d) => d.id === route.decisionId)?.text ?? (route.decisionId === 'legacy' ? s.meta.decision?.title : undefined)
    : undefined);
  const boardTitle = useStore((s) => s.meta.title);

  // Client-side route changes reset nothing, so do it by hand: a title per view, and focus to its heading.
  const routeKey = route.name === 'home' ? 'home' : route.name === 'board' ? 'board' : route.name === 'canvas' ? route.explorationId : route.name === 'decision' ? route.decisionId : route.reportId;
  const firstRender = useRef(true);
  useEffect(() => {
    const view =
      route.name === 'home' ? 'Start' : route.name === 'board' ? boardTitle || 'Untitled board' : route.name === 'canvas' ? 'Private canvas' : route.name === 'decision' ? (decisionTitle ?? 'Decision') : (reportTitle ?? 'Report');
    document.title = `${view} · Split, Explore, Merge`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (route.name === 'board') requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-route-focus]')?.focus());
  }, [routeKey, reportTitle, decisionTitle, route.name, boardTitle]);

  if (!profile) {
    return (
      <TooltipProvider delay={400}>
        <div className="flex h-dvh flex-col">
          <ProfileCard
            intro={
              boardId
                ? 'Someone shared a whiteboard with you. Pick the name others will see, and you are in.'
                : 'Pick the name others will see on the board. No account, no email.'
            }
          />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delay={400}>
      <div className="flex h-dvh flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface pr-5 pl-3">
          <div className="flex min-w-0 items-center gap-3">
            <a
              href="/"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                go({ name: 'home' });
              }}
              aria-label="Home"
              // Placeholder mark until there is a logo (user decision, 25 Nov).
              className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[20px] leading-none font-extrabold tracking-tight hover:bg-surface-2"
            >
              S
            </a>
            {boardId && (
              <>
                <span aria-hidden className="h-5 w-px bg-line" />
                <BoardTitle boardId={boardId} />
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {boardId && <ConnectionState />}
            {mockAI && (
              <Tooltip label="No AI key on the server, so the AI replies are canned. Add SARVAM_API_KEY to .env for live replies.">
                <span tabIndex={0} className="cursor-default">
                  <Badge tone="draft">Offline demo</Badge>
                </span>
              </Tooltip>
            )}
            {boardId && <People />}
            {boardId && <ShareLink boardId={boardId} />}
            <ProfileMenu />
          </div>
        </header>
        {/* scroll-pt clears the report view's sticky back bar for focused elements. */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-pt-16">
          {route.name === 'home' ? (
            <Home />
          ) : route.name === 'board' ? (
            <BoardCanvas key={route.boardId} boardId={route.boardId} />
          ) : route.name === 'canvas' ? (
            <Canvas
              key={`${userId}:${route.boardId}:${route.explorationId}`}
              boardId={route.boardId}
              explorationId={route.explorationId}
              reviewReport={route.reviewReport}
              initialExploration={route.handoff?.viewerId === userId ? route.handoff?.exploration : undefined}
            />
          ) : route.name === 'decision' ? (
            <DecisionView key={route.decisionId} boardId={route.boardId} decisionId={route.decisionId} />
          ) : (
            <ReportView key={route.reportId} boardId={route.boardId} reportId={route.reportId} />
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
