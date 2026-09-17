import { parseMoney } from './money';
import { validDate } from './date';

export type TransactionType = 'expense' | 'income';
export const PAYMENT_METHODS = ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Other'] as const;
export type Category = { id: string; name: string; type: TransactionType; isSystem: number };
export type Transaction = {
  id: number; type: TransactionType; amount: number; categoryId: string; categoryName: string;
  transactionDate: string; description: string | null; paymentMethod: string | null; notes: string | null;
  createdAt: string; updatedAt: string;
};
export type TransactionInput = {
  type: string; amount: string; categoryId: string; transactionDate: string;
  description: string; paymentMethod: string; notes: string;
};
export function validateTransaction(input: TransactionInput, categories: Category[]) {
  if (input.type !== 'expense' && input.type !== 'income') throw new Error('Select Expense or Income.');
  const amount = parseMoney(input.amount);
  if (!categories.some((category) => category.id === input.categoryId && category.type === input.type)) {
    throw new Error('Select a category for this transaction type.');
  }
  if (!validDate(input.transactionDate)) throw new Error('Enter a valid date as YYYY-MM-DD.');
  const description = input.description.trim(), notes = input.notes.trim();
  if (description.length > 200) throw new Error('Description must be 200 characters or fewer.');
  if (notes.length > 2000) throw new Error('Notes must be 2,000 characters or fewer.');
  if (input.paymentMethod && !PAYMENT_METHODS.some((method) => method === input.paymentMethod)) throw new Error('Select a valid payment method.');
  return { ...input, type: input.type, amount, description: description || null, notes: notes || null, paymentMethod: input.paymentMethod || null };
}
