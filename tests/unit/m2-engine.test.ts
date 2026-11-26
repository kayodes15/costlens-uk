import { describe, expect, it } from 'vitest';
import { compareInflation, type InflationInput } from '../../src/domain/inflation';
import { comparePay, targetPay, type Pay } from '../../src/domain/salary';
import { compareRelocation, type HouseholdBudget } from '../../src/domain/relocation';
import type { Result } from '../../src/domain/result';

const user = (value: number) => ({ value, kind: 'user' as const });
const published = (value: number) => ({ value, kind: 'published' as const, source: 'Fictional fixture' });

function result<T>(outcome: Result<T>): T {
  if ('reason' in outcome) throw new Error(outcome.reason);
  return outcome.value;
}

function pay(amount: number, period: Pay['period'] = 'annual', basis: Pay['basis'] = 'gross'): Pay {
  return { amount: user(amount), period, basis };
}

function dates(start: number, end: number): InflationInput {
  return {
    startMonth: '2025-01', endMonth: '2025-02',
    observations: { CPIH: { '2025-01': published(start), '2025-02': published(end) } },
  };
}

function budget(income: number, housing: number, other: number): HouseholdBudget {
  return {
    monthlyTakeHome: user(income),
    expenses: {
      housing: user(housing), other: user(other), localTaxes: user(0), groceries: user(0),
      energy: user(0), water: user(0), transport: user(0), childcare: user(0), debt: user(0),
    },
  };
}

describe('§9 inflation, purchasing power and pay targets', () => {
  it('01: reproduces the £37,450 maintenance pay and −1.20% real change example', () => {
    const actual = result(comparePay(pay(35_000), pay(37_000), dates(100, 107)));
    expect(actual.requiredPay).toEqual({ value: 37_450, kind: 'calculated' });
    expect(actual.nominalChangePercent.value).toBeCloseTo(5.71, 2);
    expect(actual.realChangePercent.value).toBeCloseTo(-1.20, 2);
    expect(actual.annualGap.value).toBe(-450);
    expect(actual.monthlyGap.value).toBe(-37.50);
    expect(actual.inflation.inflationPercent.value).toBeCloseTo(7);
    expect(actual.inflation.inflationPercent.kind).toBe('calculated');
    expect(actual.inflation.start).toEqual(published(100));
    expect(actual.previous.amount).toEqual(user(35_000));
  });

  it('02: reproduces the £42,840 target and 7.1% raise example', () => {
    const actual = result(targetPay(pay(40_000), user(0.02), dates(100, 105)));
    expect(actual.requiredPay.value).toBe(42_000);
    expect(actual.targetPay).toEqual({ value: 42_840, kind: 'calculated' });
    expect(actual.increase.value).toBe(2_840);
    expect(actual.increasePercent.value).toBeCloseTo(7.1);
  });

  it('03: reflects zero inflation and annualises a monthly gap', () => {
    const actual = result(comparePay(pay(2_000, 'monthly'), pay(2_100, 'monthly'), dates(120, 120)));
    expect(actual.inflation.inflationPercent.value).toBe(0);
    expect(actual.nominalChangePercent.value).toBeCloseTo(5);
    expect(actual.realChangePercent.value).toBeCloseTo(5);
    expect(actual.monthlyGap.value).toBe(100);
    expect(actual.annualGap.value).toBe(1_200);
  });

  it('04: preserves purchasing power under deflation', () => {
    const actual = result(comparePay(pay(1_900), pay(1_900), dates(100, 95)));
    expect(actual.nominalChangePercent.value).toBe(0);
    expect(actual.requiredPay.value).toBe(1_805);
    expect(actual.realChangePercent.value).toBeCloseTo(5.26, 2);
  });

  it('05: takes the index ratio over successive years', () => {
    const actual = result(comparePay(pay(20_000), pay(20_000), {
      startMonth: '2023-01', endMonth: '2025-01',
      observations: { CPIH: { '2023-01': published(100), '2024-01': published(110), '2025-01': published(121) } },
    }));
    expect(actual.inflation.inflationPercent.value).toBeCloseTo(21);
    expect(actual.requiredPay.value).toBe(24_200);
  });

  it('06: compares gross and net separately and refuses a mixed basis', () => {
    const inflation = dates(100, 105);
    const gross = result(comparePay(pay(3_000, 'monthly'), pay(3_300, 'monthly'), inflation));
    const net = result(comparePay(pay(2_000, 'monthly', 'net'), pay(2_100, 'monthly', 'net'), inflation));
    expect(gross.requiredPay.value).toBe(3_150);
    expect(gross.realChangePercent.value).toBeCloseTo(4.76, 2);
    expect(net.requiredPay.value).toBe(2_100);
    expect(net.realChangePercent.value).toBe(0);
    expect(comparePay(pay(3_000, 'monthly'), pay(2_100, 'monthly', 'net'), inflation))
      .toMatchObject({ value: null, reason: expect.stringContaining('same gross or net') });
  });

  it('07: discloses the latest published reference month used in both tools', () => {
    const inflation = { ...dates(100, 102), endMonth: '2025-03' };
    const actual = result(comparePay(pay(2_000), pay(2_000), inflation));
    expect(actual.requiredPay.value).toBe(2_040);
    expect(actual.inflation).toMatchObject({
      endMonth: '2025-02', latestMonth: '2025-02', requestedEndMonth: '2025-03',
      disclosure: expect.stringContaining('Inflation after that month is excluded'),
    });
    const target = result(targetPay(pay(2_000, 'monthly', 'net'), user(0), inflation));
    expect(target.targetPay.value).toBe(2_040);
    expect(target.reference.basis).toBe('net');
    expect(target.inflation.endMonth).toBe('2025-02');
  });

  it('08: refuses when the adjusted end precedes the start', () => {
    expect(compareInflation({ ...dates(100, 102), startMonth: '2025-03', endMonth: '2025-04' }))
      .toMatchObject({ value: null, reason: expect.stringContaining('latest available comparison month') });
  });

  it('09: refuses an unpublished interior end month', () => {
    const input = {
      ...dates(100, 104),
      observations: { CPIH: { '2025-01': published(100), '2025-02': null, '2025-03': published(104) } },
    };
    expect(compareInflation(input)).toEqual({ value: null, reason: 'No CPIH observation for 2025-02.' });
  });

  it.each([0, -1, NaN, Infinity])('10: rejects invalid baseline pay %s', (amount) => {
    expect(comparePay(pay(amount), pay(2_000), dates(100, 100)).value).toBeNull();
    expect(targetPay(pay(amount), user(0), dates(100, 100)).value).toBeNull();
  });

  it.each([0, NaN, -2, Infinity])('11: rejects invalid index value %s at either endpoint', (value) => {
    expect(compareInflation(dates(value, 110)).value).toBeNull();
    expect(compareInflation(dates(100, value)).value).toBeNull();
  });

  it('uses the selected series and handles same-month comparisons', () => {
    const input = {
      ...dates(100, 120), index: 'CPI' as const, endMonth: '2025-01',
      observations: { ...dates(100, 120).observations, CPI: { '2025-01': published(111) } },
    };
    expect(result(compareInflation(input))).toMatchObject({
      index: 'CPI', factor: { value: 1 }, disclosure: null, start: published(111),
    });
    expect(compareInflation({ ...input, observations: {} }).value).toBeNull();
  });

  it('rejects malformed dates, reversed dates and mismatched pay periods', () => {
    const input = dates(100, 120);
    for (const endMonth of ['2025-13', '2025-1', '2024-12']) {
      expect(compareInflation({ ...input, endMonth }).value).toBeNull();
    }
    expect(comparePay(pay(2_000), pay(200, 'monthly'), input).value).toBeNull();
    expect(comparePay(pay(2_000), { ...pay(200), amount: null }, input).value).toBeNull();
  });

  it('rejects invalid target assumptions and numeric overflow', () => {
    for (const growth of [user(-1), user(Infinity), null]) {
      expect(targetPay(pay(2_000), growth, dates(100, 105)).value).toBeNull();
    }
    expect(targetPay(pay(Number.MAX_VALUE), user(1), dates(100, 105)).value).toBeNull();
  });
});

