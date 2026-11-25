import { Popover } from '@base-ui/react/popover';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { StickyColor } from '../../shared/types.ts';
import { cx } from '../ui/cx.ts';

const COLORS: StickyColor[] = ['yellow', 'pink', 'blue', 'green'];
const NAMES: Record<StickyColor, string> = { yellow: 'Yellow', pink: 'Pink', blue: 'Blue', green: 'Green' };

/**
 * Note colour as a dropdown (user request, 25 Nov, FigJam style): the current colour as a swatch
 * with a chevron. It opens the four colours; picking one recolours every selected note.
 * Mixed colours show the first note's colour.
 */
export function NoteColorPicker({ value, onPick }: { value: StickyColor; onPick: (c: StickyColor) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`Note colour: ${NAMES[value]}`}
        className="pressable key-quiet flex h-8 items-center gap-1 rounded-[8px] pr-1.5 pl-1 text-ink-2 hover:bg-surface-2 hover:text-ink data-[popup-open]:bg-surface-2"
      >
        <span aria-hidden className="swatch size-6 rounded-full border border-ink/15" data-color={value} />
        <ChevronDown aria-hidden className="size-3.5" strokeWidth={2} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} side="bottom" align="start">
          <Popover.Popup className="popup z-50 flex gap-1.5 rounded-[14px] border border-line bg-surface p-2 shadow-raised outline-none">
            <Popover.Title className="sr-only">Note colour</Popover.Title>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={NAMES[c]}
                aria-pressed={c === value}
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
                className={cx(
                  'swatch pressable key-tint size-8 rounded-full border border-ink/15',
                  c === value && 'outline-2 outline-offset-2 outline-accent',
                )}
                data-color={c}
              />
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
