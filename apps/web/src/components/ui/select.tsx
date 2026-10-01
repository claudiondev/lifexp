import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** <select> nativo estilizado: teclado e leitor de tela funcionam sem trabalho extra. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-11 w-full rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground transition-colors focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring/40 aria-[invalid=true]:border-destructive disabled:opacity-60',
          className,
        )}
        {...props}
      />
    );
  },
);
