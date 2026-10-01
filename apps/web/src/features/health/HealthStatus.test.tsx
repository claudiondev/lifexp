import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthStatus } from './HealthStatus';

describe('HealthStatus', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mostra o status retornado pela API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', timestamp: '2026-10-01T12:00:00.000Z' }),
      }),
    );
    render(<HealthStatus />);
    expect(await screen.findByText('ok')).toBeInTheDocument();
  });

  it('mostra erro quando a API falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(<HealthStatus />);
    expect(await screen.findByRole('alert')).toHaveTextContent('API indisponível');
  });
});
