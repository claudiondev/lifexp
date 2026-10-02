import '@testing-library/jest-dom/vitest';

// O jsdom não tem ResizeObserver; o Radix (Switch dentro de formulário) o usa para medir o controle.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
