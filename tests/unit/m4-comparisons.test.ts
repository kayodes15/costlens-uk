import { describe, expect, it } from 'vitest';
import { compareBuyNowVsWait, type BuyNowVsWaitInput } from '../../src/domain/buy-now-vs-wait';
import { compareRentVsBuy, type RentVsBuyInput } from '../../src/domain/rent-vs-buy';
import { compareHomeOwnershipRates } from '../../src/domain/mortgage';
import { calculatePropertyTax } from '../../src/domain/property-tax';
import type { Result } from '../../src/domain/result';

function result<T>(outcome: Result<T>): T {
  if ('reason' in outcome) throw new Error(outcome.reason);
  return outcome.value;
}

const user = (value: number) => ({ value, kind: 'user' as const });
const tax = { jurisdiction: 'England', category: 'standard', effectiveDate: '2026-11-26' } as const;
const current = {
  price: 200_000, savings: 30_000, deposit: 20_000, annualRate: 0, termMonths: 240,
  upfrontFees: 2_000, tax: { ...tax, manualTax: user(0) }, monthlyTakeHome: 2_000,
  monthlyOwnershipCosts: 100, monthlyNonHousingCosts: 500, monthlyDebtPayments: 50,
};
const future = {
  deposit: 25_000, annualRate: 0, upfrontFees: 2_000, tax: { ...tax, manualTax: user(0) },
  monthlyTakeHome: 2_100, monthlyOwnershipCosts: 100, monthlyNonHousingCosts: 500, monthlyDebtPayments: 50,
};
const wait: BuyNowVsWaitInput = {
  current, future, waitMonths: 12, monthlySavingsAfterRent: 500, monthlyRent: 800, priceChange: 0.05,
};

describe('§13 Buy Now vs Wait', () => {
  it('24: compares purchase dates and shows rent separately without deducting it twice', () => {
    const comparison = result(compareBuyNowVsWait(wait));
    const after = result(comparison.afterWaiting.scenario);
    expect(result(comparison.now).price.value).toBe(200_000);
    expect(result(comparison.now).principal.value).toBe(180_000);
    expect(result(comparison.now).mortgage.monthlyPayment.value).toBe(750);
    expect(result(comparison.now).savingsRemaining.value).toBe(8_000);
    expect(result(comparison.now).monthlyDisposable.value).toBe(600);
    expect(after.price).toEqual({ value: 210_000, kind: 'simulated' });
    expect(after.savings.value).toBe(36_000);
    expect(after.principal.value).toBe(185_000);
    expect(after.mortgage.monthlyPayment.value).toBeCloseTo(770.83, 2);
    expect(after.savingsRemaining.value).toBe(9_000);
    expect(after.monthlyDisposable.value).toBeCloseTo(679.17, 2);
    expect(comparison.waitingPeriodCashOutflowContext.rentPaid.value).toBe(9_600);
  });

  it('25: defaults price growth to zero and accrues no return on savings', () => {
    const comparison = result(compareBuyNowVsWait({
      ...wait, current: { ...current, savings: 25_000 }, waitMonths: 6,
      monthlySavingsAfterRent: 0, monthlyRent: 1_000, priceChange: undefined,
    }));
    expect(comparison.afterWaiting.price.value).toBe(200_000);
    expect(comparison.afterWaiting.savings.value).toBe(25_000);
    expect(comparison.waitingPeriodCashOutflowContext.rentPaid.value).toBe(6_000);
  });

  it('calculates SDLT in each column when a 5% rise crosses £250,000', () => {
    const comparison = result(compareBuyNowVsWait({
      ...wait,
      current: { ...current, price: 240_000, tax },
      future: { ...future, tax: { ...tax, effectiveDate: '2027-11-26' } },
    }));
    const now = result(comparison.now);
    const after = result(comparison.afterWaiting.scenario);
    expect(now.purchaseTax.value).toBe(2_300);
    expect(now.upfrontCosts.value).toBe(24_300);
    expect(now.tax).toMatchObject({ rulesMayHaveChanged: false });
    expect(after.price.value).toBe(252_000);
    expect(after.purchaseTax.value).toBe(2_600);
    expect(after.upfrontCosts.value).toBe(29_600);
    expect(after.tax).toMatchObject({ rulesMayHaveChanged: true, checkedOn: '2026-11-26' });
  });

  it('preserves a tax refusal in one column and honours explicit manual zero in the other', () => {
    const unsupported = { ...tax, category: 'unsupported' as const };
    const comparison = result(compareBuyNowVsWait({
      ...wait,
      current: { ...current, tax: unsupported },
      future: { ...future, tax: { ...unsupported, manualTax: user(0) } },
    }));
    expect(comparison.now).toEqual({ value: null, reason: 'Purchase category not supported, enter manually.' });
    expect(result(comparison.afterWaiting.scenario).tax).toEqual({ amount: user(0), method: 'manual' });
  });

  it('rounds only the projected tax consideration to pence', () => {
    const comparison = result(compareBuyNowVsWait({
      ...wait, priceChange: 0.051234567,
      current: { ...current, price: 240_000, tax },
      future: { ...future, tax },
    }));
    const after = result(comparison.afterWaiting.scenario);
    expect(after.price.value).toBeCloseTo(252_296.29608, 7);
    expect(after.purchaseTax.value).toBe(2_614);
  });

  it('refuses invalid waiting inputs and preserves an available current scenario', () => {
    for (const changes of [{ waitMonths: 0 }, { monthlyRent: null }, { priceChange: -1 }, { monthlySavingsAfterRent: NaN }]) {
      expect(compareBuyNowVsWait({ ...wait, ...changes }).value).toBeNull();
    }
    const comparison = result(compareBuyNowVsWait({ ...wait, future: { ...future, annualRate: null } }));
    expect(result(comparison.now).principal.value).toBe(180_000);
    expect(comparison.afterWaiting.scenario).toMatchObject({ value: null, reason: expect.any(String) });
  });
});

