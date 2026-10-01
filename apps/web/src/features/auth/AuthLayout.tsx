import type { ReactNode } from 'react';

interface AuthLayoutProps {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthLayout({ title, children, footer }: AuthLayoutProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold">LifeXP</h1>
        <p className="text-slate-600">{title}</p>
      </header>
      {children}
      <p className="text-center text-sm text-slate-600">{footer}</p>
    </main>
  );
}
