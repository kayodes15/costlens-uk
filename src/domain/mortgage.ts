import { calculatedFields, unavailable, type Value } from './result';

export interface MortgageInput {
  readonly principal: number | null;
  /** Nominal annual decimal rate, e.g. 0.05 for 5%. */
  readonly annualRate: number | null;
  readonly termMonths: number | null;
}

/** A technical ceiling on the number of rows generated for one scenario. */
const maxTermMonths = 1_200;

export function amortiseMortgage({ principal, annualRate, termMonths }: MortgageInput) {
  if (principal === null || !Number.isFinite(principal) || principal < 0) {
    return unavailable('Enter a finite, non-negative mortgage principal.');
  }
  if (annualRate === null || !Number.isFinite(annualRate) || annualRate < 0) {
    return unavailable('Enter a finite, non-negative annual mortgage rate.');
  }
  if (termMonths === null || !Number.isInteger(termMonths) || termMonths < 1 || termMonths > maxTermMonths) {
    return unavailable(`Enter a mortgage term of 1 to ${maxTermMonths} whole months.`);
  }

  const monthlyRate = annualRate / 12;
  const nominalPayment = monthlyRate === 0
    ? principal / termMonths
    : principal * (monthlyRate / -Math.expm1(-termMonths * Math.log1p(monthlyRate)));
  if (!Number.isFinite(nominalPayment) || (principal > 0 && nominalPayment <= principal * monthlyRate)) {
    return unavailable('The mortgage cannot be amortised within the supported numeric range.');
  }

  const schedule = [];
  let principalRepaid = 0;
  let totalPaid = 0;
  for (let month = 1; month <= termMonths && principalRepaid < principal; month++) {
    const openingBalance = principal - principalRepaid;
    const interest = openingBalance * monthlyRate;
    const principalPaid = month === termMonths
      ? openingBalance
      : Math.min(nominalPayment - interest, openingBalance);
    principalRepaid += principalPaid;
    const payment = principalPaid + interest;
    totalPaid += payment;
    const row = calculatedFields({
      openingBalance,
      payment,
      interest,
      principalPaid,
      closingBalance: month === termMonths ? 0 : principal - principalRepaid,
    });
    if (row.value === null) return row;
    schedule.push({ month, ...row.value });
  }

  const totals = calculatedFields({
    monthlyPayment: nominalPayment,
    finalPayment: schedule.at(-1)?.payment.value ?? 0,
    principalRepaid,
    totalPaid,
    totalInterest: totalPaid - principal,
  });
  if (totals.value === null) return totals;
  return { value: { ...totals.value, schedule } };
}

export interface HomeOwnershipInput {
  readonly price: number | null;
  readonly deposit: number | null;
  readonly savings: number | null;
  readonly purchaseTax: Value<number, 'calculated' | 'user'> | null;
  readonly upfrontFees: number | null;
  readonly monthlyTakeHome: number | null;
  readonly monthlyOwnershipCosts: number | null;
  readonly monthlyNonHousingCosts: number | null;
  readonly monthlyDebtPayments: number | null;
  readonly annualRate: number | null;
  readonly termMonths: number | null;
}

export function compareHomeOwnership(input: HomeOwnershipInput) {
  const {
    price, deposit, savings, purchaseTax, upfrontFees, monthlyTakeHome, monthlyOwnershipCosts,
    monthlyNonHousingCosts, monthlyDebtPayments, annualRate, termMonths,
  } = input;
  if (price === null || !Number.isFinite(price) || price <= 0) return unavailable('Enter a positive property price.');
  if (deposit === null || !Number.isFinite(deposit) || deposit < 0 || deposit > price) {
    return unavailable('Enter a deposit between zero and the property price.');
  }
  if (savings === null || purchaseTax === null || upfrontFees === null || monthlyTakeHome === null ||
      monthlyOwnershipCosts === null || monthlyNonHousingCosts === null || monthlyDebtPayments === null) {
    return unavailable('Complete the budget inputs, including purchase tax.');
  }
  const budgetAmounts = {
    savings, purchaseTax: purchaseTax.value, upfrontFees, monthlyTakeHome,
    monthlyOwnershipCosts, monthlyNonHousingCosts, monthlyDebtPayments,
  };
  for (const [field, value] of Object.entries(budgetAmounts)) {
    if (!Number.isFinite(value) || value < 0) {
      return unavailable(`Enter a finite, non-negative value for ${field}.`);
    }
  }

  const principal = price - deposit;
  const mortgage = amortiseMortgage({ principal, annualRate, termMonths });
  if (mortgage.value === null) return mortgage;
  const upfrontCosts = purchaseTax.value + upfrontFees + deposit;
  const savingsRemaining = savings - upfrontCosts;
  const monthlyOutgoings = mortgage.value.monthlyPayment.value + monthlyOwnershipCosts +
    monthlyNonHousingCosts + monthlyDebtPayments;

  const totals = calculatedFields({
    principal, depositPercent: deposit / price * 100, loanToValuePercent: principal / price * 100,
    upfrontCosts, savingsRemaining, monthlyOutgoings, monthlyDisposable: monthlyTakeHome - monthlyOutgoings,
  });
  if (totals.value === null) return totals;

  const coverage = savingsRemaining >= 0 && monthlyOutgoings > 0
    ? calculatedFields({ months: savingsRemaining / monthlyOutgoings })
    : unavailable('Emergency coverage requires non-negative remaining savings and positive monthly outgoings.');

  return {
    value: {
      ...totals.value,
      price: { value: price, kind: 'user' as const },
      savings: { value: savings, kind: 'user' as const },
      deposit: { value: deposit, kind: 'user' as const },
      purchaseTax,
      mortgage: mortgage.value,
      emergencyMonths: coverage.value === null ? coverage : coverage.value.months,
    },
  };
}

/** Preserve the order and provenance of user-selected sensitivity rates. */
export function compareHomeOwnershipRates(
  input: Omit<HomeOwnershipInput, 'annualRate'>,
  rates: readonly Value<number, 'user'>[],
) {
  return rates.map((rate) => {
    const result = compareHomeOwnership({ ...input, annualRate: rate.value });
    return {
      rate,
      scenario: result.value === null ? result : { value: result.value, kind: 'simulated' as const },
    };
  });
}
