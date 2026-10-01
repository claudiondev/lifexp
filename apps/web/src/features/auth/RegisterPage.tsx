import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@lifexp/shared';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { AuthLayout } from './AuthLayout';
import { TextField } from './TextField';
import { useAuth } from './useAuth';
import { useServerError } from './useAuthForm';

// O fuso não é um campo do formulário: o AuthProvider envia o do navegador.
const formSchema = registerSchema.omit({ timezone: true });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export function RegisterPage() {
  const { register: registerAccount } = useAuth();
  const navigate = useNavigate();
  const { serverError, run } = useServerError();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(formSchema) });

  const onSubmit = handleSubmit((values) =>
    run(async () => {
      await registerAccount(values);
      await navigate('/', { replace: true });
    }),
  );

  return (
    <AuthLayout
      title="Crie seu personagem"
      subtitle="Leva menos de um minuto. As áreas da sua vida você define depois."
      characterName={watch('name')}
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/login" className="font-semibold text-xp hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <TextField
          label="Nome"
          autoComplete="name"
          placeholder="Como devemos te chamar?"
          error={errors.name?.message}
          {...register('name')}
        />
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
          autoComplete="new-password"
          hint="Mínimo de 8 caracteres."
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
          {isSubmitting ? 'Criando...' : 'Criar conta'}
        </Button>
      </form>
    </AuthLayout>
  );
}
