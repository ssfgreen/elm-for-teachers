import * as React from 'react';
import { cn } from '../../lib/utils';
import { fieldClass } from './input';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- an interface, so react/prop-types sees the props
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, ...props }: TextareaProps, ref) {
    return <textarea ref={ref} className={cn(fieldClass, 'w-full resize-y', className)} {...props} />;
  },
);
