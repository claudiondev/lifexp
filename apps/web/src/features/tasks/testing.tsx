import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import {
  MAX_TASK_ITEMS,
  TASK_DAILY_XP_CAP,
  TASK_XP,
  addDays,
  levelProgress,
  type Task,
  type TaskPriority,
} from '@lifexp/shared';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { setAccessToken } from '@/lib/apiClient';

export const TODAY = '2026-10-07';
/** Id de passo de teste (precisa ser UUID, como a API devolve). */
export const itemId = (n: number) =>
  `0192f1a0-7b3c-7000-8000-0000000001${String(n).padStart(2, '0')}`;
export const AREA_ID = '0192f1a0-7b3c-7000-8000-0000000000b1';
const NOON = '2026-10-07T15:00:00.000Z';

export const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let counter = 0;
const uuid = () => `0192f1a0-7b3c-7000-8000-${String(++counter).padStart(12, '0')}`;

export function makeTask(overrides: Partial<Task> = {}): Task {
  const priority: TaskPriority = overrides.priority ?? 'medium';
  return {
    id: uuid(),
    title: 'Pagar a conta de luz',
    note: null,
    dueDate: TODAY,
    priority,
    areaId: null,
    goalId: null,
    completedAt: null,
    xpAwarded: 0,
    xpPreview: TASK_XP[priority],
    carriedFrom: null,
    items: [],
    ...overrides,
  };
}

