export type TaxBand = readonly [lowerBoundPounds: number, rateBasisPoints: number];

interface TaxRules {
  readonly tax: 'SDLT' | 'LBTT' | 'LTT';
  readonly effectiveFrom: string;
  readonly checkedOn: string;
  readonly source: string;
  readonly roundingSource: string;
  readonly rounding: 'whole-pound-down' | 'penny-down-whole-pound-consideration';
  readonly standard: readonly TaxBand[];
  readonly firstTimeBuyer?: {
    readonly source: string;
    readonly maximumPrice?: number;
    readonly bands: readonly TaxBand[];
  };
}

const sdlt: TaxRules = {
  tax: 'SDLT',
  effectiveFrom: '2025-04-01',
  checkedOn: '2026-11-26',
  source: 'https://www.gov.uk/stamp-duty-land-tax/residential-property-rates',
  roundingSource: 'https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm00050',
  rounding: 'whole-pound-down',
  standard: [[0, 0], [125_000, 200], [250_000, 500], [925_000, 1_000], [1_500_000, 1_200]],
  firstTimeBuyer: {
    source: 'https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm29805',
    maximumPrice: 500_000,
    bands: [[0, 0], [300_000, 500]],
  },
};

export const residentialTaxRules = {
  England: sdlt,
  'Northern Ireland': sdlt,
  Scotland: {
    tax: 'LBTT',
    effectiveFrom: '2021-04-01',
    checkedOn: '2026-11-26',
    source: 'https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property',
    roundingSource: 'https://revenue.scot/sites/default/files/LBTT%20Paper%20Return%20Form_0.pdf',
    rounding: 'whole-pound-down',
    standard: [[0, 0], [145_000, 200], [250_000, 500], [325_000, 1_000], [750_000, 1_200]],
    firstTimeBuyer: {
      source: 'https://revenue.scot/taxes/land-buildings-transaction-tax/lbtt-legislation-guidance/lbtt3001-exemptions-reliefs/lbtt3010-tax-reliefs/lbtt3048-first-time-buyer-relief',
      bands: [[0, 0], [175_000, 200], [250_000, 500], [325_000, 1_000], [750_000, 1_200]],
    },
  },
  Wales: {
    tax: 'LTT',
    effectiveFrom: '2022-10-10',
    checkedOn: '2026-11-26',
    source: 'https://www.gov.wales/land-transaction-tax-rates-and-bands',
    roundingSource: 'https://www.gov.wales/land-transaction-tax-calculator',
    rounding: 'penny-down-whole-pound-consideration',
    standard: [[0, 0], [225_000, 600], [400_000, 750], [750_000, 1_000], [1_500_000, 1_200]],
  },
} as const satisfies Record<string, TaxRules>;

export type TaxJurisdiction = keyof typeof residentialTaxRules;
