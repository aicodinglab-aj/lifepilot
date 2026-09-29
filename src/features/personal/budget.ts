import { integerMoney } from './money';

export type OverallBudget = { kind: 'overall'; month: string; amountPaise: number; createdAt: string; updatedAt: string };
export type CategoryBudget = { kind: 'category'; month: string; categoryId: string; amountPaise: number; createdAt: string; updatedAt: string };
export type BudgetStatus = 'ON_TRACK' | 'NEAR_LIMIT' | 'LIMIT_REACHED' | 'OVER_BUDGET';
export const NEAR_LIMIT_PERCENT = 80;
export type BudgetProgress = { spentPaise: string; transactionCount: string } & (
  { configured: false; limitPaise: null; remainingPaise: null; overByPaise: null; percentageUsed: null; status: null }
  | { configured: true; limitPaise: string; remainingPaise: string; overByPaise: string;
      percentageUsed: { numerator: string; denominator: string }; status: BudgetStatus }
);
export type CategoryBudgetProgress = { categoryId: string; categoryName: string; budget: CategoryBudget | null; progress: BudgetProgress };
export type MonthlyBudgetSummary = { month: string; overallBudget: OverallBudget | null; overall: BudgetProgress; categories: CategoryBudgetProgress[] };

export function calculateBudgetProgress(limit: number | null, spent: string, count: string): BudgetProgress {
  const amount = BigInt(integerMoney(spent)), transactions = BigInt(integerMoney(count));
  if (amount < BigInt(0) || transactions < BigInt(0)) throw new Error('Invalid budget spending.');
  const common = { spentPaise: amount.toString(), transactionCount: transactions.toString() };
  if (limit === null) return { ...common, configured: false, limitPaise: null, remainingPaise: null, overByPaise: null, percentageUsed: null, status: null };
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('Invalid budget limit.');
  const budget = BigInt(limit);
  const status: BudgetStatus = amount > budget ? 'OVER_BUDGET' : amount === budget ? 'LIMIT_REACHED'
    : amount * BigInt(100) >= budget * BigInt(NEAR_LIMIT_PERCENT) ? 'NEAR_LIMIT' : 'ON_TRACK';
  return { ...common, configured: true, limitPaise: budget.toString(),
    remainingPaise: (amount < budget ? budget - amount : BigInt(0)).toString(),
    overByPaise: (amount > budget ? amount - budget : BigInt(0)).toString(),
    percentageUsed: { numerator: (amount * BigInt(100)).toString(), denominator: budget.toString() }, status };
}
