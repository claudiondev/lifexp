const UNKNOWN = 'Dispositivo desconhecido';

/** Navegador: a ordem importa (o Edge e o Opera também dizem "Chrome"; o Chrome também diz "Safari"). */
const BROWSERS: readonly [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser/, 'Samsung Internet'],
  [/Firefox\/|FxiOS/, 'Firefox'],
  [/Chrome\/|CriOS/, 'Chrome'],
  [/Safari\//, 'Safari'],
];

/** Sistema: iOS e Android antes de macOS e Linux (o iPhone diz "like Mac OS X"; o Android diz "Linux"). */
const SYSTEMS: readonly [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux|X11/, 'Linux'],
];

const firstMatch = (table: readonly [RegExp, string][], text: string): string | null =>
  table.find(([pattern]) => pattern.test(text))?.[1] ?? null;

/**
 * Nome curto do aparelho para a lista de sessões, a partir do User-Agent: "Chrome · Windows".
 * Só o que ajuda a pessoa a reconhecer o aparelho; o texto original não é mostrado nem devolvido.
 */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return UNKNOWN;
  const browser = firstMatch(BROWSERS, userAgent);
  const system = firstMatch(SYSTEMS, userAgent);
  if (browser && system) return `${browser} · ${system}`;
  return browser ?? system ?? UNKNOWN;
}
