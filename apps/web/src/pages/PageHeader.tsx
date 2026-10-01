import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
}

/** Cabeçalho padrão das telas autenticadas: eyebrow de HUD, título e ações à direita. */
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="font-hud text-xs tracking-[0.2em] text-muted-foreground uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-1 font-display text-4xl font-extrabold sm:text-5xl">{title}</h1>
        {description && <p className="mt-2 text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
