/**
 * Fundo do LifeXP: um céu noturno com poeira de estrelas e uma constelação de nós hexagonais (a mesma forma do
 * selo de nível) ligados como numa árvore de habilidades. Fica fixo na janela, atrás de tudo, e as cores vêm dos
 * tokens, então no tema claro vira uma carta celeste em tinta azul. Decorativo: leitores de tela o ignoram.
 */

/** Gerador pseudoaleatório com semente: o céu é sempre o mesmo, sem mudar a cada renderização. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WIDTH = 1600;
const HEIGHT = 900;

const random = seeded(2026);
const STARS = Array.from({ length: 170 }, (_, index) => ({
  x: Math.round(random() * WIDTH),
  y: Math.round(random() * HEIGHT),
  r: 0.6 + random() * 1.1,
  opacity: 0.35 + random() * 0.55,
  // só algumas piscam, cada uma no seu ritmo
  twinkle: index % 5 === 0,
  delay: Math.round(random() * 60) / 10,
}));

type Point = readonly [number, number];

/** Os nós da constelação: um aglomerado grande à direita, um menor embaixo à esquerda e um satélite. */
const NODES: Record<string, { at: Point; lit?: boolean }> = {
  a: { at: [470, 110] },
  b: { at: [660, 62] },
  c: { at: [860, 150], lit: true },
  d: { at: [1080, 78] },
  e: { at: [1290, 170] },
  f: { at: [1500, 90], lit: true },
  g: { at: [1470, 330] },
  h: { at: [1545, 520] },
  i: { at: [1180, 300] },
  j: { at: [150, 700] },
  k: { at: [310, 800], lit: true },
  l: { at: [520, 740] },
};

const EDGES: ReadonlyArray<readonly [string, string]> = [
  ['a', 'b'],
  ['b', 'c'],
  ['c', 'd'],
  ['d', 'e'],
  ['e', 'f'],
  ['e', 'g'],
  ['f', 'g'],
  ['g', 'h'],
  ['e', 'i'],
  ['c', 'i'],
  ['j', 'k'],
  ['k', 'l'],
];

/** Pontos de um hexágono "de pé" (vértice para cima), como o selo de nível. */
const hexagon = ([cx, cy]: Point, radius: number) =>
  Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');

export function SkyBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* névoa: dois focos de azul e um escurecimento nas bordas para a leitura ficar no centro */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(60rem 36rem at 88% -8%, color-mix(in oklab, var(--primary) 26%, transparent), transparent 70%)',
            'radial-gradient(48rem 30rem at 4% 108%, color-mix(in oklab, var(--xp) 14%, transparent), transparent 70%)',
            'radial-gradient(90rem 50rem at 50% 50%, transparent 55%, color-mix(in oklab, var(--background) 70%, transparent))',
          ].join(','),
        }}
      />
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        <g fill="var(--foreground)">
          {STARS.map((star, index) => (
            <circle
              key={index}
              cx={star.x}
              cy={star.y}
              r={star.r}
              opacity={star.opacity}
              className={star.twinkle ? 'animate-twinkle' : undefined}
              style={star.twinkle ? { animationDelay: `${star.delay}s` } : undefined}
            />
          ))}
        </g>

        <g stroke="var(--xp)" strokeWidth="1.2" opacity="0.5">
          {EDGES.map(([from, to]) => {
            const [x1, y1] = NODES[from]!.at;
            const [x2, y2] = NODES[to]!.at;
            return <line key={`${from}-${to}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>

        {Object.entries(NODES).map(([key, { at, lit }]) => (
          <g key={key}>
            {lit && (
              <circle
                cx={at[0]}
                cy={at[1]}
                r="42"
                fill="var(--xp)"
                className="animate-node-glow"
                opacity="0.18"
              />
            )}
            <polygon
              points={hexagon(at, lit ? 18 : 12)}
              fill="var(--background)"
              stroke="var(--xp)"
              strokeWidth={lit ? 2 : 1.2}
              opacity={lit ? 1 : 0.7}
            />
            {lit && <circle cx={at[0]} cy={at[1]} r="4" fill="var(--xp)" />}
          </g>
        ))}
      </svg>
    </div>
  );
}
