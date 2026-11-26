import { amortiseMortgage, type MortgageInput } from './mortgage';
import { simulatedFields, unavailable, type Value } from './result';

export interface RentVsBuyInput {
  readonly price: number | null;
  readonly deposit: number | null;
  readonly capital: number | null;
  /** Null selects the peak single-month cost across both paths. */
  readonly monthlyResources: number | null;
  readonly initialRent: number | null;
  readonly monthlyOwnershipCosts: number | null;
  readonly purchaseTax: Value<number, 'user' | 'calculated'> | null;
  readonly buyingFees: number | null;
  readonly sellingFees: number | null;
  readonly sellingRate?: number;
  readonly annualMortgageRate: MortgageInput['annualRate'];
  readonly mortgageTermMonths: MortgageInput['termMonths'];
  readonly months: number | null;
  readonly annualRentGrowth?: number;
  readonly annualPropertyGrowth?: number;
  readonly annualReturn?: number;
}

const maxComparisonMonths = 1_200;

export function compareRentVsBuy(input: RentVsBuyInput) {
  const {
    price, deposit, capital, monthlyResources, initialRent, monthlyOwnershipCosts,
    purchaseTax, buyingFees, sellingFees, sellingRate = 0, annualMortgageRate,
    mortgageTermMonths, months, annualRentGrowth = 0, annualPropertyGrowth = 0, annualReturn = 0,
  } = input;
  if (price === null || deposit === null || capital === null || initialRent === null ||
      monthlyOwnershipCosts === null || purchaseTax === null || buyingFees === null || sellingFees === null) {
    return unavailable('Complete the property, capital, rent and cost inputs.');
  }
  for (const [field, amount] of Object.entries({
    price, deposit, capital, initialRent, monthlyOwnershipCosts, purchaseTax: purchaseTax.value,
    buyingFees, sellingFees, sellingRate, monthlyResources: monthlyResources ?? 0,
  })) {
    if (!Number.isFinite(amount) || amount < 0) return unavailable(`Enter a finite, non-negative value for ${field}.`);
  }
  if (price <= 0 || deposit > price || sellingRate > 1) {
    return unavailable('Enter a positive price, a deposit at or below the price, and a selling rate up to 100%.');
  }
  if (months === null || !Number.isInteger(months) || months < 1 || months > maxComparisonMonths) {
    return unavailable(`Enter a comparison period of 1 to ${maxComparisonMonths} whole months.`);
  }
  for (const rate of [annualRentGrowth, annualPropertyGrowth, annualReturn]) {
    if (!Number.isFinite(rate) || rate <= -1) return unavailable('Growth and return assumptions must be finite and greater than minus 100%.');
  }
  const mortgage = amortiseMortgage({
    principal: price - deposit, annualRate: annualMortgageRate, termMonths: mortgageTermMonths,
  });
  if (mortgage.value === null) return mortgage;
  const upfrontCash = deposit + purchaseTax.value + buyingFees;
  if (!Number.isFinite(upfrontCash)) return unavailable('Upfront costs exceed the supported numeric range.');
  const schedule = mortgage.value.schedule;
  const cashFlows = [];
  let peakCost = 0;
  for (let index = 0; index < months; index++) {
    const rent = initialRent === 0 ? 0 : initialRent * (1 + annualRentGrowth) ** (index / 12);
    const repayment = schedule[index]?.payment.value ?? 0;
    const ownerCost = repayment + monthlyOwnershipCosts;
    const row = simulatedFields({ rent, repayment, ownerCost });
    if (row.value === null) return row;
    cashFlows.push({ month: index + 1, ...row.value });
    peakCost = Math.max(peakCost, rent, ownerCost);
  }

  const resources = monthlyResources ?? peakCost;
  const shortfalls: { month: number; path: 'owner' | 'renter'; amount: Value<number, 'simulated'> }[] = [];
  if (upfrontCash > capital) {
    shortfalls.push({ month: 0, path: 'owner', amount: { value: upfrontCash - capital, kind: 'simulated' } });
  }
  for (const row of cashFlows) {
    for (const [path, cost] of [['owner', row.ownerCost.value], ['renter', row.rent.value]] as const) {
      if (cost > resources) {
        shortfalls.push({ month: row.month, path, amount: { value: cost - resources, kind: 'simulated' } });
      }
    }
  }

  const overview = {
    monthlyResources: { value: resources, kind: monthlyResources === null ? 'assumption' as const : 'user' as const },
    ownerUpfrontCash: { value: upfrontCash, kind: 'calculated' as const },
    cashFlows,
    shortfalls,
  };
  if (shortfalls.length > 0) {
    return { value: { ...overview, terminal: unavailable('The initial capital or monthly resources are insufficient.') } };
  }

  const growth = (1 + annualReturn) ** (1 / 12);
  let ownerSavings = capital - upfrontCash;
  let renterSavings = capital;
  let cumulativeRent = 0;
  let mortgagePayments = 0;
  let mortgageInterest = 0;
  let principalPaid = 0;
  for (const row of cashFlows) {
    const loanRow = schedule[row.month - 1];
    ownerSavings = ownerSavings * growth + (resources - row.ownerCost.value);
    renterSavings = renterSavings * growth + (resources - row.rent.value);
    cumulativeRent += row.rent.value;
    mortgagePayments += row.repayment.value;
    mortgageInterest += loanRow?.interest.value ?? 0;
    principalPaid += loanRow?.principalPaid.value ?? 0;
  }

  const remainingMortgage = schedule[months - 1]?.closingBalance.value ?? 0;
  const propertyValue = price * (1 + annualPropertyGrowth) ** (months / 12);
  const sellingCosts = sellingFees + sellingRate * propertyValue;
  const equity = propertyValue - remainingMortgage;
  const ownershipCosts = months * monthlyOwnershipCosts;
  const ownerPosition = equity - sellingCosts + ownerSavings;
  const terminal = simulatedFields({
    cumulativeRent, mortgagePayments, mortgageInterest, principalPaid, remainingMortgage,
    propertyValue, sellingCosts, equity, ownershipCosts, ownerSavings, renterSavings,
    ownerCashOutflow: upfrontCash + mortgagePayments + ownershipCosts + sellingCosts,
    ownerNonRecoverableCosts: purchaseTax.value + buyingFees + mortgageInterest + ownershipCosts + sellingCosts,
    ownerPosition, renterPosition: renterSavings, difference: ownerPosition - renterSavings,
  });
  return { value: { ...overview, terminal } };
}