describe('§10 relocation', () => {
  it('12: reproduces the London and Glasgow comparison', () => {
    const actual = result(compareRelocation(budget(3_200, 1_650, 1_000), budget(2_800, 900, 950), user(1_000)));
    expect(actual.current.totalExpenditure.value).toBe(2_650);
    expect(actual.current.disposableIncome.value).toBe(550);
    expect(actual.proposed.totalExpenditure.value).toBe(1_850);
    expect(actual.proposed.disposableIncome.value).toBe(950);
    expect(actual.monthlyDifference).toEqual({ value: 400, kind: 'calculated' });
    expect(actual.annualDifference.value).toBe(4_800);
    expect(actual.requiredTakeHome.value).toBe(2_400);
    expect(actual.recoveryMonths).toEqual({ value: 2.5, kind: 'calculated' });
  });

  it('13: zero monthly improvement yields no recovery', () => {
    const actual = result(compareRelocation(budget(2_000, 1_700, 0), budget(1_900, 1_600, 0), user(100)));
    expect(actual.monthlyDifference.value).toBe(0);
    expect(actual.recoveryMonths).toMatchObject({ value: null, reason: expect.stringContaining('does not improve') });
  });

  it('14: negative proposed cash flow and improvement yield no recovery', () => {
    const actual = result(compareRelocation(budget(2_000, 1_500, 0), budget(1_600, 1_800, 0), user(300)));
    expect(actual.proposed.disposableIncome.value).toBe(-200);
    expect(actual.monthlyDifference.value).toBe(-700);
    expect(actual.annualDifference.value).toBe(-8_400);
    expect(actual.recoveryMonths.value).toBeNull();
  });

  it('15: distinguishes explicit zero, missing and invalid moving costs', () => {
    const current = budget(200, 0, 0);
    const proposed = budget(250, 0, 0);
    expect(result(compareRelocation(current, proposed, user(0))).recoveryMonths.value).toBe(0);
    expect(result(compareRelocation(current, proposed, null)).recoveryMonths)
      .toMatchObject({ value: null, reason: expect.stringContaining('Enter one-off') });
    expect(result(compareRelocation(current, proposed, user(-1))).recoveryMonths.value).toBeNull();
  });

  it('preserves estimated housing provenance and refuses a missing expense', () => {
    const current = budget(2_000, 1_500, 0);
    const proposed = budget(2_000, 1_000, 0);
    const estimate = { value: 1_000, kind: 'estimate' as const, source: 'Fictional fixture' };
    const actual = result(compareRelocation(current, { ...proposed, expenses: { ...proposed.expenses, housing: estimate } }, null));
    expect(actual.proposed.expenses.housing).toEqual(estimate);
    expect(compareRelocation(current, { ...proposed, expenses: { ...proposed.expenses, water: null } }, null))
      .toMatchObject({ value: null, reason: expect.stringContaining('water') });
    expect(compareRelocation(current, budget(Infinity, 0, 0), null).value).toBeNull();
    expect(compareRelocation(current, budget(2_000, -1, 0), null).value).toBeNull();
  });
});
