import type { Balance } from '@lifexp/shared';

/** O radar só aparece quando alguma área tem blocos no período; antes disso não há o que mostrar. */
export const hasBalanceData = (balance: Balance): boolean =>
  balance.areas.some((area) => area.score !== null);