export interface Call {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

interface FakeOptions {
  tasks?: Task[];
  /** XP de tarefas já ganho hoje (para o teto diário). */
  xpToday?: number;
  /** Falha forçada da listagem (status). */
  listStatus?: number;
  /** Falha forçada de uma escrita: "MÉTODO url" -> { status, message }. */
  fail?: Record<string, { status: number; message: string }>;
  /** XP total já acumulado (para testar a subida de nível). */
  totalXp?: number;
}

/**
 * API falsa em memória que imita as regras do servidor: lista Hoje/Pendentes, concluir com o teto diário, estorno,
 * checklist com limite. Chamadas ficam em `calls`.
 */
export function setupFakeTasks(options: FakeOptions = {}) {
  const state = {
    tasks: (options.tasks ?? []).map((task) => ({ ...task, items: [...task.items] })),
    used: options.xpToday ?? 0,
    totalXp: options.totalXp ?? 0,
  };
  const calls: Call[] = [];

  const find = (id: string) => state.tasks.find((task) => task.id === id);
  const view = (scope: string | null) => {
    const open = (task: Task) => task.completedAt === null;
    const tasks =
      scope === 'inbox'
        ? state.tasks.filter((task) => open(task) && task.dueDate === null)
        : state.tasks.filter(
            (task) =>
              (open(task) && task.dueDate !== null && task.dueDate <= TODAY) ||
              (!open(task) && task.completedAt?.slice(0, 10) === TODAY),
          );
    return { tasks, xpToday: state.used, xpCap: TASK_DAILY_XP_CAP };
  };
  const withCarried = (task: Task): Task => ({
    ...task,
    carriedFrom:
      task.completedAt === null && task.dueDate !== null && task.dueDate < TODAY
        ? task.dueDate
        : null,
  });

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;

      if (url === '/api/auth/refresh') {
        return json(200, {
          user: {
            id: '0192f1a0-7b3c-7000-8000-000000000001',
            name: 'Ana',
            email: 'ana@mail.com',
            timezone: 'America/Sao_Paulo',
            avatarKey: 'swords',
            createdAt: '2026-10-01T12:00:00.000Z',
          },
          accessToken: 't',
        });
      }
      if (url.startsWith('/api/areas')) {
        return json(200, [
          {
            id: AREA_ID,
            name: 'Estudos',
            color: 'violet',
            icon: 'briefcase',
            position: 0,
            archivedAt: null,
          },
        ]);
      }
      if (url === '/api/goals') return json(200, []);
      if (url.startsWith('/api/activities')) return json(200, []);

      if (!url.startsWith('/api/tasks')) return json(404, { message: 'não previsto no teste' });
      calls.push({ method, url, ...(body && { body }) });

      const failure = options.fail?.[`${method} ${url}`];
      if (failure) return json(failure.status, { message: failure.message });

      if (method === 'GET') {
        if (options.listStatus && options.listStatus >= 400) {
          return json(options.listStatus, { message: 'falhou' });
        }
        const scope = new URL(url, 'http://x').searchParams.get('scope');
        const result = view(scope);
        return json(200, { ...result, tasks: result.tasks.map(withCarried) });
      }
      if (url === '/api/tasks' && method === 'POST') {
        const task = makeTask({
          title: String(body?.['title']),
          note: (body?.['note'] as string | null | undefined) ?? null,
          dueDate: (body?.['dueDate'] as string | null | undefined) ?? null,
          priority: (body?.['priority'] as TaskPriority | undefined) ?? 'medium',
          areaId: (body?.['areaId'] as string | null | undefined) ?? null,
        });
        state.tasks.push(task);
        return json(201, withCarried(task));
      }

      const match = /^\/api\/tasks\/([^/]+)(?:\/(complete|items)(?:\/([^/]+))?)?$/.exec(url);
      const task = match ? find(match[1]!) : undefined;
      if (!match || !task) return json(404, { message: 'Tarefa não encontrada' });
      const [, , sub, itemId] = match;

      if (!sub && method === 'PATCH') {
        Object.assign(task, body);
        if (body && 'priority' in body) task.xpPreview = TASK_XP[task.priority];
        return json(200, withCarried(task));
      }
      if (!sub && method === 'DELETE') {
        state.tasks = state.tasks.filter((item) => item.id !== task.id);
        return new Response(null, { status: 204 });
      }
      if (sub === 'complete' && method === 'POST') {
        const before = levelProgress(state.totalXp).level;
        if (task.completedAt) {
          return json(200, completion(task, true, 0, false, before, before, state.totalXp));
        }
        const full = TASK_XP[task.priority];
        const amount = Math.min(full, Math.max(0, TASK_DAILY_XP_CAP - state.used));
        state.used += amount;
        state.totalXp += amount;
        task.completedAt = NOON;
        task.xpAwarded = amount;
        const after = levelProgress(state.totalXp).level;
        return json(
          200,
          completion(task, false, amount, amount < full, before, after, state.totalXp),
        );
      }
      if (sub === 'complete' && method === 'DELETE') {
        const reverted = task.completedAt ? task.xpAwarded : 0;
        state.used -= reverted;
        state.totalXp -= reverted;
        task.completedAt = null;
        task.xpAwarded = 0;
        return json(200, {
          task: withCarried(task),
          xpReverted: reverted,
          total: levelProgress(state.totalXp),
          area: null,
        });
      }
      if (sub === 'items' && method === 'POST') {
        if (task.items.length >= MAX_TASK_ITEMS) return json(409, { message: 'Passos demais' });
        task.items.push({
          id: uuid(),
          title: String(body?.['title']),
          done: false,
          doneAt: null,
          position: task.items.length,
        });
        return json(201, withCarried(task));
      }
      const item = task.items.find((candidate) => candidate.id === itemId);
      if (sub === 'items' && item && method === 'PATCH') {
        if (typeof body?.['done'] === 'boolean') {
          item.done = body['done'];
          item.doneAt = item.done ? NOON : null;
        }
        if (typeof body?.['title'] === 'string') item.title = body['title'];
        return json(200, withCarried(task));
      }
      if (sub === 'items' && item && method === 'DELETE') {
        task.items = task.items.filter((candidate) => candidate.id !== item.id);
        return json(200, withCarried(task));
      }
      return json(404, { message: 'não previsto no teste' });
    }),
  );

  return { calls, state };
}

function completion(
  task: Task,
  already: boolean,
  xpAwarded: number,
  capped: boolean,
  levelBefore: number,
  levelAfter: number,
  totalXp: number,
) {
  return {
    task: { ...task, carriedFrom: null },
    alreadyCompleted: already,
    xpAwarded,
    capped,
    levelBefore,
    levelAfter,
    total: levelProgress(totalXp),
    area: null,
  };
}

/** Renderiza dentro dos provedores que a tela usa (consulta, rotas e sessão). */
export function renderWithProviders(ui: ReactElement, route = '/hoje') {
  setAccessToken('token');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const tomorrow = addDays(TODAY, 1);
