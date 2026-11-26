/**
 * The app's button, in shadcn/ui's form, with our looks as its variants:
 *
 *   default   bordered card button (secondary actions)
 *   primary   navy, for the one main action
 *   ghost     no frame until hovered
 *   stop      dark, in Send's place while a reply is written
 *   link      reads as a link (`link-danger` in red)
 *   toolbar   the document toolbar's square buttons; `data-active` shows a pressed state
 *   bar       the quiet buttons in the row under the chat box
 *
 * Sizes: `sm`, and `icon` (32px) or `icon-sm` (24px) for a button that is only an icon.
 *
 * `tip` adds a tooltip under the button (pass `tipAlign` near a window edge).
 */
import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap outline-none transition-colors duration-100 focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-default',
  {
    variants: {
      variant: {
        default:
          'rounded-sm border border-border-strong bg-card text-foreground hover:enabled:bg-panel active:enabled:bg-pressed disabled:text-muted-foreground disabled:opacity-60',
        primary:
          'rounded-sm border border-primary bg-primary text-primary-foreground hover:enabled:border-primary-hover hover:enabled:bg-primary-hover disabled:border-transparent disabled:bg-border-strong dark:disabled:text-muted-foreground',
        ghost:
          'rounded-sm border border-transparent bg-transparent text-foreground-2 hover:enabled:bg-hover hover:enabled:text-foreground disabled:opacity-60',
        stop: 'rounded-sm border border-foreground bg-foreground text-card hover:opacity-85',
        link: 'border-0 bg-transparent p-0 text-primary underline underline-offset-2 disabled:text-muted-foreground',
        'link-danger': 'border-0 bg-transparent p-0 text-destructive underline underline-offset-2 disabled:text-muted-foreground',
        toolbar:
          'h-7.5 min-w-7.5 rounded-sm border border-transparent bg-transparent px-2 text-sm text-foreground-2 hover:enabled:bg-hover hover:enabled:text-foreground disabled:opacity-35 data-[active=true]:bg-pressed data-[active=true]:text-foreground',
        bar: 'h-7 min-w-0 gap-1.25 rounded-sm border-0 bg-transparent px-2 text-foreground-2 hover:enabled:bg-hover hover:enabled:text-foreground disabled:opacity-50 aria-expanded:bg-hover aria-expanded:text-foreground',
      },
      size: {
        default: '',
        sm: '',
        icon: 'aspect-square px-0',
        'icon-sm': 'aspect-square px-0',
      },
    },
    compoundVariants: [
      { variant: ['default', 'primary', 'ghost', 'stop'], size: 'default', class: 'px-3.5 py-1.5 text-base' },
      { variant: ['default', 'primary', 'ghost', 'stop'], size: 'sm', class: 'px-2.25 py-0.75 text-md' },
      { variant: ['default', 'primary', 'ghost', 'stop'], size: 'icon', class: 'size-8' },
      { variant: ['default', 'primary', 'ghost', 'stop'], size: 'icon-sm', class: 'size-6' },
    ],
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

/** A tooltip drawn under the button with CSS, from its `data-tip`. */
const tipClass =
  'relative after:pointer-events-none after:absolute after:top-full after:mt-1.5 after:z-30 after:rounded-sm after:bg-foreground after:px-2 after:py-0.75 after:text-xs after:leading-snug after:whitespace-nowrap after:text-background after:opacity-0 after:transition-opacity after:duration-75 after:content-[attr(data-tip)] hover:after:opacity-100 hover:after:delay-150 focus-visible:after:opacity-100 focus-visible:after:delay-150 disabled:after:hidden';
const tipAligns = {
  center: 'after:left-1/2 after:-translate-x-1/2',
  start: 'after:left-0',
  end: 'after:right-0',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the child element (a link, say) with the button's look instead of a <button>. */
  asChild?: boolean;
  tip?: string;
  tipAlign?: keyof typeof tipAligns;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, tip, tipAlign = 'center', type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      data-tip={tip}
      className={cn(buttonVariants({ variant, size }), tip && [tipClass, tipAligns[tipAlign]], className)}
      {...props}
    />
  );
});
