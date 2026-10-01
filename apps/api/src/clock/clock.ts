/**
 * O "agora" da API. Injetado (e não `new Date()` espalhado pelo código) para os testes poderem
 * controlar o tempo: a janela de conclusão, que fecha às 23:59 do dia seguinte, só é testável
 * de forma confiável com um relógio que a gente move.
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
