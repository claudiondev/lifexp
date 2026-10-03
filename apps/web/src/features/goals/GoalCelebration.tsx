import { motion, useReducedMotion } from 'motion/react';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export interface GoalCelebrationData {
  title: string;
  xp: number;
}

interface GoalCelebrationProps {
  /** A meta concluída; nulo mantém fechado. */
  celebration: GoalCelebrationData | null;
  onClose: () => void;
}

/** Comemoração ao concluir uma meta. Só recompensa: nunca aparece ao reabrir ou perder XP. */
export function GoalCelebration({ celebration, onClose }: GoalCelebrationProps) {
  const reduceMotion = useReducedMotion();
  return (
    <Dialog open={celebration !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {celebration && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <motion.span
              initial={reduceMotion ? false : { scale: 0.4, opacity: 0, rotate: -15 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 12 }}
              className="grid size-24 place-items-center rounded-full border-2 border-reward/60 bg-reward/10 text-reward shadow-[0_0_40px_-8px_var(--reward)]"
            >
              <Trophy aria-hidden className="size-12" />
            </motion.span>
            <p className="font-hud text-xs tracking-[0.25em] text-reward uppercase">Meta concluída</p>
            <DialogTitle className="font-display text-3xl font-extrabold">
              {celebration.title}
            </DialogTitle>
            <DialogDescription>
              <span className="font-hud text-lg text-reward tabular-nums">+{celebration.xp} XP</span> no
              seu personagem.
            </DialogDescription>
            <Button onClick={onClose}>Continuar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
