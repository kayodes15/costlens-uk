import { describe, expect, it } from 'vitest';
import { comparePay, requiredPayHistory, type Pay } from '../../src/domain/salary';
import type { InflationInput } from '../../src/domain/inflation';

const published = (value: number) => ({ value, kind: 'published' as const });
const pay: Pay = { amount: { value: 1_000, kind: 'user' }, basis: 'gross', period: 'monthly' };
const dates: InflationInput = {
  startMonth: '2025-12', endMonth: '2026-03',
  observations: {
    CPIH: {
      '2026-02': published(105), '2025-12': published(100),
      '2026-01': published(102), '2026-03': published(106),
    },
    CPI: {
      '2025-12': published(100), '2026-01': published(98),
      '2026-02': published(99), '2026-03': published(101),
    },
  },
};

function history(input: InflationInput) {
  const comparison = comparePay(pay, pay, input);
  if (comparison.value === null) throw new Error(comparison.reason);
  return requiredPayHistory(pay, input, comparison.value);
}

describe('§9 historical maintenance pay', () => {
  // An index starting at 100 translates each point into £10 of maintenance pay.
  it('orders months across a year boundary and maintains the pay basis', () => {
    expect(history(dates)).toEqual([
      { month: '2025-12', requiredPay: 1_000 }, { month: '2026-01', requiredPay: 1_020 },
      { month: '2026-02', requiredPay: 1_050 }, { month: '2026-03', requiredPay: 1_060 },
    ]);
  });

  it('keeps both absent and explicitly missing interior months as null', () => {
    expect(history({
      ...dates, observations: { CPIH: { '2025-12': published(100), '2026-01': null, '2026-03': published(106) } },
    })).toEqual([
      { month: '2025-12', requiredPay: 1_000 }, { month: '2026-01', requiredPay: null },
      { month: '2026-02', requiredPay: null }, { month: '2026-03', requiredPay: 1_060 },
    ]);
  });

  it('stops at the latest observed month when the requested end is later', () => {
    const rows = history({ ...dates, endMonth: '2026-05' });
    expect(rows).toHaveLength(4);
    expect(rows.at(-1)).toEqual({ month: '2026-03', requiredPay: 1_060 });
  });

  it('uses CPI when selected, including deflation', () => {
    expect(history({ ...dates, index: 'CPI' }).map(({ requiredPay }) => requiredPay))
      .toEqual([1_000, 980, 990, 1_010]);
  });
});
