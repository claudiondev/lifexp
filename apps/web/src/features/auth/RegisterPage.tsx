import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@lifexp/shared';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
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
      title="Crie sua conta"
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/login" className="font-medium text-indigo-600 hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Nome"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Senha"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {serverError && (
          <p role="alert" className="text-sm text-red-600">
            {serverError}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {isSubmitting ? 'Criando...' : 'Criar conta'}
        </button>
      </form>
    </AuthLayout>
  );
}
