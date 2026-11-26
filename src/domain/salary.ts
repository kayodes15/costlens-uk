import { compareInflation, type InflationInput } from './inflation';
import { calculatedFields, unavailable, type Value } from './result';

export interface Pay {
  readonly amount: Value<number, 'user'> | null;
  readonly basis: 'gross' | 'net';
  readonly period: 'annual' | 'monthly';
}

function payIssue(pay: Pay, label: string): string | null {
  if (pay.amount === null) return `Enter ${label} pay.`;
  if (!Number.isFinite(pay.amount.value) || pay.amount.value <= 0) {
    return `${label} pay must be finite and positive.`;
  }
  return null;
}

export function comparePay(previous: Pay, current: Pay, dates: InflationInput) {
  if (previous.basis !== current.basis || previous.period !== current.period) {
    return unavailable('Both pay amounts must use the same gross or net basis and pay period.');
  }
  const issue = payIssue(previous, 'previous') ?? payIssue(current, 'current');
  if (issue !== null || previous.amount === null || current.amount === null) {
    return unavailable(issue ?? 'Enter both pay amounts.');
  }
  const inflation = compareInflation(dates);
  if (inflation.value === null) return inflation;

  const baseline = previous.amount.value;
  const actual = current.amount.value;
  const requiredPay = baseline * inflation.value.factor.value;
  if (requiredPay === 0) return unavailable('Required pay is below the supported numeric range.');
  const gap = actual - requiredPay;
  const annual = previous.period === 'annual';
  const results = calculatedFields({
    nominalChangePercent: (actual / baseline - 1) * 100,
    realChangePercent: (actual / requiredPay - 1) * 100,
    requiredPay,
    annualGap: annual ? gap : gap * 12,
    monthlyGap: annual ? gap / 12 : gap,
  });
  if (results.value === null) return results;
  return { value: { ...results.value, previous, current, inflation: inflation.value } };
}

export function targetPay(reference: Pay, desiredRealGrowth: Value<number, 'user'> | null, dates: InflationInput) {
  const issue = payIssue(reference, 'reference');
  if (issue !== null || reference.amount === null) return unavailable(issue ?? 'Enter reference pay.');
  if (desiredRealGrowth === null) return unavailable('Enter the desired real pay change.');
  const growth = desiredRealGrowth.value;
  if (!Number.isFinite(growth) || growth <= -1) {
    return unavailable('The desired real pay change must be finite and greater than minus 100%.');
  }
  const inflation = compareInflation(dates);
  if (inflation.value === null) return inflation;

  const baseline = reference.amount.value;
  const requiredPay = baseline * inflation.value.factor.value;
  const target = requiredPay * (1 + growth);
  if (requiredPay === 0 || target === 0) return unavailable('Calculated pay is below the supported numeric range.');
  const results = calculatedFields({
    requiredPay,
    targetPay: target,
    increase: target - baseline,
    increasePercent: (target / baseline - 1) * 100,
  });
  if (results.value === null) return results;
  return { value: { ...results.value, reference, desiredRealGrowth, inflation: inflation.value } };
}

/** History for a successful comparison using the same published index and pay basis. */
export function requiredPayHistory(
  previous: Pay,
  dates: InflationInput,
  comparison: NonNullable<ReturnType<typeof comparePay>['value']>,
) {
  const { inflation } = comparison;
  const series = dates.observations[inflation.index];
  if (!series) return [];
  const toOffset = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
  const first = toOffset(inflation.startMonth);
  const count = toOffset(inflation.endMonth) - first + 1;
  return Array.from({ length: count }, (_, index) => {
    const offset = first + index;
    const year = String(Math.floor(offset / 12)).padStart(4, '0');
    const month = `${year}-${String(offset % 12 + 1).padStart(2, '0')}`;
    if (series[month] == null) return { month, requiredPay: null };
    const outcome = comparePay(previous, previous, { ...dates, index: inflation.index, endMonth: month });
    return { month, requiredPay: outcome.value?.requiredPay.value ?? null };
  });
}
