/** 1.5 -> "×1,5". O peso multiplica o XP da atividade (RN01, RN02). */
export function formatWeight(weight: number): string {
  return `×${weight.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}
