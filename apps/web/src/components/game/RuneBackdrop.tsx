/** Atmosfera de fundo: grade fina + dois halos lentos. Decorativo, ignorado por leitores de tela. */
export function RuneBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="rune-grid absolute inset-0" />
      <div className="absolute -top-40 -left-32 size-[34rem] animate-drift rounded-full bg-primary/25 blur-[120px]" />
      <div className="absolute -right-40 -bottom-48 size-[30rem] animate-drift-slow rounded-full bg-xp/15 blur-[120px]" />
    </div>
  );
}
