import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstallPrompt } from './useInstallPrompt';

/** Convite para instalar o LifeXP como app. Some quando o navegador não oferece a instalação. */
export function InstallAppCard() {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;

  return (
    <section
      aria-label="Instalar o app"
      className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur"
    >
      <div>
        <h2 className="font-display text-xl font-bold">Instalar o LifeXP</h2>
        <p className="text-sm text-muted-foreground">
          Abra direto da tela inicial, sem a barra do navegador.
        </p>
      </div>
      <Button onClick={() => void install()}>
        <Download aria-hidden className="size-4" />
        Instalar app
      </Button>
    </section>
  );
}
