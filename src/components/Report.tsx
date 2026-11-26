import type { ReactNode } from 'react';
import { ExternalLink } from './ExternalLink';

export type ReportRow = readonly [label: string, value: string];
export type ReportSource = { name: string; url: string; note?: string };
export const methodologyUrl = 'https://github.com/kayodes15/costlens-uk/blob/main/docs/METHODOLOGY.md';

const pounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const decimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

export function money(value: number | null) {
  return value === null ? 'Not available' : pounds.format(value);
}

export function quantity(value: number | null, unit: string) {
  return value === null ? 'Not available' : `${decimal.format(value)} ${unit}`;
}

export function DataTable({ caption, headings, rows }: {
  caption: string; headings: readonly string[]; rows: readonly (readonly string[])[];
}) {
  return <table className="report-table">
    <caption>{caption}</caption>
    <thead><tr>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
    <tbody>{rows.map(([label, ...cells]) => <tr key={label}>
      <th scope="row">{label}</th>{cells.map((cell, index) => <td key={index}>{cell}</td>)}
    </tr>)}</tbody>
  </table>;
}

export function ComparisonChart({ title, values }: {
  title: string; values: readonly { label: string; value: number }[];
}) {
  const max = Math.max(1, ...values.map((item) => Math.abs(item.value)));
  return <section className="comparison-chart">
    <div className="chart-bars" aria-hidden="true">
      {values.map(({ label, value }) => <div key={label}>
        <span>{label}</span>
        <progress className={value < 0 ? 'chart-track negative' : 'chart-track'} value={Math.abs(value)} max={max} />
      </div>)}
    </div>
    <DataTable caption={title} headings={['Measure', 'Amount']} rows={values.map(({ label, value }) => [label, money(value)])} />
  </section>;
}

export function Report({ title, location, generated, inputs, sources = [], formula, assumptions, limitations, children }: {
  title: string; location: string; generated: string; inputs: readonly ReportRow[];
  sources?: readonly ReportSource[]; formula: ReactNode; assumptions: string; limitations: string; children: ReactNode;
}) {
  return <section className="results print-report" aria-label={`${title} report`}>
    <header className="report-header">
      <div><p className="eyebrow">CostLens UK</p><h2>{title}</h2><p>{location} · Generated {generated}</p></div>
      <button type="button" className="button secondary no-print" onClick={() => window.print()}>Print or save as PDF</button>
    </header>
    {children}
    <div className="report-notes">
      <DataTable caption="Scenario inputs" headings={['Input', 'Value']} rows={inputs} />
      <section><h3>How was this calculated?</h3>{formula}</section>
      <section><h3>Assumptions</h3><p>{assumptions}</p></section>
      <section><h3>Limitations</h3><p>{limitations}</p></section>
      <section><h3>Sources</h3><ul>
        {sources.map(({ name, url, note }) => <li key={`${name}:${note ?? ''}`}><ExternalLink href={url}>{name}</ExternalLink>{note && ` · ${note}`}<span className="print-url"> ({url})</span></li>)}
        <li><ExternalLink href={methodologyUrl}>CostLens UK methodology v1.1</ExternalLink><span className="print-url"> ({methodologyUrl})</span></li>
      </ul></section>
      <p className="disclaimer">This report provides financial information and illustrative scenarios. It does not constitute financial, tax or mortgage advice.</p>
    </div>
  </section>;
}

export function reportDate() {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Europe/London' }).format(new Date());
}
