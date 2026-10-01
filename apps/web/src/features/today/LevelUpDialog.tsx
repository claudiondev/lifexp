import { motion, useReducedMotion } from 'motion/react';
import { LevelSigil } from '@/components/game/LevelSigil';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface LevelUpDialogProps {
  /** O novo nível; nulo mantém fechado. */
  level: number | null;
  onClose: () => void;
}

/** Comemoração de subida de nível. Só recompensa: nunca aparece por perda de XP. */
export function LevelUpDialog({ level, onClose }: LevelUpDialogProps) {
  const reduceMotion = useReducedMotion();
  return (
    <Dialog open={level !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {level !== null && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <motion.div
              initial={reduceMotion ? false : { scale: 0.4, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 14 }}
            >
              <LevelSigil level={level} size={120} />
            </motion.div>
            <p className="font-hud text-xs tracking-[0.25em] text-xp uppercase">Novo nível</p>
            <DialogTitle className="font-display text-3xl font-extrabold">
              Você chegou ao nível {level}
            </DialogTitle>
            <DialogDescription>Cada bloco concluído é XP no seu personagem.</DialogDescription>
            <Button onClick={onClose}>Continuar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
