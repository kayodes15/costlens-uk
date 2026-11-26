import { compareHomeOwnership, type HomeOwnershipInput } from './mortgage';
import { calculatePropertyTax, type PropertyTaxInput } from './property-tax';
import { simulatedFields, unavailable } from './result';

type PurchaseInputs = Omit<HomeOwnershipInput, 'purchaseTax'> & {
  readonly tax: Omit<PropertyTaxInput, 'price'>;
};

export interface BuyNowVsWaitInput {
  readonly current: PurchaseInputs;
  readonly future: Omit<PurchaseInputs, 'price' | 'savings' | 'termMonths'>;
  readonly waitMonths: number | null;
  readonly monthlySavingsAfterRent: number | null;
  readonly monthlyRent: number | null;
  /** Decimal change over the entire waiting period. */
  readonly priceChange?: number;
}

function comparePurchase({ tax, ...purchase }: PurchaseInputs, taxPrice = purchase.price) {
  const taxResult = calculatePropertyTax({ ...tax, price: taxPrice });
  if (taxResult.value === null) return taxResult;
  const scenario = compareHomeOwnership({ ...purchase, purchaseTax: taxResult.value.amount });
  if (scenario.value === null) return scenario;
  return { value: { ...scenario.value, tax: taxResult.value } };
}

export function compareBuyNowVsWait({
  current, future, waitMonths, monthlySavingsAfterRent, monthlyRent, priceChange = 0,
}: BuyNowVsWaitInput) {
  if (waitMonths === null || !Number.isSafeInteger(waitMonths) || waitMonths <= 0) {
    return unavailable('Enter a positive whole number of waiting months.');
  }
  if (monthlySavingsAfterRent === null || !Number.isFinite(monthlySavingsAfterRent) || monthlySavingsAfterRent < 0) {
    return unavailable('Enter finite, non-negative monthly savings after rent.');
  }
  if (monthlyRent === null || !Number.isFinite(monthlyRent) || monthlyRent < 0) {
    return unavailable('Enter finite, non-negative monthly rent.');
  }
  if (!Number.isFinite(priceChange) || priceChange <= -1) {
    return unavailable('Enter a finite property price change greater than minus 100%.');
  }

  const { price, savings } = current;
  if (price === null || !Number.isFinite(price) || price <= 0 ||
      savings === null || !Number.isFinite(savings) || savings < 0) {
    return unavailable('Enter a positive current price and non-negative current savings.');
  }
  const now = comparePurchase(current);
  const projection = simulatedFields({
    price: price * (1 + priceChange),
    savings: savings + waitMonths * monthlySavingsAfterRent,
  });
  if (projection.value === null) return projection;
  const waitingContext = simulatedFields({ rentPaid: waitMonths * monthlyRent });
  if (waitingContext.value === null) return waitingContext;

  const projectedPrice = projection.value.price.value;
  const afterWaiting = comparePurchase({
    ...future,
    price: projectedPrice,
    savings: projection.value.savings.value,
    termMonths: current.termMonths,
  }, Math.round(projectedPrice * 100) / 100);
  const scenario = afterWaiting.value === null ? afterWaiting : {
    value: {
      ...afterWaiting.value,
      price: projection.value.price,
      savings: projection.value.savings,
    },
    kind: 'simulated' as const,
  };
  return {
    value: {
      now,
      afterWaiting: {
        ...projection.value,
        scenario,
      },
      waitingPeriodCashOutflowContext: waitingContext.value,
    },
  };
}
