import * as React from 'react';
import { cn } from './cn';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-field-bd bg-field px-3 text-sm text-text outline-none placeholder:text-text3 focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('block text-[12.5px] font-semibold text-text2', className)} {...props} />
  ),
);
Label.displayName = 'Label';
