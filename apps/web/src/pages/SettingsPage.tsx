import { useAuth } from '@/features/auth/useAuth';
import { DataExportCard } from '@/features/account/DataExportCard';
import { DeleteAccountCard } from '@/features/account/DeleteAccountCard';
import { SessionsCard } from '@/features/account/SessionsCard';
import { NotificationPreferencesCard } from '@/features/notifications/NotificationPreferencesCard';
import { PushCard } from '@/features/push/PushCard';
import { InstallAppCard } from '@/features/pwa/InstallAppCard';
import { ProfileForm } from '@/features/profile/ProfileForm';
import { PageHeader } from './PageHeader';

export function SettingsPage() {
  const { state } = useAuth();
  if (state.status !== 'authenticated') return null;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageHeader
        eyebrow="Conta"
        title="Configurações"
        description="Escolha como seu personagem aparece, em que fuso a sua semana é contada e cuide da sua conta."
      />
      <ProfileForm user={state.user} />
      <NotificationPreferencesCard />
      <PushCard />
      <SessionsCard />
      <InstallAppCard />
      <DataExportCard />
      <DeleteAccountCard />
    </main>
  );
}
