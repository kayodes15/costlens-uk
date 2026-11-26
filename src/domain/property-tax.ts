import { residentialTaxRules, type TaxBand, type TaxJurisdiction } from './property-tax-rules';
import { unavailable, type Value } from './result';

type PurchaseCategory = 'standard' | 'eligible-first-time-buyer' | 'unsupported';

export interface PropertyTaxInput {
  readonly jurisdiction: TaxJurisdiction | null;
  readonly price: number | null;
  readonly effectiveDate: string | null;
  /** Use unsupported for any surcharge, special relief, complex purchase or unconfirmed category. */
  readonly category: PurchaseCategory | null;
  readonly manualTax?: Value<number, 'user'> | null;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function calculateMarginalTax(considerationPence: bigint, bands: readonly TaxBand[]): bigint {
  let weightedPence = 0n;
  for (const [index, [lowerPounds, rate]] of bands.entries()) {
    const lowerPence = BigInt(lowerPounds) * 100n;
    if (considerationPence <= lowerPence) break;
    const next = bands[index + 1];
    const upperPence = next === undefined ? considerationPence : BigInt(next[0]) * 100n;
    const sliceEnd = considerationPence < upperPence ? considerationPence : upperPence;
    weightedPence += (sliceEnd - lowerPence) * BigInt(rate);
  }
  return weightedPence;
}

export function calculatePropertyTax(input: PropertyTaxInput) {
  const { jurisdiction, price, effectiveDate, category, manualTax } = input;
  if (manualTax != null) {
    if (!Number.isFinite(manualTax.value) || manualTax.value < 0) {
      return unavailable('Enter a finite, non-negative manual property tax amount.');
    }
    return { value: { amount: manualTax, method: 'manual' as const } };
  }
  if (category !== 'standard' && category !== 'eligible-first-time-buyer') {
    return unavailable('Purchase category not supported, enter manually.');
  }
  if (jurisdiction === null || !Object.hasOwn(residentialTaxRules, jurisdiction)) {
    return unavailable('Select a supported tax jurisdiction or enter the tax manually.');
  }
  const rules = residentialTaxRules[jurisdiction];
  if (effectiveDate === null || !isCalendarDate(effectiveDate)) {
    return unavailable('Enter a valid transaction effective date or enter the tax manually.');
  }
  if (effectiveDate < rules.effectiveFrom) {
    return unavailable('Tax rules for that effective date are not supported, enter manually.');
  }
  const pricePence = Math.round((price ?? 0) * 100);
  if (price === null || pricePence <= 0 || !Number.isSafeInteger(pricePence) || pricePence / 100 !== price) {
    return unavailable('Enter a positive property price in pounds and pence within the supported numeric range.');
  }

  const relief = 'firstTimeBuyer' in rules ? rules.firstTimeBuyer : undefined;
  const limit = relief && 'maximumPrice' in relief ? relief.maximumPrice : undefined;
  const appliedRelief = category === 'eligible-first-time-buyer' && (limit === undefined || price <= limit)
    ? relief
    : undefined;
  const fullConsiderationPence = BigInt(pricePence);
  const considerationPence = rules.rounding === 'whole-pound-down'
    ? fullConsiderationPence
    : fullConsiderationPence / 100n * 100n;
  const weightedPence = calculateMarginalTax(considerationPence, appliedRelief?.bands ?? rules.standard);
  const tax = rules.rounding === 'whole-pound-down'
    ? Number(weightedPence / 1_000_000n)
    : Number(weightedPence / 10_000n) / 100;

  return {
    value: {
      amount: { value: tax, kind: 'calculated' as const, source: appliedRelief?.source ?? rules.source },
      method: 'automatic' as const,
      tax: rules.tax,
      effectiveFrom: rules.effectiveFrom,
      checkedOn: rules.checkedOn,
      rulesMayHaveChanged: effectiveDate > rules.checkedOn,
      firstTimeBuyerReliefApplied: appliedRelief !== undefined,
    },
  };
}
