import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@lifexp/shared';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { AuthLayout } from './AuthLayout';
import { TextField } from './TextField';
import { useAuth } from './useAuth';
import { useServerError } from './useAuthForm';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const { serverError, run } = useServerError();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit((values) =>
    run(async () => {
      await login(values);
      await navigate(from, { replace: true });
    }),
  );

  return (
    <AuthLayout
      title="Continue sua jornada"
      subtitle="Entre para abrir o plano da sua semana."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/register" className="font-semibold text-xp hover:underline">
            Crie seu personagem
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Senha"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {serverError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {serverError}
          </p>
        )}
        <Button type="submit" disabled={isSubmitting} className="mt-1">
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>
    </AuthLayout>
  );
}
