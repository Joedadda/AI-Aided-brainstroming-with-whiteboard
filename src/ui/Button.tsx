import { Button as BaseButton } from '@base-ui/react/button';
import type { ComponentProps } from 'react';
import { cx } from './cx.ts';

type Variant = 'primary' | 'secondary' | 'ghost' | 'ai';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary:
    'key-accent bg-accent text-white hover:bg-accent-hover data-[disabled]:bg-surface-2 data-[disabled]:text-ink-3',
  secondary:
    'key bg-surface text-ink border border-line hover:border-line-strong data-[disabled]:text-ink-3',
  ghost: 'key-quiet text-ink-2 hover:bg-surface-2 hover:text-ink data-[disabled]:text-ink-3',
  ai: 'key-ai bg-ai-bg text-ai border border-ai-line hover:border-ai data-[disabled]:opacity-60',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-sm',
  md: 'h-10 px-4 text-sm gap-2 rounded-md',
};

export type ButtonProps = Omit<ComponentProps<typeof BaseButton>, 'className'> & {
  variant?: Variant;
  size?: Size;
  className?: string;
};

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <BaseButton
      {...props}
      className={cx(
        'pressable inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none',
        'data-[disabled]:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
    />
  );
}
