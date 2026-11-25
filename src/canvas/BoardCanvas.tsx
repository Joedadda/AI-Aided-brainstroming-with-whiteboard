import { Minus, Plus, Sparkles, X } from 'lucide-react';
import { coverOf } from '../../shared/decision-schema.ts';
import {
  Background,
  BackgroundVariant,
  NodeToolbar,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  Position,
  NodeChangeset,
  SelectionMode,
  getViewportForBounds,
  useNodesInitialized,
  useReactFlow,
  useViewport,
  type Node,
  type OnNodesChange,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StickyColor } from '../../shared/types.ts';
import { STICKY, membersOf } from '../../shared/ydoc.ts';
import { api } from '../lib/api.ts';
import { board, setCursor, setSelectionPresence } from '../lib/board.ts';
import { noteColorOf, useProfile } from '../lib/profile.ts';

import { useStore } from '../store.ts';
import { Button } from '../ui/Button.tsx';
import { cx } from '../ui/cx.ts';
import { AskAI } from './AskAI.tsx';
import { Sidebar } from './Dock.tsx';
import { LockGlyph, shorten } from './LockPanel.tsx';
import { NoteColorPicker } from './ColorPicker.tsx';
import { nodeTypes, takeNotes } from './nodes.tsx';
import { ProblemField } from './ProblemField.tsx';
import { Toolbar, type Tool } from './Toolbar.tsx';
import { MeetingSheet } from '../screens/MeetingSheet.tsx';
import { openSheet } from '../lib/meeting.ts';
import { openAgent } from '../lib/agent.ts';


const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
/** Keeps fitted content clear of the toolbar (bottom); the top follows the Problem card when it is shown. */
const FIT_PADDING = { top: '40px', bottom: '110px', left: '40px', right: '40px' } as const;

/** Fit below the Problem card, whose height depends on how long the problem is. It can be hidden. */
function fitPadding(wrap: HTMLElement | null) {
  const panel = document.getElementById('frame-panel');
  if (!wrap || !panel || !useStore.getState().problemPinned) return FIT_PADDING;
  const top = Math.round(panel.getBoundingClientRect().bottom - wrap.getBoundingClientRect().top + 24);
  return { ...FIT_PADDING, top: `${Math.max(40, top)}px` as const };
}

