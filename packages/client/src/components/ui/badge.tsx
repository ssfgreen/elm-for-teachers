import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/** A small label: a count, a status, a file type. */
export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2 py-px text-xs font-medium whitespace-nowrap', {
  variants: {
    variant: {
      default: 'bg-panel text-foreground-2',
      primary: 'bg-primary-soft text-primary',
      solid: 'bg-primary text-primary-foreground',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      destructive: 'bg-destructive-soft text-destructive',
      outline: 'border border-border-strong text-foreground-2',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
