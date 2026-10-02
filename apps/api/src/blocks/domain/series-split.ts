import { addDays, endsSameDay, firstOccurrenceOnOrAfter, type CivilDate } from '@lifexp/shared';
import type { BlockTemplate, ExceptionRule } from './week-occurrences.js';

/** Campos que a pessoa pode alterar ao editar "a partir de uma data". */
export interface BlockChanges {
  activityId?: string;
  /** Nulo desvincula da meta; indefinido mantém o vínculo atual. */
  goalId?: string | null;
  weekday?: number;
  /** Só para bloco avulso. */
  date?: CivilDate;
  startTime?: string;
  durationMin?: number;
}

/** Uma conclusão vinculada ao bloco (ativa = não foi desfeita). */
export interface CompletionRef {
  occurrenceDate: CivilDate;
  active: boolean;
}

export type PlanInvalidReason =
  | 'NO_CHANGES'
  /** Mudar o dia da semana faria desaparecer ocorrências já concluídas (o XP ficaria órfão). */
  | 'COMPLETIONS_ON_CHANGED_WEEKDAY'
  /** Mudar a data de um bloco avulso já concluído: desfaça a conclusão antes. */
  | 'COMPLETION_ON_CHANGED_DATE'
  /** A data de corte é depois do fim da série: não há nada a partir dela para alterar. */
  | 'FROM_AFTER_END'
  /** Campo que não faz sentido para o tipo do bloco (ex.: weekday em bloco avulso). */
  | 'FIELD_NOT_APPLICABLE'
  | 'CROSSES_MIDNIGHT';

/** Campos de um bloco novo (o service acrescenta userId). */
export interface NewBlockData {
  activityId: string;
  goalId: string | null;
  recurrence: 'weekly' | 'once';
  weekday: number | null;
  date: CivilDate | null;
  startTime: string;
  durationMin: number;
  validFrom: CivilDate | null;
  validUntil: CivilDate | null;
}

export type EditPlan =
  | { kind: 'invalid'; reason: PlanInvalidReason }
  /** Não há passado a proteger: o próprio bloco é atualizado. */
  | {
      kind: 'in-place';
      update: Partial<NewBlockData>;
      /** Datas de ocorrência cujas exceções devem ser apagadas. */
      dropExceptions: CivilDate[];
    }
  /** Há passado: encerra o bloco atual e cria um novo a partir da data. */
  | {
      kind: 'split';
      /** Novo validUntil do bloco atual (o dia anterior à data de corte). */
      closeCurrentAt: CivilDate;
      newBlock: NewBlockData;
      /** Exceções a partir da data de corte que passam a pertencer ao bloco novo. */
      moveExceptions: CivilDate[];
      dropExceptions: CivilDate[];
      /** Conclusões (ativas ou desfeitas) a partir da data de corte que acompanham a série nova. */
      moveCompletions: CivilDate[];
    };

export type DeletePlan =
  /** Há conclusões ativas que deixariam de ter ocorrência: desfaça-as antes. */
  | { kind: 'invalid'; reason: 'ACTIVE_COMPLETIONS' }
  /** A série já terminou antes da data: não há nada a excluir (idempotente, não é erro). */
  | { kind: 'noop' }
  /** Bloco avulso: a linha é removida. */
  | { kind: 'delete-row' }
  /**
   * Série semanal: apenas encerra. A linha fica (mesmo "encerrada antes de começar") para
   * preservar o histórico de conclusões do Marco 1d.
   */
  | { kind: 'end-series'; validUntil: CivilDate; dropExceptions: CivilDate[] };

/** Existe alguma ocorrência real da série antes da data de corte? */
function hasOccurrenceBefore(block: BlockTemplate, from: CivilDate): boolean {
  const first = firstOccurrenceOnOrAfter(block.validFrom as CivilDate, block.weekday as number);
  const withinEnd = block.validUntil === null || first <= block.validUntil;
  return withinEnd && first < from;
}

const startsOnOrAfter = (dates: readonly ExceptionRule[], from: CivilDate): CivilDate[] =>
  dates.filter((rule) => rule.occurrenceDate >= from).map((rule) => rule.occurrenceDate);

function hasChanges(changes: BlockChanges): boolean {
  return Object.values(changes).some((value) => value !== undefined);
}

/**
 * Decide como aplicar uma edição "a partir de `from`" (RF12, RF49):
 *  - bloco avulso: edita no lugar;
 *  - série sem ocorrências antes de `from`: edita no lugar (nada do passado a proteger);
 *  - série com passado: encerra a série atual no dia anterior e cria uma nova a partir de `from`.
 *
 * Garantia central: as ocorrências ANTES de `from` nunca mudam. Exceções (pular/alterar) feitas
 * para datas >= `from` acompanham a série nova, a menos que o dia da semana mude, caso em que
 * elas não fazem mais sentido e são descartadas.
 */
