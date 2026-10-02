import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema } from '@lifexp/shared';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { AuthLayout } from './AuthLayout';
import { TextField } from './TextField';
import { resetPassword } from './authApi';
import { readResetToken } from './resetToken';
import { useAuth } from './useAuth';
import { useServerError } from './useAuthForm';

const formSchema = z
  .object({ password: resetPasswordSchema.shape.password, confirm: z.string() })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    message: 'As senhas não conferem',
  });
type FormValues = z.infer<typeof formSchema>;

const footer = (
  <>
    Lembrou a senha?{' '}
    <Link to="/login" className="font-semibold text-xp hover:underline">
      Voltar para o login
    </Link>
  </>
);

export function ResetPasswordPage() {
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Lido uma única vez: logo em seguida o token sai da barra de endereço (e do histórico).
  const [token] = useState(() => readResetToken(location.hash));
  const { serverError, run } = useServerError();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    if (location.hash) void navigate(location.pathname, { replace: true });
  }, [location.hash, location.pathname, navigate]);

  if (!token) {
    return (
      <AuthLayout
        title="Link inválido"
        subtitle="Este link de recuperação está incompleto ou já não vale."
        footer={footer}
      >
        <Button asChild>
          <Link to="/esqueci-senha">Pedir um novo link</Link>
        </Button>
      </AuthLayout>
    );
  }

  const onSubmit = handleSubmit(({ password }) =>
    run(async () => {
      await resetPassword({ token, password });
      // O servidor encerrou todas as sessões: se havia uma aberta neste navegador, ela acabou.
      if (state.status === 'authenticated') await logout();
      toast.success('Senha redefinida. Entre com a senha nova.');
      await navigate('/login', { replace: true });
    }),
  );

  return (
    <AuthLayout
      title="Criar uma senha nova"
      subtitle="Ao salvar, todas as sessões abertas são encerradas."
      footer={footer}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <TextField
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          hint="De 8 a 72 caracteres."
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="Confirmar a nova senha"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        {serverError && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <p>{serverError}</p>
            <Link to="/esqueci-senha" className="font-semibold underline">
              Pedir um novo link
            </Link>
          </div>
        )}
        <Button type="submit" disabled={isSubmitting} className="mt-1">
          {isSubmitting ? 'Salvando...' : 'Salvar senha nova'}
        </Button>
      </form>
    </AuthLayout>
  );
}
