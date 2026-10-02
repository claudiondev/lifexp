import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/apiClient';
import { PushCard } from './PushCard';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const browser = vi.hoisted(() => ({
  isPushSupported: vi.fn(),
  notificationPermission: vi.fn(),
  requestNotificationPermission: vi.fn(),
  currentSubscription: vi.fn(),
  subscribeThisDevice: vi.fn(),
  unsubscribeThisDevice: vi.fn(),
  toSubscriptionInput: vi.fn(),
}));
vi.mock('./pushBrowser', () => browser);

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/aparelho';
const INPUT = { endpoint: ENDPOINT, keys: { p256dh: 'P'.repeat(30), auth: 'A'.repeat(20) } };
const prefs = (pushEnabled: boolean) => ({
  blockRemindersEnabled: true,
  blockLeadMin: 15,
  eventRemindersEnabled: true,
  digestEnabled: true,
  digestTime: '07:00',
  digestEmailEnabled: false,
  weeklyReportEnabled: true,
  pushEnabled,
});

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Options {
  config?: { enabled: boolean; publicKey: string | null } | 'error';
  devices?: number;
  pushEnabled?: boolean;
  subscribeStatus?: number;
  testSent?: number;
}

function setup(options: Options = {}) {
  let devices = options.devices ?? 0;
  let pushEnabled = options.pushEnabled ?? false;
  const calls: { method: string; url: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });

      if (url === '/api/push/config') {
        if (options.config === 'error') return json(500, { message: 'falhou' });
        return json(200, options.config ?? { enabled: true, publicKey: 'BKey'.padEnd(50, 'x') });
      }
      if (url === '/api/push/subscriptions' && method === 'GET') return json(200, { devices });
      if (url === '/api/push/subscriptions' && method === 'POST') {
        if (options.subscribeStatus)
          return json(options.subscribeStatus, { message: 'Você já tem 10 aparelhos' });
        devices += 1;
        return json(201, { devices });
      }
      if (url === '/api/push/subscriptions' && method === 'DELETE') {
        devices = Math.max(0, devices - 1);
        return new Response(null, { status: 204 });
      }
      if (url === '/api/push/test') return json(200, { sent: options.testSent ?? 1 });
      if (url === '/api/notification-preferences' && method === 'GET')
        return json(200, prefs(pushEnabled));
      if (url === '/api/notification-preferences' && method === 'PUT') {
        pushEnabled = (body as { pushEnabled: boolean }).pushEnabled;
        return json(200, prefs(pushEnabled));
      }
      return json(404);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PushCard />
    </QueryClientProvider>,
  );
  return { calls };
}

const puts = (calls: { method: string; url: string; body?: unknown }[]) =>
  calls
    .filter((c) => c.method === 'PUT' && c.url === '/api/notification-preferences')
    .map((c) => c.body);

