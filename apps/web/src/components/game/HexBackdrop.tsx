/**
 * Fundo do LifeXP: azul-noite liso, uma luz suave no topo e uma textura de favos hexagonais (a forma do selo de
 * nível) que se apaga conforme desce, para a leitura ficar limpa. Fica fixo na janela, atrás de tudo; as cores
 * vêm dos tokens, então no tema claro vira o mesmo desenho em tinta azul. Decorativo: leitores de tela o ignoram.
 */

/** Raio do hexágono e medidas do ladrilho: um hexágono "de pé" tem largura raiz(3)·r e a repetição vertical é 3·r. */
const RADIUS = 30;
const TILE_W = Math.sqrt(3) * RADIUS;
const TILE_H = 3 * RADIUS;

/** Contorno de um hexágono de pé centrado em (cx, cy). */
const hexagon = (cx: number, cy: number) =>
  Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index - Math.PI / 2;
    return `${(cx + RADIUS * Math.cos(angle)).toFixed(2)},${(cy + RADIUS * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');

/** Os três hexágonos que, repetidos, cobrem o plano (linhas alternadas ficam deslocadas meia largura). */
const CELLS: ReadonlyArray<readonly [number, number]> = [
  [TILE_W / 2, RADIUS],
  [0, 2.5 * RADIUS],
  [TILE_W, 2.5 * RADIUS],
];

export function HexBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* luz: um foco de azul no topo e outro, mais fraco, no canto de baixo */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(70rem 30rem at 50% -10%, color-mix(in oklab, var(--primary) 24%, transparent), transparent 70%)',
            'radial-gradient(40rem 24rem at 100% 100%, color-mix(in oklab, var(--xp) 10%, transparent), transparent 70%)',
          ].join(','),
        }}
      />
      {/* favos: mais visíveis no topo, somem antes do meio da tela */}
      <svg
        className="absolute inset-0 size-full"
        style={{
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 0%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 0%, black, transparent)',
        }}
      >
        <defs>
          <pattern
            id="hex-backdrop"
            width={TILE_W}
            height={TILE_H}
            patternUnits="userSpaceOnUse"
          >
            {CELLS.map(([cx, cy]) => (
              <polygon
                key={`${cx}-${cy}`}
                points={hexagon(cx, cy)}
                fill="none"
                stroke="var(--xp)"
                strokeWidth="1"
                opacity="0.22"
              />
            ))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hex-backdrop)" />
      </svg>
    </div>
  );
}
