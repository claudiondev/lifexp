import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider } from './features/auth/AuthProvider';
import { createQueryClient } from './lib/queryClient';
import { AppRoutes } from './router';

const queryClient = createQueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
      {/* Cores vêm dos tokens, então o aviso acompanha o tema claro/escuro. */}
      <Toaster
        position="bottom-right"
        style={
          {
            '--normal-bg': 'var(--card)',
            '--normal-text': 'var(--foreground)',
            '--normal-border': 'var(--border)',
          } as React.CSSProperties
        }
      />
    </QueryClientProvider>
  );
}
