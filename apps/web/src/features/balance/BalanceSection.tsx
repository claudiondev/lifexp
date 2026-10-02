import { hasBalanceData } from './balanceModel';
import { BalanceRadar } from './BalanceRadar';
import { useBalance } from './useBalance';

/**
 * "Equilíbrio" na tela inicial. É um extra: se a rota falhar, ou nada tiver sido planejado ainda, a seção
 * simplesmente não aparece (não vale um aviso de erro por causa dela).
 */
export function BalanceSection() {
  const balance = useBalance();
  if (!balance.data || !hasBalanceData(balance.data)) return null;

  return (
    <section
      aria-labelledby="balance-title"
      className="mt-10 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur sm:p-6"
    >
      <h2 id="balance-title" className="font-display text-2xl font-bold">
        Equilíbrio das áreas
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Quanto do que você planejou nas últimas 4 semanas foi cumprido, por área. Conta blocos, não
        XP nem minutos: uma leitura de 15 minutos pesa tanto quanto um treino longo. Blocos pulados
        não entram.
      </p>
      <div className="mt-5">
        <BalanceRadar areas={balance.data.areas} />
      </div>
    </section>
  );
}
