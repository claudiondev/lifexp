import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-28 w-full resize-y rounded-lg border border-input bg-background/60 px-3.5 py-3 text-sm leading-relaxed text-foreground transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/40 aria-[invalid=true]:border-destructive disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
});
