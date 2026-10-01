import { RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';

interface UpdateBannerProps {
  onUpdate: () => void;
  onDismiss: () => void;
}

/** Aviso fixo (acima da barra do celular). Não recarrega nada sozinho: a pessoa decide. */
export function UpdateBanner({ onUpdate, onDismiss }: UpdateBannerProps) {
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-xp/40 bg-card p-4 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.7)] sm:right-4 sm:bottom-4 sm:left-auto"
    >
      <RefreshCw aria-hidden className="size-5 shrink-0 text-xp" />
      <p className="min-w-0 flex-1 text-sm">Nova versão disponível.</p>
      <Button size="sm" onClick={onUpdate}>
        Atualizar
      </Button>
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        Depois
      </Button>
    </div>
  );
}

/** Registra o service worker e mostra o aviso quando há versão nova esperando. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;

  return (
    <UpdateBanner
      onUpdate={() => void updateServiceWorker(true)}
      onDismiss={() => setNeedRefresh(false)}
    />
  );
}
