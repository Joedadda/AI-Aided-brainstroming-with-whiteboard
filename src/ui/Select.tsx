import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { cx } from './cx.ts';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A small dropdown in the app's own style: the white card, line border, raised shadow and
 * pop-in of the other pop-ups (profile menu, Ask AI), instead of the browser's native list.
 * The trigger reads as quiet inline text with a chevron. It has no pressed look (user, 25 Nov).
 */
export function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
  invalid = false,
  describedBy,
  className,
}: {
  id?: string;
  /** null shows the placeholder. */
  value: string | null;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}) {
  return (
    <BaseSelect.Root
      value={value}
      onValueChange={(v) => v !== null && onChange(v as string)}
      items={options}
    >
      <BaseSelect.Trigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cx(
          'inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-transparent px-1.5 text-[13px] text-ink-2 outline-none hover:text-ink data-[popup-open]:text-ink aria-[invalid=true]:border-danger',
          className,
        )}
      >
        <BaseSelect.Value placeholder={placeholder} className="data-[placeholder]:text-ink-3" />
        <BaseSelect.Icon className="flex text-ink-3">
          <ChevronDown aria-hidden size={14} strokeWidth={1.75} className="size-3.5 shrink-0" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} align="start" alignItemWithTrigger={false} className="z-[60] outline-none">
          <BaseSelect.Popup className="menu-pop max-h-[min(320px,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto rounded-[11px] border border-line bg-surface p-1 shadow-raised outline-none">
            <BaseSelect.List>
              {options.map((o) => (
                <BaseSelect.Item
                  key={o.value}
                  value={o.value}
                  className="flex h-8 cursor-pointer items-center justify-between gap-6 rounded-[6px] pr-2 pl-2.5 text-[13px] text-ink outline-none select-none data-[highlighted]:bg-surface-2"
                >
                  <BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="flex text-accent">
                    <Check aria-hidden size={14} strokeWidth={2} className="size-3.5 shrink-0" />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
