import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';

export const TooltipProvider = BaseTooltip.Provider;

/** Wraps a single focusable element. The child is rendered as the trigger. */
export function Tooltip({ label, children, side }: { label: ReactNode; children: ReactElement; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={8} side={side}>
          <BaseTooltip.Popup className="popup max-w-72 rounded-sm bg-ink px-2.5 py-1.5 text-[13px] leading-snug text-white shadow-raised">
            {label}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
