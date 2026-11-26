import { calculatedFields, unavailable, type Value } from './result';

export type IndexName = 'CPIH' | 'CPI';
type IndexValue = Value<number, 'published'>;

export interface InflationInput {
  readonly startMonth: string;
  readonly endMonth: string;
  readonly index?: IndexName;
  readonly observations: Partial<Record<IndexName, Readonly<Record<string, IndexValue | null>>>>;
}

const referenceMonth = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

export function compareInflation(input: InflationInput) {
  const { startMonth, endMonth: requestedEndMonth, index = 'CPIH', observations } = input;
  if (!referenceMonth.test(startMonth) || !referenceMonth.test(requestedEndMonth)) {
    return unavailable('Enter valid reference months in YYYY-MM format.');
  }
  if (startMonth > requestedEndMonth) {
    return unavailable('The start month is after the requested end month.');
  }
  const series = observations[index];
  if (!series) return unavailable(`No ${index} series is available.`);

  let latestMonth: string | undefined;
  for (const [month, observation] of Object.entries(series)) {
    if (!referenceMonth.test(month)) return unavailable('The index series contains an invalid reference month.');
    if (observation != null && (latestMonth === undefined || month > latestMonth)) {
      latestMonth = month;
    }
  }
  if (latestMonth === undefined) return unavailable(`No ${index} observations are available.`);

  const endMonth = requestedEndMonth > latestMonth ? latestMonth : requestedEndMonth;
  if (startMonth > endMonth) {
    return unavailable('The start month is after the latest available comparison month.');
  }
  const start = series[startMonth];
  const end = series[endMonth];
  if (start == null) return unavailable(`No ${index} observation for ${startMonth}.`);
  if (end == null) return unavailable(`No ${index} observation for ${endMonth}.`);
  if (!Number.isFinite(start.value) || start.value <= 0 || !Number.isFinite(end.value) || end.value <= 0) {
    return unavailable('Index observations must be finite and positive.');
  }

  const factor = end.value / start.value;
  if (factor === 0) return unavailable('The inflation factor is below the supported numeric range.');
  const results = calculatedFields({ factor, inflationPercent: (factor - 1) * 100 });
  if (results.value === null) return results;

  return {
    value: {
      ...results.value,
      index,
      startMonth,
      requestedEndMonth,
      endMonth,
      latestMonth,
      start,
      end,
      disclosure: requestedEndMonth === endMonth
        ? null
        : `Using ${endMonth}, the latest published ${index} reference month. Inflation after that month is excluded.`,
    },
  };
}