const rent: RentVsBuyInput = {
  price: 1_200, deposit: 200, capital: 200, monthlyResources: 150, initialRent: 80,
  monthlyOwnershipCosts: 0, purchaseTax: user(0), buyingFees: 0, sellingFees: 0,
  annualMortgageRate: 0, mortgageTermMonths: 10, months: 2,
};

describe('§14 Rent vs Buy', () => {
  it('26: credits the cheaper renter and keeps debt when the horizon is shorter than the loan', () => {
    const outcome = result(compareRentVsBuy(rent));
    const terminal = result(outcome.terminal);
    expect(terminal.ownerSavings.value).toBe(100);
    expect(terminal.ownerPosition.value).toBe(500);
    expect(terminal.renterPosition.value).toBe(340);
    expect(terminal.difference.value).toBe(160);
    expect(terminal.principalPaid.value).toBe(200);
    expect(terminal.remainingMortgage.value).toBe(800);
    expect(terminal.ownerNonRecoverableCosts.value).toBe(0);
    expect(terminal.ownerCashOutflow.value).toBe(400);
  });

  it('27: credits the cheaper owner symmetrically', () => {
    const terminal = result(result(compareRentVsBuy({ ...rent, initialRent: 130 })).terminal);
    expect(terminal.ownerPosition.value).toBe(500);
    expect(terminal.renterPosition.value).toBe(240);
    expect(terminal.difference.value).toBe(260);
  });

  it('28: satisfies the equal resources identity when there are no non-recoverable costs or growth', () => {
    const terminal = result(result(compareRentVsBuy({ ...rent, initialRent: 0 })).terminal);
    expect(terminal.ownerPosition.value).toBe(500);
    expect(terminal.renterPosition.value).toBe(500);
    expect(terminal.difference.value).toBe(0);
  });

  it('29: flags the path, month and shortfall and withholds the comparison', () => {
    const outcome = result(compareRentVsBuy({ ...rent, monthlyResources: 90 }));
    expect(outcome.shortfalls[0]).toEqual({ month: 1, path: 'owner', amount: { value: 10, kind: 'simulated' } });
    expect(outcome.terminal).toMatchObject({ value: null, reason: expect.any(String) });
  });

  it('30: includes buying fees once and deducts selling costs at the end', () => {
    const terminal = result(result(compareRentVsBuy({
      ...rent, price: 1_000, deposit: 1_000, capital: 1_100, initialRent: 0, monthlyResources: 0,
      buyingFees: 100, sellingRate: 0.05, annualPropertyGrowth: 0.10, months: 12,
    })).terminal);
    expect(terminal.propertyValue.value).toBeCloseTo(1_100);
    expect(terminal.sellingCosts.value).toBeCloseTo(55);
    expect(terminal.ownerPosition.value).toBeCloseTo(1_045);
    expect(terminal.renterPosition.value).toBe(1_100);
    expect(terminal.difference.value).toBeCloseTo(-55);
    expect(terminal.ownerNonRecoverableCosts.value).toBeCloseTo(155);
  });

  it('31: credits return to opening balances before end-of-month contributions', () => {
    const terminal = result(result(compareRentVsBuy({
      ...rent, price: 900, deposit: 900, capital: 1_000, monthlyResources: 200,
      initialRent: 100, annualReturn: 1.01 ** 12 - 1,
    })).terminal);
    expect(terminal.ownerSavings.value).toBeCloseTo(504.01);
    expect(terminal.ownerPosition.value).toBeCloseTo(1_404.01);
    expect(terminal.renterPosition.value).toBeCloseTo(1_221.10);
    expect(terminal.difference.value).toBeCloseTo(182.91);
  });

  it('32: flags the upfront funding gap even with the default monthly budget', () => {
    const outcome = result(compareRentVsBuy({
      ...rent, capital: 500, deposit: 450, buyingFees: 60, monthlyResources: null,
    }));
    expect(outcome.shortfalls).toEqual([{ month: 0, path: 'owner', amount: { value: 10, kind: 'simulated' } }]);
    expect(outcome.terminal.value).toBeNull();
  });

  it('33: applies rent growth starting in month two', () => {
    const outcome = result(compareRentVsBuy({ ...rent, initialRent: 100, annualRentGrowth: 1.01 ** 12 - 1 }));
    expect(outcome.cashFlows.map((flow) => flow.rent.value)).toEqual([100, 101]);
    expect(result(outcome.terminal).renterPosition.value).toBe(299);
  });

  it('34: stops mortgage payments after maturity', () => {
    const outcome = result(compareRentVsBuy({
      ...rent, price: 800, mortgageTermMonths: 2, months: 3, monthlyResources: 350,
    }));
    const terminal = result(outcome.terminal);
    expect(outcome.cashFlows.map((flow) => flow.repayment.value)).toEqual([300, 300, 0]);
    expect(terminal.mortgagePayments.value).toBe(600);
    expect(terminal.remainingMortgage.value).toBe(0);
    expect(terminal.ownerSavings.value).toBe(450);
  });

  it('45: combines mortgage interest with a positive investment return', () => {
    const terminal = result(result(compareRentVsBuy({ ...rent, annualMortgageRate: 0.12, annualReturn: 1.005 ** 12 - 1 })).terminal);
    expect(terminal.ownerPosition.value).toBeCloseTo(481.177911, 5);
    expect(terminal.renterPosition.value).toBeCloseTo(342.355, 8);
    expect(terminal.difference.value).toBeCloseTo(138.82, 2);
    expect(terminal.mortgageInterest.value).toBeCloseTo(19.044179, 5);
  });

  it('46: defaults to the peak housing cost over the entire comparison', () => {
    const outcome = result(compareRentVsBuy({
      ...rent, initialRent: 100, monthlyResources: null, annualRentGrowth: 1.1 ** 12 - 1,
    }));
    const terminal = result(outcome.terminal);
    expect(outcome.monthlyResources.kind).toBe('assumption');
    expect(outcome.monthlyResources.value).toBeCloseTo(110);
    expect(outcome.shortfalls).toEqual([]);
    expect(terminal.renterPosition.value).toBeCloseTo(210);
    expect(terminal.ownerPosition.value).toBeCloseTo(420);
  });

  it('refuses missing values and invalid assumptions and treats an explicit zero budget as entered', () => {
    for (const changes of [{ initialRent: null }, { months: 0 }, { annualReturn: -1 }, { sellingRate: Infinity }, { deposit: 1_201 }]) {
      expect(compareRentVsBuy({ ...rent, ...changes }).value).toBeNull();
    }
    const outcome = result(compareRentVsBuy({ ...rent, monthlyResources: 0 }));
    expect(outcome.monthlyResources).toEqual(user(0));
    expect(outcome.shortfalls.map(({ path }) => path)).toEqual(['owner', 'renter', 'owner', 'renter']);
  });
});

