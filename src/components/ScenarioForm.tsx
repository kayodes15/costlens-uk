import type { ReactNode } from 'react';
import { money, type ReportRow } from './Report';

export interface Field {
  name: string;
  label: string;
  unit?: '£' | '%' | 'months';
  optional?: boolean;
  initial?: number;
  min?: number;
  max?: number;
}

export function NumberFields({ fields }: { fields: readonly Field[] }) {
  return <div className="form-grid">{fields.map(({ name, label, unit, optional, initial, min, max }) =>
    <label key={name}>{label}{unit && ` (${unit})`}
      <input name={name} type="number" required={!optional} defaultValue={initial}
        min={min ?? (unit === '%' ? undefined : 0)} max={max}
        step={unit === 'months' ? '1' : unit === '£' ? '0.01' : 'any'} />
    </label>,
  )}</div>;
}

export function FieldGroup({ name, children }: { name: string; children: ReactNode }) {
  return <fieldset className="field-group"><legend>{name}</legend>{children}</fieldset>;
}

export function FormButtons() {
  return <div className="button-row"><button className="button" type="submit">Calculate</button>
    <button className="button secondary" type="reset">Reset</button></div>;
}

export function readNumber(form: FormData, name: string): number | null {
  const raw = form.get(name);
  return typeof raw === 'string' && raw.trim() ? Number(raw) : null;
}

export function asUser(value: number | null) {
  return value === null ? null : { value, kind: 'user' as const };
}

export function inputRows(form: FormData, fields: readonly Field[], prefix = ''): ReportRow[] {
  return fields.map(({ name, label, unit }) => {
    const value = readNumber(form, name);
    const rendered = value === null ? 'Not entered' : unit === '£' ? money(value)
      : unit === '%' ? `${value}%` : unit ? `${value} ${unit}` : String(value);
    return [prefix + label, rendered];
  });
}
