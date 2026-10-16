import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { GuestRoute } from './GuestRoute';

const auth = vi.hoisted(() => ({ state: { status: 'anonymous' } as { status: string } }));
vi.mock('./useAuth', () => ({ useAuth: () => ({ state: auth.state }) }));

function renderAt(entry: string | { pathname: string; state?: unknown }) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<p>tela de login</p>} />
        </Route>
        <Route path="/" element={<p>home</p>} />
        <Route path="/semana" element={<p>semana</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GuestRoute', () => {
  it('anônimo vê a tela de login', () => {
    auth.state = { status: 'anonymous' };
    renderAt('/login');
    expect(screen.getByText('tela de login')).toBeInTheDocument();
  });

  it('enquanto carrega, não decide nada', () => {
    auth.state = { status: 'loading' };
    renderAt('/login');
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('autenticado sem página de origem vai para a home', () => {
    auth.state = { status: 'authenticated' };
    renderAt('/login');
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('autenticado volta para a página que tentou abrir antes do login', () => {
    auth.state = { status: 'authenticated' };
    renderAt({ pathname: '/login', state: { from: '/semana' } });
    expect(screen.getByText('semana')).toBeInTheDocument();
  });

  it.each(['//outro.site', 'https://outro.site/x', 42, null])(
    'origem que não é caminho do app (%s) cai na home',
    (from) => {
      auth.state = { status: 'authenticated' };
      renderAt({ pathname: '/login', state: { from } });
      expect(screen.getByText('home')).toBeInTheDocument();
    },
  );
});
