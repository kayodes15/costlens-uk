import { describe, expect, it } from 'vitest';
import { calculatePropertyTax, type PropertyTaxInput } from '../../src/domain/property-tax';
import type { TaxJurisdiction } from '../../src/domain/property-tax-rules';

const effectiveDate = '2026-11-26';
const standard = 'standard';
const firstTime = 'eligible-first-time-buyer';
type Category = typeof standard | typeof firstTime;

function automatic(jurisdiction: TaxJurisdiction, price: number, category: Category = standard) {
  const result = calculatePropertyTax({ jurisdiction, price, category, effectiveDate });
  if ('reason' in result) throw new Error(result.reason);
  if (result.value.method !== 'automatic') throw new Error('Expected an automatic calculation');
  return result.value;
}

// Source dates, independent working and expected amounts are in docs/TEST-CASES.md §15.
describe('§15 published examples and independently worked purchase tax fixtures', () => {
  const sdltJurisdictions = ['England', 'Northern Ireland'] as const;
  describe.each(sdltJurisdictions)('%s SDLT', (jurisdiction) => {
    it.each([
      [295_000, standard, 4_750],
      [500_000, firstTime, 10_000],
      [500_001, firstTime, 15_000],
    ] as const)('matches HMRC on £%s (%s)', (price, category, expected) => {
      expect(automatic(jurisdiction, price, category).amount.value).toBe(expected);
    });

    it.each([
      [125_000, standard, 0, 0, 0],
      [250_000, standard, 2_499, 2_500, 2_500],
      [925_000, standard, 36_249, 36_250, 36_250],
      [1_500_000, standard, 93_749, 93_750, 93_750],
      [300_000, firstTime, 0, 0, 0],
      [500_000, firstTime, 9_999, 10_000, 15_000],
    ] as const)('checks £1 either side of £%s (%s)', (edge, category, below, at, above) => {
      expect(automatic(jurisdiction, edge - 1, category).amount.value).toBe(below);
      expect(automatic(jurisdiction, edge, category).amount.value).toBe(at);
      expect(automatic(jurisdiction, edge + 1, category).amount.value).toBe(above);
    });
  });

  it.each([
    ['England', 124_999, standard, 0],
    ['England', 250_100, standard, 2_505],
    ['Northern Ireland', 400_000, firstTime, 5_000],
    ['Scotland', 144_999, standard, 0],
    ['Scotland', 300_000, standard, 4_600],
    ['Scotland', 200_000, firstTime, 500],
    ['Wales', 224_999, standard, 0],
    ['Wales', 500_000, standard, 18_000],
    ['Wales', 250_000, firstTime, 1_500],
  ] as const)('reproduces cases 35–43: %s £%s (%s)', (jurisdiction, price, category, expected) => {
    expect(automatic(jurisdiction, price, category).amount.value).toBe(expected);
  });

  it.each([[135_000, 0], [235_000, 1_800], [875_000, 63_350]])(
    'matches Revenue Scotland on £%s', (price, expected) => {
      expect(automatic('Scotland', price).amount.value).toBe(expected);
    },
  );

  it.each([
    [145_000, standard, 0, 0, 0],
    [250_000, standard, 2_099, 2_100, 2_100],
    [325_000, standard, 5_849, 5_850, 5_850],
    [750_000, standard, 48_349, 48_350, 48_350],
    [175_000, firstTime, 0, 0, 0],
    [250_000, firstTime, 1_499, 1_500, 1_500],
    [325_000, firstTime, 5_249, 5_250, 5_250],
    [750_000, firstTime, 47_749, 47_750, 47_750],
  ] as const)('checks Scotland £1 either side of £%s (%s)', (edge, category, below, at, above) => {
    expect(automatic('Scotland', edge - 1, category).amount.value).toBe(below);
    expect(automatic('Scotland', edge, category).amount.value).toBe(at);
    expect(automatic('Scotland', edge + 1, category).amount.value).toBe(above);
  });

  it.each([[120_000, 0], [350_000, 7_500], [1_700_000, 135_750]])(
    'matches WRA examples for first homes at £%s', (price, expected) => {
      const tax = automatic('Wales', price, firstTime);
      expect(tax.amount.value).toBe(expected);
      expect(tax.firstTimeBuyerReliefApplied).toBe(false);
    },
  );

  it.each([
    [225_000, 0, 0, 0.06],
    [400_000, 10_499.94, 10_500, 10_500.07],
    [750_000, 36_749.92, 36_750, 36_750.10],
    [1_500_000, 111_749.90, 111_750, 111_750.12],
  ])('checks Wales £1 either side of £%s', (edge, below, at, above) => {
    expect(automatic('Wales', edge - 1).amount.value).toBe(below);
    expect(automatic('Wales', edge).amount.value).toBe(at);
    expect(automatic('Wales', edge + 1).amount.value).toBe(above);
  });

  it('applies jurisdiction-specific precision and the exact SDLT relief ceiling', () => {
    expect(automatic('England', 500_000.01, firstTime).amount.value).toBe(15_000);
    expect(automatic('England', 500_000, firstTime).firstTimeBuyerReliefApplied).toBe(true);
    expect(automatic('Scotland', 145_049.99).amount.value).toBe(0);
    expect(automatic('Scotland', 145_050).amount.value).toBe(1);
    expect(automatic('Wales', 400_001.99).amount.value).toBe(10_500.07);
  });

  it('44: unsupported categories require manual entry and explicit zero wins', () => {
    const unsupported = { jurisdiction: null, category: 'unsupported', price: null, effectiveDate: null } as const;
    expect(calculatePropertyTax(unsupported))
      .toMatchObject({ value: null, reason: expect.stringContaining('not supported, enter manually') });
    expect(calculatePropertyTax({ ...unsupported, manualTax: { value: 0, kind: 'user' } }))
      .toEqual({ value: { amount: { value: 0, kind: 'user' }, method: 'manual' } });
    expect(calculatePropertyTax({ ...unsupported, manualTax: { value: -1, kind: 'user' } }).value).toBeNull();
  });

  it('checks effective dates, exposes provenance and rejects invalid prices', () => {
    const input: PropertyTaxInput = { jurisdiction: 'England', price: 295_000, category: standard, effectiveDate };
    for (const date of ['2025-03-31', '2026-02-30', '2026-2-01', null]) {
      expect(calculatePropertyTax({ ...input, effectiveDate: date }).value).toBeNull();
    }
    for (const price of [null, -1, 0, NaN, Infinity, 295_000.001]) {
      expect(calculatePropertyTax({ ...input, price }).value).toBeNull();
    }
    expect(calculatePropertyTax({ ...input, effectiveDate: '2025-04-01' }).value).toMatchObject({
      effectiveFrom: '2025-04-01', checkedOn: '2026-11-26',
      amount: { value: 4_750, kind: 'calculated', source: expect.stringContaining('gov.uk') },
    });
  });
});
