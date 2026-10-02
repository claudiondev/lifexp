import { describe, expect, it } from 'vitest';
import { radarPoint, toPolygonPoints } from './radarGeometry';

const near = (value: number, expected: number) => expect(value).toBeCloseTo(expected, 6);

describe('radarPoint', () => {
  it('o primeiro eixo aponta para cima e a razão 1 chega ao raio', () => {
    const point = radarPoint(0, 4, 1, 100, 150, 150);
    near(point.x, 150);
    near(point.y, 50);
  });

  it('segue no sentido horário: com 4 eixos, o segundo aponta para a direita', () => {
    const point = radarPoint(1, 4, 1, 100, 150, 150);
    near(point.x, 250);
    near(point.y, 150);
  });

  it('o terceiro aponta para baixo e o quarto para a esquerda', () => {
    const down = radarPoint(2, 4, 1, 100, 0, 0);
    near(down.x, 0);
    near(down.y, 100);
    const left = radarPoint(3, 4, 1, 100, 0, 0);
    near(left.x, -100);
    near(left.y, 0);
  });

  it('razão 0 é o centro e metade da razão fica no meio do caminho', () => {
    const center = radarPoint(2, 5, 0, 100, 10, 20);
    near(center.x, 10);
    near(center.y, 20);
    near(radarPoint(0, 4, 0.5, 100, 0, 0).y, -50);
  });

  it('razão fora de 0 a 1 é limitada', () => {
    near(radarPoint(0, 4, 2, 100, 0, 0).y, -100);
    near(radarPoint(0, 4, -1, 100, 0, 0).y, 0);
  });
});

describe('toPolygonPoints', () => {
  it('formata com duas casas separadas por espaço', () => {
    expect(
      toPolygonPoints([
        { x: 1, y: 2.345 },
        { x: 10.1, y: 0 },
      ]),
    ).toBe('1.00,2.35 10.10,0.00');
  });

  it('sem pontos, texto vazio', () => {
    expect(toPolygonPoints([])).toBe('');
  });
});
