import * as React from 'react';
import { cn } from '../../lib/utils';

/** The field look shared by Input and Textarea. */
export const fieldClass =
  'rounded-sm border border-border-strong bg-card px-2.5 py-1.75 text-foreground outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- an interface, so react/prop-types sees the props
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...props }: InputProps, ref) {
  return <input ref={ref} className={cn(fieldClass, className)} {...props} />;
});
