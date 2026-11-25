import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';
import { forwardRef, type ReactNode } from 'react';
import { cx } from './cx.ts';

export const ScrollArea = forwardRef<
  HTMLDivElement,
  { children: ReactNode; className?: string; viewportClassName?: string; label?: string }
>(function ScrollArea({ children, className, viewportClassName, label }, ref) {
  return (
    <BaseScrollArea.Root className={cx('relative min-h-0', className)}>
      <BaseScrollArea.Viewport
        ref={ref}
        aria-label={label}
        className={cx('h-full overscroll-contain', viewportClassName)}
      >
        {children}
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar className="m-1 flex w-1.5 justify-center rounded-full opacity-0 transition-opacity duration-150 data-[hovering]:opacity-100 data-[scrolling]:opacity-100">
        <BaseScrollArea.Thumb className="w-full rounded-full bg-line-strong" />
      </BaseScrollArea.Scrollbar>
    </BaseScrollArea.Root>
  );
});
