import { useCallback, useEffect, useState } from 'react';

/** O evento do Chrome/Edge/Android que permite abrir o convite de instalação na hora que a gente quiser. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Guarda o convite de instalação do navegador. `canInstall` só fica verdadeiro quando o navegador
 * oferece (ele não oferece se o app já está instalado, nem no Safari/Firefox: lá a instalação é
 * manual pelo menu), então o botão simplesmente não aparece nesses casos.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault(); // impede o mini-aviso automático; quem decide é o botão
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null); // o evento só vale uma vez, aceitando ou não
  }, [deferred]);

  return { canInstall: deferred !== null, install };
}