export function planEdit(
  block: BlockTemplate,
  from: CivilDate,
  changes: BlockChanges,
  exceptions: readonly ExceptionRule[],
  completions: readonly CompletionRef[] = [],
): EditPlan {
  if (!hasChanges(changes)) return { kind: 'invalid', reason: 'NO_CHANGES' };

  const merged = {
    activityId: changes.activityId ?? block.activityId,
    goalId: changes.goalId !== undefined ? changes.goalId : (block.goalId ?? null),
    startTime: changes.startTime ?? block.startTime,
    durationMin: changes.durationMin ?? block.durationMin,
  };
  if (!endsSameDay(merged.startTime, merged.durationMin)) {
    return { kind: 'invalid', reason: 'CROSSES_MIDNIGHT' };
  }

  if (block.recurrence === 'once') {
    if (changes.weekday !== undefined) return { kind: 'invalid', reason: 'FIELD_NOT_APPLICABLE' };
    const dateChanged = changes.date !== undefined && changes.date !== block.date;
    if (dateChanged && completions.some((completion) => completion.active)) {
      return { kind: 'invalid', reason: 'COMPLETION_ON_CHANGED_DATE' };
    }
    return {
      kind: 'in-place',
      update: { ...merged, ...(changes.date !== undefined && { date: changes.date }) },
      // As exceções são amarradas à data antiga; se a data muda, perdem o sentido.
      dropExceptions: dateChanged ? exceptions.map((rule) => rule.occurrenceDate) : [],
    };
  }

  if (changes.date !== undefined) return { kind: 'invalid', reason: 'FIELD_NOT_APPLICABLE' };
  if (block.validUntil !== null && from > block.validUntil) {
    return { kind: 'invalid', reason: 'FROM_AFTER_END' };
  }

  const weekday = changes.weekday ?? (block.weekday as number);
  const weekdayChanged = weekday !== block.weekday;
  const affected = startsOnOrAfter(exceptions, from);
  const completionsFrom = completions.filter((completion) => completion.occurrenceDate >= from);
  // Mudar o dia da semana tira as ocorrências do lugar: não pode deixar conclusão ativa para trás.
  if (weekdayChanged && completionsFrom.some((completion) => completion.active)) {
    return { kind: 'invalid', reason: 'COMPLETIONS_ON_CHANGED_WEEKDAY' };
  }

  if (!hasOccurrenceBefore(block, from)) {
    const validFrom = block.validFrom !== null && from > block.validFrom ? from : block.validFrom;
    return {
      kind: 'in-place',
      // validFrom avança até `from`: sem isso, mudar o dia da semana poderia criar uma
      // ocorrência ANTES da data que a pessoa escolheu.
      update: { ...merged, weekday, validFrom },
      dropExceptions: weekdayChanged ? exceptions.map((rule) => rule.occurrenceDate) : [],
    };
  }

  return {
    kind: 'split',
    closeCurrentAt: addDays(from, -1),
    newBlock: {
      ...merged,
      recurrence: 'weekly',
      weekday,
      date: null,
      validFrom: from,
      validUntil: block.validUntil,
    },
    moveExceptions: weekdayChanged ? [] : affected,
    dropExceptions: weekdayChanged ? affected : [],
    // As conclusões acompanham a série nova (o dia não mudou, então as ocorrências continuam lá).
    moveCompletions: weekdayChanged
      ? []
      : completionsFrom.map((completion) => completion.occurrenceDate),
  };
}

/**
 * Decide como excluir "a partir de `from`": bloco avulso some; série semanal só é encerrada, e o
 * passado (e o histórico) permanece intacto.
 */
export function planDelete(
  block: BlockTemplate,
  from: CivilDate,
  exceptions: readonly ExceptionRule[],
  completions: readonly CompletionRef[] = [],
): DeletePlan {
  if (block.recurrence === 'once') {
    return completions.some((completion) => completion.active)
      ? { kind: 'invalid', reason: 'ACTIVE_COMPLETIONS' }
      : { kind: 'delete-row' };
  }

  const validFrom = block.validFrom as CivilDate;
  if (block.validUntil !== null && from > block.validUntil) return { kind: 'noop' };
  // Encerrar a série faria sumir ocorrências já concluídas: o XP ficaria sem como desfazer.
  if (completions.some((completion) => completion.active && completion.occurrenceDate >= from)) {
    return { kind: 'invalid', reason: 'ACTIVE_COMPLETIONS' };
  }

  // Nunca antes de "validFrom - 1": é o menor valor permitido (série encerrada sem ocorrências).
  const dayBefore = addDays(from, -1);
  const floor = addDays(validFrom, -1);
  return {
    kind: 'end-series',
    validUntil: dayBefore > floor ? dayBefore : floor,
    dropExceptions: startsOnOrAfter(exceptions, from),
  };
}