export function BoardCanvas({ boardId }: { boardId: string }) {
  return (
    <ReactFlowProvider>
      <CanvasInner boardId={boardId} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ boardId }: { boardId: string }) {
  const cards = useStore((s) => s.cards);
  const sections = useStore((s) => s.sections);
  const reports = useStore((s) => s.reports);
  const synced = useStore((s) => s.synced);
  const kind = useStore((s) => s.meta.kind);
  const justLanded = useStore((s) => s.justLanded);
  const selected = useStore((s) => s.selected);
  const deletedLabel = useStore((s) => s.deletedLabel);
  const titleToast = useStore((s) => s.titleToast);
  const lockToast = useStore((s) => s.lockToast);
  const decisionCount = useStore((s) => s.decisions.length);
  const meetingToast = useStore((s) => s.meetingToast);
  const problemPinned = useStore((s) => s.problemPinned);
  const me = useProfile((s) => s.profile!.userId);

  const flow = useReactFlow();
  const [tool, setTool] = useState<Tool>('select');

  // Reports and the decision mock sit to the right of everything else on the board.
  const right = useMemo(() => {
    const edges = [...cards.map((c) => c.x + c.w), ...sections.map((s) => s.x + s.w)];
    const tops = [...cards.map((c) => c.y), ...sections.map((s) => s.y)];
    return { x: (edges.length ? Math.max(...edges) : 0) + 160, y: tops.length ? Math.min(...tops) : 0 };
  }, [cards, sections]);

  // ---- Build nodes from the shared document; keep React Flow's own selection and measurements. ----
  const built = useMemo<Node[]>(() => {
    const sectionNodes: Node[] = sections.map((s) => ({
      id: s.id,
      type: 'section',
      position: { x: s.x, y: s.y },
      width: s.w,
      height: s.h,
      zIndex: 0,
      // Moved by its header only, and its body lets clicks through to the canvas,
      // so a selection box can start inside a section (as in FigJam).
      dragHandle: '.section-handle',
      style: { pointerEvents: 'none' },
      data: { section: s, memberIds: membersOf(s, cards).map((c) => c.id) },
      ariaLabel: `Section ${s.title}`,
    }));
    const stickyNodes: Node[] = cards.map((c) => {
      const end = /[.!?]$/.test(c.text) ? '' : '.';
      const reserved = c.reservedBy ? `${end} Being explored privately by ${c.reservedBy === me ? 'you' : c.reservedByName}.` : '';
      return {
        id: c.id,
        type: 'sticky',
        position: { x: c.x, y: c.y },
        width: c.w,
        height: c.h,
        zIndex: 10,
        data: { card: c },
        ariaLabel: `${c.origin === 'ai' ? 'AI note placed by' : 'Note from'} ${c.author}: ${c.text || 'empty'}${reserved}`,
      };
    });
    // Case boards show the Reports and Decision slots from the start (spec section 8).
    const fixed: Node[] = reports.length || decisionCount || kind !== 'blank'
      ? [
          // React Flow turns pointer events off on nodes that are neither draggable nor selectable,
          // which made every report and decision link unclickable. "all" turns them back on.
          { id: 'reports', type: 'reports', position: right, data: {}, draggable: false, selectable: false, deletable: false, zIndex: 0, style: { pointerEvents: 'all' }, ariaLabel: 'Reports' },
          {
            id: 'decision',
            type: 'decision',
            position: { x: right.x + 400, y: right.y },
            data: {},
            draggable: false,
            selectable: false,
            deletable: false,
            zIndex: 0,
            style: { pointerEvents: 'all' },
            ariaLabel: 'Decisions',
          },
        ]
      : [];
    return [...sectionNodes, ...stickyNodes, ...fixed];
  }, [cards, sections, reports.length, decisionCount, kind, right, me]);

  const [nodes, setNodes] = useState<Node[]>(built);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const dragging = useRef(false);
  useEffect(() => {
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return built.map((n) => {
        const o = old.get(n.id);
        const sel = o?.selected ?? false;
        // While this person drags, keep their local positions so remote updates do not snap the drag back.
        const position = dragging.current && o?.dragging ? o.position : n.position;
        return { ...n, position, dragging: o?.dragging, selected: sel, measured: o?.measured, zIndex: n.type === 'sticky' && sel ? 20 : n.zIndex };
      });
    });
  }, [built]);

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    // React Flow 13 hands over a changeset object. Copy it out and drop removals: those go
    // through the shared document via onNodesDelete, so the canvas never drifts from it.
    let keep = changes.toArray().filter((c) => c.type !== 'remove');
    // A selection box that touches notes should pick the notes, not the section around them.
    const kinds = new Map(nodesRef.current.map((n) => [n.id, n.type]));
    const picksSticky = keep.some((c) => c.type === 'select' && c.selected && kinds.get(c.id) === 'sticky');
    if (picksSticky) {
      keep = keep.map((c) => (c.type === 'select' && c.selected && kinds.get(c.id) === 'section' ? { ...c, selected: false } : c));
      for (const n of nodesRef.current) {
        if (n.type === 'section' && n.selected && !keep.some((c) => c.type === 'select' && c.id === n.id)) keep.push({ type: 'select', id: n.id, selected: false });
      }
    }
    if (!keep.length) return;
    setNodes((ns) => new NodeChangeset(keep).applyTo(ns));
  }, []);

  // ---- Dragging a section carries the notes inside it. ----
  const carry = useRef<Map<string, { start: { x: number; y: number }; members: Map<string, { x: number; y: number }> }>>(new Map());

  const onNodeDragStart: OnNodeDrag = useCallback((_e, _node, dragged) => {
    dragging.current = true;
    carry.current.clear();
    const draggedIds = new Set(dragged.map((n) => n.id));
    for (const n of dragged) {
      if (n.type !== 'section') continue;
      const s = useStore.getState().sections.find((x) => x.id === n.id);
      if (!s) continue;
      const members = new Map(
        membersOf(s, useStore.getState().cards)
          .filter((c) => !draggedIds.has(c.id))
          .map((c) => [c.id, { x: c.x, y: c.y }]),
      );
      carry.current.set(n.id, { start: { ...n.position }, members });
    }
  }, []);

  const onNodeDrag: OnNodeDrag = useCallback((_e, _node, dragged) => {
    if (!carry.current.size) return;
    const moves = new Map<string, { x: number; y: number }>();
    for (const n of dragged) {
      const c = carry.current.get(n.id);
      if (!c) continue;
      const dx = n.position.x - c.start.x;
      const dy = n.position.y - c.start.y;
      c.members.forEach((p, id) => moves.set(id, { x: p.x + dx, y: p.y + dy }));
    }
    setNodes((ns) => ns.map((n) => (moves.has(n.id) ? { ...n, position: moves.get(n.id)! } : n)));
  }, []);

  const onNodeDragStop: OnNodeDrag = useCallback((_e, _node, dragged) => {
    dragging.current = false;
    const out = dragged.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
    for (const n of dragged) {
      const c = carry.current.get(n.id);
      if (!c) continue;
      const dx = n.position.x - c.start.x;
      const dy = n.position.y - c.start.y;
      c.members.forEach((p, id) => out.push({ id, x: p.x + dx, y: p.y + dy }));
    }
    carry.current.clear();
    board.moveItems(out);
  }, []);

  // ---- Tools ----
  const addAt = useCallback(
    (t: 'sticky' | 'section', p: { x: number; y: number }) => {
      if (t === 'sticky') {
        const id = board.addNote(p);
        useStore.setState({ editingId: id });
      } else board.addSection(p);
      setTool('select');
    },
    [],
  );

  const placeAt = useCallback(
    (clientX: number, clientY: number) => {
      const p = flow.screenToFlowPosition({ x: clientX, y: clientY });
      if (tool === 'sticky' || tool === 'section') addAt(tool, p);
    },
    [flow, tool, addAt],
  );

  /** Keyboard path for adding: drop the new item in the middle of the view (WB-1). */
  const viewCentre = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }, [flow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : document.body;
      if (t.closest('input, textarea, [contenteditable="true"]')) return;
      const k = e.key.toLowerCase();
      // WB-6: undo and redo this person's own edits.
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) board.redo();
        else board.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault();
        board.redo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Enter on a focused note edits it (the keyboard twin of clicking the note).
      const note = k === 'enter' ? t.closest<HTMLElement>('.react-flow__node-sticky') : null;
      if (note?.dataset.id) {
        e.preventDefault();
        useStore.setState({ editingId: note.dataset.id });
        return;
      }
      if (k === 'v') setTool('select');
      else if (k === 'h') setTool('hand');
      else if (k === 's' && e.shiftKey) setTool('section');
      else if (k === 's') setTool('sticky');
      else if (k === 'escape') {
        setTool('select');
        useStore.setState({ editingId: undefined });
      } else if (k === 'enter' && (tool === 'sticky' || tool === 'section') && !t.closest('button')) {
        addAt(tool, viewCentre());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, addAt, viewCentre]);

  // ---- Presence: my selection is visible to others (WB-10). ----
  useEffect(() => setSelectionPresence(selected), [selected]);

  // ---- WB-9: the first open frames the existing content, or centres an empty canvas. ----
  const reveal = useStore((s) => s.reveal);
  const nodesReady = useNodesInitialized();
  const framed = useRef(false);
  useEffect(() => {
    if (!synced || framed.current) return;
    if (cards.length + sections.length > 0 && !nodesReady) return;
    framed.current = true;
    if (reveal?.length) return; // the reveal effect frames instead
    const el = wrapRef.current;
    if (!cards.length && !sections.length) {
      if (el) flow.setViewport({ x: el.clientWidth / 2 - 180, y: el.clientHeight / 2, zoom: 1 });
      return;
    }
    // The decision card is tall; leaving it out keeps the notes readable. It sits just to the right, and Fit shows everything.
    requestAnimationFrame(() => frameNodes(nodesRef.current.filter((n) => n.id !== 'decision').map((n) => n.id), 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced, nodesReady, cards.length, sections.length, flow, reveal]);

  // ---- When a report lands, bring it into view. ----
  const landedFramed = useRef<string | undefined>(undefined);
  useEffect(() => {
    // Once per report: nodesReady flips again whenever a new note is measured.
    if (!justLanded || !nodesReady || landedFramed.current === justLanded) return;
    landedFramed.current = justLanded;
    const t = window.setTimeout(() => frameNodes(['reports', 'decision'], 600), 120);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justLanded, nodesReady]);

  /** Frame given nodes by computing the view from their bounds (fitView with a node list did not move on a fresh mount). */
  const frameNodes = useCallback(
    (ids: string[], duration = 500) => {
      const el = wrapRef.current;
      if (!el) return;
      const known = ids.filter((id) => flow.getNode(id));
      if (!known.length) return;
      const bounds = flow.getNodesBounds(known);
      flow.setViewport(getViewportForBounds(bounds, el.clientWidth, el.clientHeight, MIN_ZOOM, 1, fitPadding(el)), { duration });
    },
    [flow],
  );

  // ---- Coming from a report's "Notes used": select those notes and bring them into view. ----
  useEffect(() => {
    if (!reveal?.length || !nodesReady) return;
    const ids = new Set(reveal);
    setNodes((ns) => ns.map((n) => ({ ...n, selected: ids.has(n.id) })));
    useStore.setState({ selected: reveal });
    const t = window.setTimeout(() => {
      frameNodes(reveal);
      useStore.setState({ reveal: undefined });
    }, 80);
    return () => window.clearTimeout(t);
  }, [reveal, nodesReady, frameNodes]);

  // ---- Pinch zoom. ----
  // Trackpad pinch arrives as a wheel event with ctrlKey. React Flow boosts it 10x on macOS
  // only, so on Windows touchpads it crawls. Handle it here, the same speed on every OS.
  const wrapRef = useRef<HTMLDivElement>(null);

  // Placement preview (user request, 25 Nov): with the sticky tool on, a light copy of the note
  // follows the cursor, centred where a click would put it, at the board's zoom, in the colour
  // the new note will get (your last note's colour, as board.addNote picks it). Moved directly,
  // not through React state, so the canvas does not re-render on every pointer move.
  const ghostRef = useRef<HTMLDivElement>(null);
  const nextColor: StickyColor = useProfile(noteColorOf);
  const moveGhost = (e: { clientX: number; clientY: number }, blocked: boolean) => {
    const g = ghostRef.current;
    const wrap = wrapRef.current;
    if (!g || !wrap) return;
    if (tool !== 'sticky' || blocked) {
      g.style.display = 'none';
      return;
    }
    const r = wrap.getBoundingClientRect();
    const size = `${Math.round(STICKY * flow.getZoom())}px`;
    g.style.width = size;
    g.style.height = size;
    g.style.display = 'block';
    g.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px) translate(-50%, -50%)`;
  };
  useEffect(() => {
    if (tool !== 'sticky' && ghostRef.current) ghostRef.current.style.display = 'none';
  }, [tool]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      if ((e.target as Element).closest('.nowheel')) return;
      e.preventDefault();
      e.stopPropagation();
      const unit = e.deltaMode === 1 ? 0.3 : e.deltaMode ? 6 : 0.012;
      const step = Math.max(-0.3, Math.min(0.3, -e.deltaY * unit));
      const { x, y, zoom } = flow.getViewport();
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * 2 ** step));
      if (next === zoom) return;
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      flow.setViewport({ x: px - ((px - x) * next) / zoom, y: py - ((py - y) * next) / zoom, zoom: next });
    };
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => el.removeEventListener('wheel', onWheel, { capture: true });
  }, [flow]);

  // ---- Drop an AI suggestion from the tray onto the board (BP-3). ----
  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData('application/x-suggestion');
    if (!raw) return;
    e.preventDefault();
    const s = JSON.parse(raw) as { id: string; text: string };
    placeSuggestion(s, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  const selectedStickies = selected.filter((id) => cards.some((c) => c.id === id));
  const vp = useViewport();
  const selTop = Math.min(...cards.filter((c) => selectedStickies.includes(c.id)).map((c) => c.y));
  const barBelow = Number.isFinite(selTop) && selTop * vp.zoom + vp.y < 260;
  const takeable = cards.filter((c) => selectedStickies.includes(c.id) && c.text.trim());
  const decisions = useStore((s) => s.decisions);
  const lockedNoteIds = useMemo(() => new Set(decisions.filter((d) => d.status === 'locked').flatMap((d) => d.sourceNoteIds)), [decisions]);

  return (
    <div className="flex min-h-0 flex-1">
    <Sidebar boardId={boardId} onPlace={(s) => placeSuggestion(s, viewCentre())} />
    <div
      ref={wrapRef}
      className="relative min-h-0 min-w-0 flex-1"
      onPointerMove={(e) => {
        const overPanel = Boolean((e.target as Element).closest('.react-flow__panel, .react-flow__node-toolbar, .react-flow__node'));
        moveGhost(e, overPanel);
        if ((e.target as Element).closest('.react-flow__panel')) return;
        setCursor(flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      }}
      onPointerLeave={() => {
        setCursor(null);
        if (ghostRef.current) ghostRef.current.style.display = 'none';
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-suggestion')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={onDrop}
      onDoubleClick={(e) => {
        // WB-1: double-click empty canvas to place a note there.
        if (tool !== 'select' || !(e.target as Element).classList.contains('react-flow__pane')) return;
        addAt('sticky', flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      }}
    >
      <ReactFlow
        // Section selection handles keep a constant on-screen size (styles.css reads --rf-zoom).
        onMove={(_, vp) => wrapRef.current?.style.setProperty('--rf-zoom', String(vp.zoom))}
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodesDelete={(ns) => {
          // Locked decisions 5.5: ask before deleting a section a decision covers. A confirmation, not a block.
          const ds = useStore.getState().decisions;
          const covered = ns.some((n) => n.type === 'section' && coverOf(ds, n.id));
          if (covered && !confirm('This section is covered by a locked decision. Delete it anyway?')) return;
          board.deleteItems(ns.map((n) => n.id));
        }}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={({ nodes: sel }) => {
          const ids = sel.filter((n) => n.type === 'sticky').map((n) => n.id);
          const cur = useStore.getState().selected;
          if (ids.length !== cur.length || ids.some((id, i) => id !== cur[i])) useStore.setState({ selected: ids });
        }}
        onNodeClick={(e, node) => {
          // One click on a note starts editing (a drag does not count as a click). Shift-click
          // still only adds to the selection, and the note's own buttons keep their job.
          if (node.type !== 'sticky' || tool !== 'select' || e.shiftKey || e.metaKey || e.ctrlKey) return;
          if ((e.target as Element).closest('button, a, input, textarea, [role="dialog"]')) return;
          useStore.setState({ editingId: node.id });
        }}
        onPaneClick={(e) => {
          if (tool === 'sticky' || tool === 'section') placeAt(e.clientX, e.clientY);
        }}
        selectionOnDrag={tool === 'select'}
        selectionMode={SelectionMode.Partial}
        panOnDrag={tool === 'hand' ? true : [1, 2]}
        nodesDraggable={tool !== 'hand'}
        elementsSelectable={tool !== 'hand'}
        panOnScroll
        zoomOnDoubleClick={false}
        deleteKeyCode={['Backspace', 'Delete']}
        // Shift adds to the selection (FigJam). React Flow also uses Shift for box select by
        // default, which lays a layer over the notes and swallows Shift+click.
        multiSelectionKeyCode="Shift"
        selectionKeyCode={null}
        elevateNodesOnSelect={false}
        // WB-11: render only what is in view (plus React Flow's margin).
        onlyRenderVisibleElements
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        attributionPosition="bottom-left"
        className={cx(tool === 'hand' && 'cursor-grab', (tool === 'sticky' || tool === 'section') && '[&_.react-flow__pane]:cursor-crosshair')}
        aria-label="Board canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={2.6} color="var(--color-dots)" />
        <Cursors />

        {/* Selection bar: appears above the selected notes. */}
        {/* Flips below the selection when the notes sit under the top panels, so it is never covered. */}
        <NodeToolbar nodeId={selectedStickies} isVisible={selectedStickies.length > 0} offset={16} position={barBelow ? Position.Bottom : Position.Top}>
          <div className="flex items-center gap-2 rounded-[15px] border border-line bg-surface p-1.5 pl-3 shadow-raised">
            <span className="text-[13px] text-ink-2 tabular-nums">
              {selectedStickies.length} {selectedStickies.length === 1 ? 'note' : 'notes'}
            </span>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <NoteColorPicker
              value={cards.find((c) => c.id === selectedStickies[0])?.color ?? 'yellow'}
              onPick={(c) => board.setColor(selectedStickies, c)}
            />
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            {/* One AI button (user request, 25 Nov): ask about these notes, or hand them to the agent. */}
            <AskAI noteIds={takeable.map((c) => c.id)} onAgent={openAgent} />
            {/* One-click lock (user request, 25 Nov): each note becomes a decision in its own words. */}
            {(() => {
              const unlocked = takeable.filter((c) => !lockedNoteIds.has(c.id));
              if (takeable.length > 0 && unlocked.length === 0) {
                return (
                  <Button size="sm" disabled title="Every selected note is already locked">
                    <LockGlyph className="size-4" />
                    Locked
                  </Button>
                );
              }
              return (
                <Button
                  size="sm"
                  disabled={unlocked.length === 0}
                  title="Lock these notes as decisions"
                  onClick={() => {
                    const ids = board.lockNotes(unlocked.map((c) => c.id));
                    if (!ids.length) return;
                    useStore.setState({ lockToast: { id: ids[0], text: ids.length === 1 ? unlocked[0].text : `${ids.length} notes` } });
                  }}
                >
                  <LockGlyph className="size-4" />
                  Lock
                </Button>
              );
            })()}
            <Button variant="primary" size="sm" disabled={takeable.length === 0} onClick={() => void takeNotes(takeable.map((c) => c.id))}>
              {/* User, 25 Nov: "Explore privately" with the AI sparkles (was "Take N cards with you"). */}
              <Sparkles aria-hidden className="size-4" strokeWidth={1.75} />
              Explore privately
            </Button>
          </div>
        </NodeToolbar>

        {/* Frame (WB-7): the problem can float in screen space above the canvas. The eye in the sidebar shows or hides it. */}
        {problemPinned && (
          <Panel position="top-left" id="frame-panel" className="!m-4 flex w-[min(560px,40vw)] flex-col gap-3">
            <ProblemField />
          </Panel>
        )}

        <Panel position="bottom-center" className="!mb-5">
          <Toolbar tool={tool} onChange={setTool} />
          <p className="sr-only" aria-live="polite">
            {tool === 'sticky'
              ? 'Sticky tool. Click the canvas to place a note, or press Enter to place one in the middle.'
              : tool === 'section'
                ? 'Section tool. Click the canvas to place a section, or press Enter to place one in the middle.'
                : ''}
          </p>
        </Panel>

        <Panel position="bottom-right" className="!m-5">
          <ZoomControls onFit={() => flow.fitView({ duration: 300, padding: fitPadding(wrapRef.current), maxZoom: 1 })} />
        </Panel>

        {!synced && (
          <Panel position="top-center" className="!mt-24">
            <p role="status" className="rounded-full bg-surface px-4 py-2 text-[13px] text-ink-2 shadow-card">
              Loading the board…
            </p>
          </Panel>
        )}
        {synced && cards.length === 0 && sections.length === 0 && (
          <Panel position="top-center" className="pointer-events-none !mt-[30vh]">
            <p className="max-w-[360px] text-center text-[14px] leading-relaxed text-ink-3">
              Double-click anywhere to add a sticky note, or press S. Add a link or some text under Context (the paperclip in the sidebar) so the AI knows the background.
            </p>
          </Panel>
        )}

        {(deletedLabel || titleToast || meetingToast || lockToast) && (
          // Above the toolbar row (56 px bar + 20 px margin), so a wide toast never runs under it.
          <Panel position="bottom-left" className="!mb-[88px] !ml-5 flex flex-col items-start gap-2">
            {titleToast && <TitleToast title={titleToast} />}
            {lockToast && <LockToast key={lockToast.id} id={lockToast.id} text={lockToast.text} notice={lockToast.notice} />}
            {meetingToast && (
              // Meeting addendum 3.3: the draft finished while the Context panel was closed. No focus is taken.
              <div role="status" className="flex items-center gap-3 rounded-[13px] border border-line bg-ink py-1.5 pr-1.5 pl-3 text-[13px] text-white shadow-raised">
                <Sparkles aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-white/80" />
                Your session draft is ready
                <button type="button" onClick={() => openSheet(meetingToast.sourceId, meetingToast.chipId)} className="pressable key-dark h-7 rounded-[7px] bg-white/15 px-2.5 font-medium hover:bg-white/25">
                  Review
                </button>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => useStore.setState({ meetingToast: undefined })}
                  className="pressable key-quiet key-dark-quiet flex size-7 items-center justify-center rounded-[7px] text-white/70 hover:text-white"
                >
                  <X aria-hidden size={14} strokeWidth={1.75} />
                </button>
              </div>
            )}
            {deletedLabel && (
            <div role="status" className="flex items-center gap-3 rounded-[13px] border border-line bg-ink py-1.5 pr-1.5 pl-4 text-[13px] text-white shadow-raised">
              Deleted {deletedLabel}.
              <button type="button" onClick={() => board.undo()} className="pressable key-dark h-7 rounded-[7px] bg-white/15 px-2.5 font-medium hover:bg-white/25">
                Undo
              </button>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => useStore.setState({ deletedLabel: undefined })}
                className="pressable key-quiet key-dark-quiet flex size-7 items-center justify-center rounded-[7px] text-white/70 hover:text-white"
              >
                <X aria-hidden size={14} strokeWidth={1.75} />
              </button>
            </div>
            )}
          </Panel>
        )}
      </ReactFlow>
      <div
        ref={ghostRef}
        aria-hidden
        data-color={nextColor}
        className="swatch pointer-events-none absolute top-0 left-0 z-[4] hidden rounded-[2px] opacity-55"
      />
      <MeetingSheet
        viewCentre={viewCentre}
        onPlaced={(ids) => {
          // 9.9: frame the new group once React Flow knows every new node and the sheet has closed
          // (its focus return can otherwise land after the move). Gives up after about 2 s.
          // Timers, not animation frames. In a background tab the board does not update, so the
          // clock only runs while the tab is visible: the move happens when the person comes back.
          let waited = 0;
          const tryFrame = () => {
            if (!document.hidden) waited += 50;
            const ready = ids.every((id) => flow.getNode(id));
            if (ready && waited > 320) frameNodes(ids, 600);
            else if (waited < 2000) window.setTimeout(tryFrame, 50);
          };
          window.setTimeout(tryFrame, 50);
        }}
      />
    </div>
    </div>
  );
}

/**
 * "AI named this board" (WB-2). The AI sets the title directly, so this says so and offers a way
 * to change it. Goes away on its own after 8 s (user decision), but the timer pauses while the
 * pointer is on it or focus is inside it, so nobody loses it mid-reach. Rename stays one click
 * away on the title itself.
 */
const TITLE_TOAST_MS = 8000;
function TitleToast({ title }: { title: string }) {
  const close = () => useStore.setState({ titleToast: undefined });
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held) return;
    const t = window.setTimeout(close, TITLE_TOAST_MS);
    return () => window.clearTimeout(t);
  }, [held, title]);
  return (
    <div
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setHeld(false);
      }}
      role="status" className="flex w-max max-w-[min(640px,calc(100vw-40px))] items-center gap-3 rounded-[13px] border border-line bg-ink py-1.5 pr-1.5 pl-3 text-[13px] text-white shadow-raised">
      <Sparkles aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-white/80" />
      <span className="min-w-0 truncate">
        AI named this board <span className="font-semibold">“{title}”</span>
      </span>
      <button
        type="button"
        onClick={() => {
          close();
          const el = document.querySelector<HTMLInputElement>('input[aria-label="Board title"]');
          el?.focus();
          el?.select();
        }}
        className="pressable h-7 shrink-0 rounded-[7px] bg-white/15 px-2.5 font-medium hover:bg-white/25"
      >
        Rename
      </button>
      <button
        type="button"
        onClick={() => {
          close();
          board.setTitle('', 'user');
        }}
        className="pressable key-quiet key-dark-quiet h-7 shrink-0 rounded-[7px] px-2 font-medium text-white/80 hover:text-white"
      >
        Undo
      </button>
      <button type="button" aria-label="Close" onClick={close} className="pressable key-quiet key-dark-quiet flex size-7 shrink-0 items-center justify-center rounded-[7px] text-white/70 hover:text-white">
        <X aria-hidden size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** Locked decisions 5.3: "Locked: ..." with Undo and Close. Same timing as the title toast. */
function LockToast({ text, notice }: { id: string; text: string; notice?: string }) {
  const close = () => useStore.setState({ lockToast: undefined });
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held) return;
    const t = window.setTimeout(close, TITLE_TOAST_MS);
    return () => window.clearTimeout(t);
  }, [held, text]);
  return (
    <div
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setHeld(false);
      }}
      role="status"
      className="flex w-max max-w-[min(640px,calc(100vw-40px))] items-center gap-3 rounded-[13px] border border-line bg-ink py-1.5 pr-1.5 pl-3 text-[13px] text-white shadow-raised"
    >
      <LockGlyph className="size-4 text-white/80" />
      <span className="min-w-0">
        <span className="block truncate">
          {/^\d+ notes$/.test(text) ? (
            <>Locked {text}.</>
          ) : (
            <>
              Locked: <span className="font-semibold">“{shorten(text, 70)}”</span>
            </>
          )}
        </span>
        {notice && <span className="block text-[12px] text-white/70">{notice}</span>}
      </span>
      <button
        type="button"
        onClick={() => {
          close();
          board.undo();
        }}
        className="pressable key-dark h-7 shrink-0 rounded-[7px] bg-white/15 px-2.5 font-medium hover:bg-white/25"
      >
        Undo
      </button>
      <button type="button" aria-label="Close" onClick={close} className="pressable key-quiet key-dark-quiet flex size-7 shrink-0 items-center justify-center rounded-[7px] text-white/70 hover:text-white">
        <X aria-hidden size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** BP-3: a suggestion becomes a note marked AI, placed by (and attributed to) this person. */
function placeSuggestion(s: { id: string; text: string }, at: { x: number; y: number }) {
  board.addNote(at, { text: s.text, origin: 'ai' });
  const boardId = useStore.getState().boardId;
  if (boardId) void api.markUsed(boardId, s.id).catch(() => {});
  window.dispatchEvent(new CustomEvent('suggestion-used', { detail: s.id }));
}

/** MP-9: other people's cursors, drawn in world space so they track while this person pans and zooms. */
function Cursors() {
  const peers = useStore((s) => s.peers);
  const { x, y, zoom } = useViewport();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {peers.map((p) =>
        p.cursor ? (
          <div
            key={p.clientId}
            className="absolute top-0 left-0 transition-transform duration-75 ease-linear"
            style={{ transform: `translate(${p.cursor.x * zoom + x}px, ${p.cursor.y * zoom + y}px)` }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" style={{ color: p.color }}>
              <path d="M2 1.5 15.5 8 9.2 9.6 6.4 16z" fill="currentColor" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <span className="ml-3 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white" style={{ background: p.color }}>
              {p.name}
            </span>
          </div>
        ) : null,
      )}
    </div>
  );
}

function ZoomControls({ onFit }: { onFit: () => void }) {
  const flow = useReactFlow();
  const btn = 'pressable key-quiet flex size-9 items-center justify-center rounded-[9px] text-ink-2 hover:bg-surface-2 hover:text-ink';
  return (
    <div role="group" aria-label="Zoom" className="flex items-center gap-0.5 rounded-[14px] border border-line bg-surface p-1 shadow-card">
      <button type="button" aria-label="Zoom out" className={btn} onClick={() => flow.zoomOut({ duration: 160 })}>
        <Minus aria-hidden size={18} strokeWidth={1.5} />
      </button>
      <button type="button" aria-label="Zoom in" className={btn} onClick={() => flow.zoomIn({ duration: 160 })}>
        <Plus aria-hidden size={18} strokeWidth={1.5} />
      </button>
      <button type="button" aria-label="Fit to content" className={cx(btn, 'w-auto px-2.5 text-[13px] font-medium')} onClick={onFit}>
        Fit
      </button>
    </div>
  );
}
