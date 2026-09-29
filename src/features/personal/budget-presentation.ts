import type { BudgetProgress, BudgetStatus } from './budget';
import { localToday, monthRange } from './date';

export const budgetStatusPresentation: Record<BudgetStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  ON_TRACK: { label: 'On track', tone: 'success' },
  NEAR_LIMIT: { label: 'Near limit', tone: 'warning' },
  LIMIT_REACHED: { label: 'Limit reached', tone: 'warning' },
  OVER_BUDGET: { label: 'Over budget', tone: 'danger' },
};
export function budgetRouteMonth(value?: string): string | null {
  const month = value ?? localToday().slice(0, 7);
  try { monthRange(month); return month; } catch { return null; }
}
export function budgetProgressPresentation(progress: BudgetProgress) {
  if (!progress.configured) return null;
  const numerator = BigInt(progress.percentageUsed.numerator), denominator = BigInt(progress.percentageUsed.denominator);
  // Round text to one decimal, but floor the bounded visual fill so an exact
  // below-limit result never looks full merely because its label rounds up.
  const tenths = (numerator * BigInt(20) + denominator) / (denominator * BigInt(2));
  const percentText = `${tenths / BigInt(10)}.${tenths % BigInt(10)}%`;
  const fill = numerator >= denominator * BigInt(100) ? 100 : Number(numerator * BigInt(10) / denominator) / 10;
  return { ...budgetStatusPresentation[progress.status], percentText, fill };
}
