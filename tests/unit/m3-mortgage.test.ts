import { describe, expect, it } from 'vitest';
import { amortiseMortgage, compareHomeOwnership, type HomeOwnershipInput } from '../../src/domain/mortgage';
import type { Result } from '../../src/domain/result';

function result<T>(outcome: Result<T>): T {
  if ('reason' in outcome) throw new Error(outcome.reason);
  return outcome.value;
}

const budget: HomeOwnershipInput = {
  price: 100_000, deposit: 20_000, savings: 25_000, purchaseTax: { value: 0, kind: 'calculated' },
  upfrontFees: 3_000, monthlyTakeHome: 1_600, monthlyOwnershipCosts: 250,
  monthlyNonHousingCosts: 900, monthlyDebtPayments: 100, annualRate: 0, termMonths: 200,
};

describe('§§11–12 mortgage amortisation and cash flow', () => {
  it('16: computes deposit, LTV and a full zero-interest schedule', () => {
    const home = result(compareHomeOwnership({ ...budget, price: 120_000, deposit: 24_000, termMonths: 240 }));
    expect(home.principal.value).toBe(96_000);
    expect(home.depositPercent.value).toBe(20);
    expect(home.loanToValuePercent.value).toBe(80);
    expect(home.mortgage.monthlyPayment.value).toBe(400);
    expect(home.mortgage.totalInterest.value).toBe(0);
    expect(home.mortgage.schedule).toHaveLength(240);
  });

  it('17: reconciles the two-month interest-bearing fixture', () => {
    const mortgage = result(amortiseMortgage({ principal: 1_200, annualRate: 0.12, termMonths: 2 }));
    expect(mortgage.monthlyPayment.value).toBeCloseTo(609.014925373, 8);
    expect(mortgage.schedule[0].interest.value).toBe(12);
    expect(mortgage.schedule[0].principalPaid.value).toBeCloseTo(597.014925373, 8);
    expect(mortgage.schedule[1].principalPaid.value).toBeCloseTo(602.985074627, 8);
    expect(mortgage.totalInterest.value).toBeCloseTo(18.029850746, 8);
  });

  it('18: clears the residual without feeding penny rounding back into the balance', () => {
    const mortgage = result(amortiseMortgage({ principal: 100, annualRate: 0, termMonths: 3 }));
    expect(mortgage.schedule.map((row) => row.payment.value.toFixed(2))).toEqual(['33.33', '33.33', '33.33']);
    expect(mortgage.schedule.at(-1)?.closingBalance.value).toBe(0);
    expect(mortgage.schedule.reduce((sum, row) => sum + row.principalPaid.value, 0)).toBe(100);
    expect(mortgage.totalInterest.value).toBe(0);
  });

  it('19: exposes funding and monthly shortfalls and withholds emergency coverage', () => {
    const home = result(compareHomeOwnership({ ...budget, savings: 21_000 }));
    expect(home.upfrontCosts.value).toBe(23_000);
    expect(home.savingsRemaining.value).toBe(-2_000);
    expect(home.monthlyDisposable.value).toBe(-50);
    expect(home.emergencyMonths).toMatchObject({ value: null, reason: expect.any(String) });
  });

  it('20: measures £2,000 in savings against £1,250 in outgoings', () => {
    const home = result(compareHomeOwnership({ ...budget, monthlyNonHousingCosts: 500 }));
    expect(home.savingsRemaining.value).toBe(2_000);
    expect(home.monthlyOutgoings.value).toBe(1_250);
    expect(home.emergencyMonths.value).toBe(1.6);
  });

  it('21: refuses excess deposit and supports an outright purchase', () => {
    expect(compareHomeOwnership({ ...budget, deposit: 100_001 }).value).toBeNull();
    const home = result(compareHomeOwnership({ ...budget, deposit: 100_000 }));
    expect(home.mortgage.monthlyPayment.value).toBe(0);
    expect(home.mortgage.totalInterest.value).toBe(0);
    expect(home.mortgage.schedule).toEqual([]);
  });

  it.each([null, 0, -1, 0.5, Infinity, 1_201])('22: refuses invalid term %s', (termMonths) => {
    expect(amortiseMortgage({ principal: 100, annualRate: 0, termMonths }).value).toBeNull();
  });

  it.each([[0, 1_200], [0.12, 1_212], [0.24, 1_224]])('23: recalculates at rate %s', (annualRate, payment) => {
    const mortgage = result(amortiseMortgage({ principal: 1_200, annualRate, termMonths: 1 }));
    expect(mortgage.finalPayment.value).toBe(payment);
  });

  it.each([0, 1e-12, 0.05125, 0.12])('reconciles every row for a 360-month mortgage at %s', (annualRate) => {
    const principal = 287_654.32;
    const mortgage = result(amortiseMortgage({ principal, annualRate, termMonths: 360 }));
    expect(mortgage.schedule).toHaveLength(360);
    expect(mortgage.schedule.reduce((sum, row) => sum + row.principalPaid.value, 0)).toBe(principal);
    expect(mortgage.principalRepaid.value).toBe(principal);
    expect(mortgage.schedule.at(-1)?.closingBalance.value).toBe(0);
    expect(mortgage.schedule.reduce((sum, row) => sum + row.payment.value, 0)).toBe(mortgage.totalPaid.value);
    expect(mortgage.totalInterest.value).toBe(mortgage.totalPaid.value - principal);
    expect(mortgage.schedule.reduce((sum, row) => sum + row.interest.value, 0)).toBeCloseTo(mortgage.totalInterest.value, 7);
  });

  it('refuses missing or invalid principal, rate and cash-flow inputs', () => {
    for (const principal of [null, -1, NaN, Infinity]) {
      expect(amortiseMortgage({ principal, annualRate: 0, termMonths: 12 }).value).toBeNull();
    }
    for (const annualRate of [null, -0.01, NaN, Infinity]) {
      expect(amortiseMortgage({ principal: 10, annualRate, termMonths: 12 }).value).toBeNull();
    }
    expect(compareHomeOwnership({ ...budget, purchaseTax: null }).value).toBeNull();
    expect(compareHomeOwnership({ ...budget, monthlyNonHousingCosts: -1 }).value).toBeNull();
  });
});
