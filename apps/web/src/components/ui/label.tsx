import { forwardRef, type LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  function Label({ className, ...props }, ref) {
    return (
      <label
        ref={ref}
        className={cn(
          'font-hud text-xs font-medium tracking-wider text-muted-foreground uppercase',
          className,
        )}
        {...props}
      />
    );
  },
);
