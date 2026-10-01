import { useAuth } from '@/features/auth/useAuth';
import { InstallAppCard } from '@/features/pwa/InstallAppCard';
import { ProfileForm } from '@/features/profile/ProfileForm';
import { PageHeader } from './PageHeader';

export function ProfilePage() {
  const { state } = useAuth();
  if (state.status !== 'authenticated') return null;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageHeader
        eyebrow="Configurações"
        title="Seu perfil"
        description="Escolha como seu personagem aparece e em que fuso a sua semana é contada."
      />
      <ProfileForm user={state.user} />
      <InstallAppCard />
    </main>
  );
}
