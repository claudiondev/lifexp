import { Slot } from '@radix-ui/react-slot';
import { forwardRef, type LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Aplica o estilo em outro elemento (ex.: <legend>) em vez de renderizar um <label>. */
  asChild?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, asChild = false, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'label';
  return (
    <Comp
      ref={ref}
      className={cn(
        'font-hud text-xs font-medium tracking-wider text-muted-foreground uppercase',
        className,
      )}
      {...props}
    />
  );
});
