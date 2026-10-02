import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEvent, Occurrence } from '@lifexp/shared';
import { EventDialog } from '../events/EventDialog';
import { OccurrenceDialog } from '../blocks/OccurrenceDialog';
import type { OccurrenceDisplay } from '../blocks/OccurrenceCard';
import { GOAL_ID, json } from '../goals/testing';
import { setAccessToken } from '@/lib/apiClient';
import { GoalNotes } from './GoalNotes';
import { makeFakeNotes, makeNote } from './testing';

const EVENT: CalendarEvent = {
  id: '0192f1a0-7b3c-7000-8000-0000000000f1',
  areaId: null,
  title: 'Consulta médica',
  notes: null,
  date: '2026-10-20',
  time: '14:30',
  category: 'medical',
  remindBeforeMin: null,
};

const OCCURRENCE: Occurrence = {
  blockId: '0192f1a0-7b3c-7000-8000-0000000000c1',
  occurrenceDate: '2026-10-07',
  date: '2026-10-07',
  startTime: '09:00',
  durationMin: 60,
  activityId: '0192f1a0-7b3c-7000-8000-0000000000a1',
  areaId: '0192f1a0-7b3c-7000-8000-0000000000b1',
  goalId: null,
  recurrence: 'once',
  skipped: false,
  modified: false,
};

function Where({ onChange }: { onChange: (path: string) => void }) {
  const location = useLocation();
  onChange(`${location.pathname}${location.search}`);
  return null;
}

function renderIn(children: ReactNode, onPath: (path: string) => void = () => undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={children} />
        </Routes>
        <Where onChange={onPath} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('atalhos "Anotar" (RF44)', () => {
  beforeEach(() => setAccessToken('token'));
  afterEach(() => vi.unstubAllGlobals());

  describe('na meta', () => {
    const stub = (notes = makeFakeNotes()) => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async (input, init) => notes.handle(String(input), init) ?? json(404)),
      );
      return notes;
    };

    it('lista as notas da meta, só as dela, e leva a cada nota', async () => {
      const fake = stub(
        makeFakeNotes([
          makeNote({
            id: '0192f1a0-7b3c-7000-8000-0000000000e1',
            title: 'Resumo do capítulo 1',
            content: 'Cena no porto',
            link: { type: 'goal', id: GOAL_ID, label: 'Ler 12 livros' },
          }),
          makeNote({
            id: '0192f1a0-7b3c-7000-8000-0000000000e2',
            title: 'De outra meta',
            link: { type: 'goal', id: '0192f1a0-7b3c-7000-8000-0000000000e9', label: 'Outra' },
          }),
          makeNote({ id: '0192f1a0-7b3c-7000-8000-0000000000e3', title: 'Solta' }),
        ]),
      );
      renderIn(<GoalNotes goalId={GOAL_ID} goalTitle="Ler 12 livros" />);

      const link = await screen.findByRole('link', { name: /Resumo do capítulo 1/ });
      expect(link).toHaveAttribute('href', '/notas/0192f1a0-7b3c-7000-8000-0000000000e1');
      expect(link).toHaveTextContent('Cena no porto');
      expect(screen.queryByText('De outra meta')).not.toBeInTheDocument();
      expect(screen.queryByText('Solta')).not.toBeInTheDocument();
      expect(fake.calls[0]!.url).toContain(`goalId=${GOAL_ID}`);
    });

    it('o botão "Nova nota" já leva o vínculo e o nome da meta', async () => {
      stub();
      renderIn(<GoalNotes goalId={GOAL_ID} goalTitle="Ler & escrever" />);
      const link = await screen.findByRole('link', { name: 'Nova nota' });
      expect(link).toHaveAttribute('href', `/notas/nova?goalId=${GOAL_ID}&rotulo=Ler+%26+escrever`);
    });

    it('sem notas, explica', async () => {
      stub();
      renderIn(<GoalNotes goalId={GOAL_ID} goalTitle="x" />);
      expect(await screen.findByText('Nenhuma nota ligada a esta meta ainda.')).toBeInTheDocument();
    });

    it('mostra só as 5 mais recentes e aponta para a lista completa', async () => {
      stub(
        makeFakeNotes(
          Array.from({ length: 7 }, (_, i) =>
            makeNote({
              id: `0192f1a0-7b3c-7000-8000-0000000000${String(10 + i)}`,
              title: `nota ${i}`,
              link: { type: 'goal', id: GOAL_ID, label: 'Meta' },
              updatedAt: `2026-10-0${i + 1}T12:00:00.000Z`,
            }),
          ),
        ),
      );
      renderIn(<GoalNotes goalId={GOAL_ID} goalTitle="x" />);
      await screen.findByText('nota 6');
      const section = screen.getByRole('region', { name: 'Notas' });
      expect(within(section).getAllByRole('listitem')).toHaveLength(5);
      expect(screen.getByText(/Mostrando as 5 mais recentes/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Notas' })).toHaveAttribute('href', '/notas');
    });

    it('erro ao carregar avisa, sem derrubar a tela', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async () => json(500, { message: 'falhou' })),
      );
      renderIn(<GoalNotes goalId={GOAL_ID} goalTitle="x" />);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Não foi possível carregar as notas desta meta.',
      );
      expect(screen.getByRole('link', { name: 'Nova nota' })).toBeInTheDocument();
    });
  });

  describe('no evento', () => {
    it('"Anotar" leva ao editor já vinculado ao evento e fecha o painel', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async () => json(200, [])),
      );
      let path = '';
      const onClose = vi.fn();
      renderIn(<EventDialog event={EVENT} onClose={onClose} onEdit={vi.fn()} />, (p) => (path = p));

      const link = await screen.findByRole('link', { name: 'Anotar' });
      expect(link).toHaveAttribute(
        'href',
        `/notas/nova?eventId=${EVENT.id}&rotulo=Consulta+m%C3%A9dica`,
      );
      await userEvent.click(link);

      expect(onClose).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(path).toBe(`/notas/nova?eventId=${EVENT.id}&rotulo=Consulta+m%C3%A9dica`),
      );
    });

    it('durante a confirmação de exclusão o atalho não aparece', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async () => json(200, [])),
      );
      renderIn(<EventDialog event={EVENT} onClose={vi.fn()} onEdit={vi.fn()} />);
      await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
      expect(screen.queryByRole('link', { name: 'Anotar' })).not.toBeInTheDocument();
    });
  });

  describe('no bloco', () => {
    const display: OccurrenceDisplay = {
      occurrence: OCCURRENCE,
      activityName: 'Corrida',
      areaName: 'Saúde',
      areaColor: 'moss',
      areaIcon: 'heart-pulse',
    };

    it('"Anotar" leva ao editor já vinculado ao bloco e fecha o painel', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async () => json(200, [])),
      );
      let path = '';
      const onClose = vi.fn();
      renderIn(<OccurrenceDialog display={display} onClose={onClose} />, (p) => (path = p));

      await userEvent.click(await screen.findByRole('button', { name: /Anotar/ }));

      expect(onClose).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(path).toBe(`/notas/nova?blockId=${OCCURRENCE.blockId}&rotulo=Corrida`),
      );
    });

    it('também aparece em ocorrência concluída ou pulada (a nota é sobre o bloco, não sobre o estado)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async () => json(200, [])),
      );
      renderIn(
        <OccurrenceDialog
          display={{ ...display, occurrence: { ...OCCURRENCE, skipped: true } }}
          onClose={vi.fn()}
        />,
      );
      expect(await screen.findByRole('button', { name: /Anotar/ })).toBeInTheDocument();
    });
  });
});
