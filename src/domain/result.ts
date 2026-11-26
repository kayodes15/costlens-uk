export type ValueKind = 'published' | 'user' | 'estimate' | 'assumption' | 'calculated' | 'simulated';

export type Value<T = number, K extends ValueKind = ValueKind> = {
  readonly value: T;
  readonly kind: K;
  readonly source?: string;
};

export type Unavailable = { readonly value: null; readonly reason: string };
export type Result<T> = { readonly value: T } | Unavailable;

export function unavailable(reason: string): Unavailable {
  return { value: null, reason };
}

export function calculatedFields<K extends string>(
  fields: Record<K, number>,
): Result<Record<K, Value<number, 'calculated'>>> {
  return numericFields(fields, 'calculated');
}

export function simulatedFields<K extends string>(fields: Record<K, number>) {
  return numericFields(fields, 'simulated');
}

function numericFields<K extends string, V extends 'calculated' | 'simulated'>(
  fields: Record<K, number>,
  kind: V,
): Result<Record<K, Value<number, V>>> {
  const values = {} as Record<K, Value<number, V>>;
  for (const key in fields) {
    const value = fields[key];
    if (!Number.isFinite(value)) {
      return unavailable('The calculation exceeds the supported numeric range.');
    }
    values[key] = { value, kind };
  }
  return { value: values };
}