describe('M3 recommendations carried into M4', () => {
  it('§15 flags automatic rules only for dates after the source check', () => {
    const input = { jurisdiction: 'England', price: 295_000, category: 'standard' } as const;
    for (const [effectiveDate, flag] of [['2026-11-25', false], ['2026-11-26', false], ['2026-11-27', true]] as const) {
      expect(calculatePropertyTax({ ...input, effectiveDate }).value).toMatchObject({ rulesMayHaveChanged: flag });
    }
    expect(calculatePropertyTax({ ...input, effectiveDate: '2026-11-27', manualTax: user(0) }).value)
      .toEqual({ amount: user(0), method: 'manual' });
  });

  it('§12 evaluates each rate independently and preserves order and invalid scenarios', () => {
    const rates = [user(0.12), user(-0.01), user(0), user(0.24)];
    const scenarios = compareHomeOwnershipRates({
      ...current, price: 1_400, deposit: 200, termMonths: 1, purchaseTax: user(0),
    }, rates);
    expect(scenarios.map(({ rate }) => rate)).toEqual(rates);
    expect(scenarios.map(({ scenario }) => scenario.value?.mortgage.finalPayment.value ?? null))
      .toEqual([1_212, null, 1_200, 1_224]);
    expect(scenarios[0].scenario).toMatchObject({ kind: 'simulated' });
  });
});