describe('PushCard (RF41)', () => {
  const unsubscribe = vi.fn(async () => true);
  beforeEach(() => {
    setAccessToken('token');
    toast.success.mockClear();
    toast.error.mockClear();
    unsubscribe.mockClear();
    browser.isPushSupported.mockReturnValue(true);
    browser.notificationPermission.mockReturnValue('default');
    browser.requestNotificationPermission.mockResolvedValue('granted');
    browser.currentSubscription.mockResolvedValue(null);
    browser.subscribeThisDevice.mockResolvedValue({ unsubscribe });
    browser.unsubscribeThisDevice.mockResolvedValue(null);
    browser.toSubscriptionInput.mockReturnValue(INPUT);
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('quando não dá para ativar', () => {
    it('servidor sem chaves VAPID: explica e não oferece botão', async () => {
      setup({ config: { enabled: false, publicKey: null } });
      expect(await screen.findByText(/O push não está ligado neste servidor/)).toBeVisible();
      expect(screen.queryByRole('button', { name: /Ativar/ })).not.toBeInTheDocument();
    });

    it('navegador sem suporte: explica, inclusive o caso do iPhone', async () => {
      browser.isPushSupported.mockReturnValue(false);
      setup();
      expect(await screen.findByText(/Tela de Início/)).toBeVisible();
      expect(screen.queryByRole('button', { name: /Ativar/ })).not.toBeInTheDocument();
    });

    it('permissão bloqueada no navegador: diz onde liberar', async () => {
      browser.notificationPermission.mockReturnValue('denied');
      setup();
      expect(await screen.findByText(/Você bloqueou as notificações/)).toBeVisible();
      expect(screen.queryByRole('button', { name: /Ativar/ })).not.toBeInTheDocument();
    });

    it('falha ao falar com o servidor: erro com "Tentar de novo"', async () => {
      setup({ config: 'error' });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Não foi possível verificar o push.',
      );
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
    });
  });

  describe('ativar neste aparelho', () => {
    it('pede a permissão, inscreve no navegador, guarda na API e liga a preferência', async () => {
      const { calls } = setup();

      await userEvent.click(await screen.findByRole('button', { name: 'Ativar neste aparelho' }));

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Push ativado neste aparelho'),
      );
      expect(browser.requestNotificationPermission).toHaveBeenCalledTimes(1);
      expect(browser.subscribeThisDevice).toHaveBeenCalledWith('BKey'.padEnd(50, 'x'));
      expect(calls).toContainEqual({ method: 'POST', url: '/api/push/subscriptions', body: INPUT });
      expect(puts(calls)).toEqual([{ pushEnabled: true }]);
    });

    it('depois de ativar, mostra o aparelho como ativo', async () => {
      browser.currentSubscription
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ endpoint: ENDPOINT });
      setup();
      await userEvent.click(await screen.findByRole('button', { name: 'Ativar neste aparelho' }));

      expect(await screen.findByText(/Ativo neste aparelho \(1 aparelho no total\)/)).toBeVisible();
      expect(screen.getByRole('button', { name: 'Desativar neste aparelho' })).toBeVisible();
    });

    it('permissão recusada: avisa, não inscreve nem chama a API', async () => {
      browser.requestNotificationPermission.mockResolvedValue('denied');
      const { calls } = setup();

      await userEvent.click(await screen.findByRole('button', { name: 'Ativar neste aparelho' }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Sem a permissão do navegador não dá para enviar avisos.',
        ),
      );
      expect(browser.subscribeThisDevice).not.toHaveBeenCalled();
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    });

    it('se a API recusar (ex.: limite de aparelhos), desfaz a inscrição do navegador e avisa', async () => {
      const { calls } = setup({ subscribeStatus: 409 });

      await userEvent.click(await screen.findByRole('button', { name: 'Ativar neste aparelho' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Você já tem 10 aparelhos'));
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(puts(calls)).toEqual([]);
      expect(screen.getByRole('button', { name: 'Ativar neste aparelho' })).toBeEnabled();
    });

    it('se a preferência já estava ligada, não a grava de novo', async () => {
      const { calls } = setup({ pushEnabled: true });
      await userEvent.click(await screen.findByRole('button', { name: 'Ativar neste aparelho' }));
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      expect(puts(calls)).toEqual([]);
    });
  });

  describe('com o aparelho ativo', () => {
    beforeEach(() => {
      browser.currentSubscription.mockResolvedValue({ endpoint: ENDPOINT });
      browser.notificationPermission.mockReturnValue('granted');
    });

    it('mostra o total de aparelhos e a preferência ligada', async () => {
      setup({ devices: 2, pushEnabled: true });
      expect(
        await screen.findByText(/Ativo neste aparelho \(2 aparelhos no total\)/),
      ).toBeVisible();
      expect(
        await screen.findByRole('switch', { name: 'Receber os avisos por push' }),
      ).toBeChecked();
    });

    it('o interruptor pausa os avisos sem desinscrever o aparelho', async () => {
      const { calls } = setup({ devices: 1, pushEnabled: true });
      await userEvent.click(
        await screen.findByRole('switch', { name: 'Receber os avisos por push' }),
      );

      await waitFor(() => expect(puts(calls)).toEqual([{ pushEnabled: false }]));
      expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
    });

    it('"Enviar teste" avisa que saiu', async () => {
      const { calls } = setup({ devices: 1, pushEnabled: true });
      await userEvent.click(await screen.findByRole('button', { name: 'Enviar teste' }));

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Aviso de teste enviado', {
          description: 'Ele deve chegar em instantes.',
        }),
      );
      expect(calls).toContainEqual(
        expect.objectContaining({ method: 'POST', url: '/api/push/test' }),
      );
    });

    it('teste que não chegou a ninguém orienta a reativar', async () => {
      setup({ devices: 1, pushEnabled: true, testSent: 0 });
      await userEvent.click(await screen.findByRole('button', { name: 'Enviar teste' }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('O teste não chegou a nenhum aparelho', {
          description: 'Desative e ative o push de novo neste aparelho.',
        }),
      );
    });

    it('desativar cancela no navegador e na API; sendo o último aparelho, desliga a preferência', async () => {
      browser.unsubscribeThisDevice.mockResolvedValue(ENDPOINT);
      const { calls } = setup({ devices: 1, pushEnabled: true });

      await userEvent.click(
        await screen.findByRole('button', { name: 'Desativar neste aparelho' }),
      );

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Push desativado neste aparelho'),
      );
      expect(calls).toContainEqual({
        method: 'DELETE',
        url: '/api/push/subscriptions',
        body: { endpoint: ENDPOINT },
      });
      expect(puts(calls)).toEqual([{ pushEnabled: false }]);
    });

    it('desativar com outros aparelhos ainda inscritos mantém a preferência ligada', async () => {
      browser.unsubscribeThisDevice.mockResolvedValue(ENDPOINT);
      const { calls } = setup({ devices: 2, pushEnabled: true });

      await userEvent.click(
        await screen.findByRole('button', { name: 'Desativar neste aparelho' }),
      );

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Push desativado neste aparelho'),
      );
      expect(puts(calls)).toEqual([]);
    });
  });
});
