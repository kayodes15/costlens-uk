import { calculatedFields, unavailable, type Value } from './result';

const expenseCategories = [
  'housing', 'localTaxes', 'groceries', 'energy', 'water', 'transport', 'childcare', 'debt', 'other',
] as const;

type Expense = Value<number, 'user' | 'estimate' | 'assumption'>;

export interface HouseholdBudget {
  readonly monthlyTakeHome: Value<number, 'user'> | null;
  readonly expenses: Readonly<Partial<Record<(typeof expenseCategories)[number], Expense | null>>>;
}

function summariseBudget(budget: HouseholdBudget, label: string) {
  const income = budget.monthlyTakeHome;
  if (income === null) return unavailable(`Enter ${label} monthly take-home income.`);
  if (!Number.isFinite(income.value) || income.value < 0) {
    return unavailable(`${label} income must be finite and non-negative.`);
  }

  let totalExpenditure = 0;
  for (const category of expenseCategories) {
    const expense = budget.expenses[category];
    if (expense == null) return unavailable(`Enter ${label} ${category} expenditure (use zero if none).`);
    if (!Number.isFinite(expense.value) || expense.value < 0) {
      return unavailable(`${label} ${category} expenditure must be finite and non-negative.`);
    }
    totalExpenditure += expense.value;
  }

  const totals = calculatedFields({ totalExpenditure, disposableIncome: income.value - totalExpenditure });
  if (totals.value === null) return totals;
  return { value: { ...totals.value, monthlyTakeHome: income, expenses: budget.expenses } };
}

function recoveryPeriod(improvement: number, movingCost: Value<number, 'user'> | null) {
  if (movingCost === null) return unavailable('Enter one-off moving costs to calculate recovery.');
  if (!Number.isFinite(movingCost.value) || movingCost.value < 0) {
    return unavailable('Moving costs must be finite and non-negative.');
  }
  if (improvement <= 0) {
    return unavailable('Moving costs are not recovered because monthly disposable income does not improve.');
  }
  const months = movingCost.value / improvement;
  if (!Number.isFinite(months)) return unavailable('The recovery period exceeds the supported numeric range.');
  return { value: months, kind: 'calculated' as const };
}

export function compareRelocation(
  current: HouseholdBudget,
  proposed: HouseholdBudget,
  movingCost: Value<number, 'user'> | null,
) {
  const before = summariseBudget(current, 'current');
  if (before.value === null) return before;
  const after = summariseBudget(proposed, 'proposed');
  if (after.value === null) return after;

  const monthlyDifference = after.value.disposableIncome.value - before.value.disposableIncome.value;
  const results = calculatedFields({
    monthlyDifference,
    annualDifference: monthlyDifference * 12,
    requiredTakeHome: after.value.totalExpenditure.value + before.value.disposableIncome.value,
  });
  if (results.value === null) return results;
  return {
    value: {
      ...results.value,
      current: before.value,
      proposed: after.value,
      movingCost: movingCost ?? unavailable('No moving cost entered.'),
      recoveryMonths: recoveryPeriod(monthlyDifference, movingCost),
    },
  };
}
