import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle } from '@base-ui/react/toggle';
import { Hand, MousePointer2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip } from '../ui/Tooltip.tsx';

export type Tool = 'select' | 'hand' | 'sticky' | 'section';

// Lucide icons, 20 px at stroke 1.5, the same as the panel buttons. `look` is the filled state when active (styles.css).
export type IconLook = 'icon-fill' | 'icon-cut' | 'icon-bold';
const icon = (Icon: LucideIcon, look: IconLook) => <Icon aria-hidden size={20} strokeWidth={1.5} className={look} />;

/** Figma's section icon: a frame with its name tab in the top-left corner. Drawn on Lucide's grid and stroke. */
const SectionIcon = (
  <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} className="icon-cut" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="2.5" />
    <path d="M3.75 10.25h5a1.5 1.5 0 0 0 1.5-1.5v-5" />
  </svg>
);

/**
 * A tiny sticky note, as Figma shows on its toolbar: a pink note behind a yellow one whose
 * bottom-right corner curls up. Uses the board's own paper colours, so it matches real notes.
 */
const StickyIcon = (
  <svg aria-hidden viewBox="0 0 28 28" width={28} height={28} className="drop-shadow-[0_1px_1px_rgb(28_27_25/0.18)]">
    <rect x="7" y="3" width="17" height="17" rx="1.5" fill="var(--color-paper-pink)" transform="rotate(9 15.5 11.5)" />
    <path d="M4 7.5a1.5 1.5 0 0 1 1.5-1.5h15a1.5 1.5 0 0 1 1.5 1.5V18l-6 6H5.5A1.5 1.5 0 0 1 4 22.5z" fill="var(--color-paper-yellow)" />
    {/* The curl: the underside of the lifted corner, a shade darker than the face. */}
    <path d="M22 18l-6 6c.4-2.9 1.6-4.9 6-6z" style={{ fill: 'color-mix(in oklab, var(--color-paper-yellow), rgb(120 90 0) 22%)' }} />
  </svg>
);

const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: icon(MousePointer2, 'icon-fill') },
  { id: 'hand', label: 'Hand', key: 'H', icon: icon(Hand, 'icon-cut') },
  { id: 'sticky', label: 'Sticky note', key: 'S', icon: StickyIcon },
  { id: 'section', label: 'Section', key: 'Shift S', icon: SectionIcon },
];

/** One container. Outer radius = button radius (10) + inset (6) + border (1). */
// Tactile surface: a faint top-to-bottom gradient plus inner highlight and bottom lip (--shadow-tactile).
const BAR = 'flex items-center gap-1 rounded-[17px] border border-line bg-linear-to-b from-surface to-bg p-1.5 shadow-[var(--shadow-tactile)]';

/** Two floating containers side by side: the canvas tools, then `extra` (the AI and context panel buttons). */
export function Toolbar({ tool, onChange, extra }: { tool: Tool; onChange: (t: Tool) => void; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <ToggleGroup
        aria-label="Tools"
        value={[tool]}
        onValueChange={(v) => v[0] && onChange(v[0] as Tool)}
        className={BAR}
      >
        {TOOLS.map((t) => (
          <Tooltip
            key={t.id}
            label={
              <span className="flex items-center gap-2">
                {t.label}
                <kbd className="rounded-[4px] bg-white/15 px-1 font-sans text-[11px]">{t.key}</kbd>
              </span>
            }
          >
            <Toggle
              value={t.id}
              aria-label={`${t.label} (${t.key})`}
              className="pressable key-quiet flex size-10 items-center justify-center rounded-[10px] text-ink-2 hover:bg-surface-2 hover:text-ink data-[pressed]:bg-accent data-[pressed]:text-white"
            >
              {t.icon}
            </Toggle>
          </Tooltip>
        ))}
      </ToggleGroup>
      {extra && <div className={BAR}>{extra}</div>}
    </div>
  );
}
