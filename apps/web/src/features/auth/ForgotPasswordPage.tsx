import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@lifexp/shared';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { AuthLayout } from './AuthLayout';
import { TextField } from './TextField';
import { requestPasswordReset } from './authApi';
import { useServerError } from './useAuthForm';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { serverError, run } = useServerError();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit((values) =>
    run(async () => {
      await requestPasswordReset(values);
      setSent(true);
    }),
  );

  return (
    <AuthLayout
      title="Recuperar a senha"
      subtitle="Informe o e-mail da sua conta e enviamos um link para criar uma senha nova."
      footer={
        <>
          Lembrou a senha?{' '}
          <Link to="/login" className="font-semibold text-xp hover:underline">
            Voltar para o login
          </Link>
        </>
      }
    >
      {sent ? (
        // A mesma mensagem para qualquer e-mail: a tela não revela se a conta existe.
        <div role="status" className="flex flex-col items-start gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-secondary text-xp">
            <MailCheck aria-hidden className="size-5" />
          </span>
          <p className="font-medium">Confira sua caixa de entrada.</p>
          <p className="text-muted-foreground">
            Se houver uma conta com esse e-mail, o link chega em instantes. Ele vale por 30 minutos
            e só funciona uma vez.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            error={errors.email?.message}
            {...register('email')}
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
            {isSubmitting ? 'Enviando...' : 'Enviar link'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
