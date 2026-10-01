/** Fusos IANA que o navegador conhece, garantindo que o fuso atual da pessoa esteja na lista. */
export function listTimezones(current: string): string[] {
  const supported =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return Array.from(new Set([current, ...supported])).sort((a, b) => a.localeCompare(b));
}
