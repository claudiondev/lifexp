import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// `findBy*` e `waitFor` esperam 1 s por padrão: com a suíte inteira (e a API e2e) rodando em paralelo,
// telas pesadas passam disso sem que nada esteja errado. 5 s evita falha causada só pela carga da máquina.
configure({ asyncUtilTimeout: 5000 });

// O jsdom não tem ResizeObserver; o Radix (Switch dentro de formulário) o usa para medir o controle.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
