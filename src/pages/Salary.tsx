import { useState, type FormEvent } from 'react';
import { ExternalLink } from '../components/ExternalLink';
import { comparePay, requiredPayHistory, targetPay, type Pay } from '../domain/salary';
import { DataTable, Report, reportDate, type ReportRow } from '../components/Report';
import type { IndexName } from '../domain/inflation';
import { indexRounding, inflationObservations, isStale, latestObservation, type Economy } from '../data/economy';

type Mode = 'comparison' | 'target';
type SalaryResult = NonNullable<ReturnType<typeof comparePay>['value']>;
type TargetResult = NonNullable<ReturnType<typeof targetPay>['value']>;
type Outcome = { mode: 'comparison'; result: SalaryResult; generated: string; location: string; history: ReturnType<typeof requiredPayHistory> } | { mode: 'target'; result: TargetResult; generated: string; location: string } | { reason: string };

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const formatPercent = (value: number) => `${value.toFixed(2)}%`;
const formatMoney = (value: number) => gbp.format(value);

function readNumber(form: FormData, name: string) {
  const raw = form.get(name);
  return typeof raw === 'string' && raw.trim() ? { value: Number(raw), kind: 'user' as const } : null;
}

function MoneyField({ label, name }: { label: string; name: string }) {
  return <label>{label}<input name={name} type="number" required min="0.01" step="0.01" placeholder="0.00" /></label>;
}

function MonthField({ label, name, initial = '' }: { label: string; name: string; initial?: string }) {
  return <label>{label}
    <input name={name} type="text" required maxLength={7} pattern="[0-9]{4}-(0[1-9]|1[0-2])"
      placeholder="YYYY-MM" defaultValue={initial} />
  </label>;
}

function PayChart({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(...rows.map((row) => row.value));
  return (
    <section className="comparison-chart" aria-label="Pay amounts compared">
      <h3>Pay amounts compared</h3>
      <div className="chart-bars" aria-hidden="true">
        {rows.map(({ label, value }) => (
          <div key={label}><span>{label}</span><progress className="chart-track" value={value} max={max} /></div>
        ))}
      </div>
      <table>
        <thead><tr><th scope="col">Measure</th><th scope="col">Amount</th></tr></thead>
        <tbody>{rows.map(({ label, value }) => <tr key={label}><th scope="row">{label}</th><td>{formatMoney(value)}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function FormulaInspector({ inflation, children }: {
  inflation: SalaryResult['inflation']; children: React.ReactNode;
}) {
  const sourceName = `ONS ${inflation.index} all-items index`;
  return (
    <details className="formula">
      <summary>How was this calculated?</summary>
      <p>{inflation.index} inflation factor = end index ÷ start index = {inflation.end.value} ÷ {inflation.start.value} ≈ {inflation.factor.value.toFixed(6)}.</p>
      <p>Cumulative inflation = (inflation factor − 1) × 100 = {formatPercent(inflation.inflationPercent.value)}.</p>
      {children}
      <p>{indexRounding}</p>
      <p>Source: {inflation.start.source
        ? <ExternalLink href={inflation.start.source}>{sourceName}</ExternalLink>
        : sourceName}. Reference months: {inflation.startMonth} and {inflation.endMonth}.</p>
    </details>
  );
}

function SalaryResults({ outcome, data }: { outcome: Exclude<Outcome, { reason: string }>; data: Economy }) {
  const result = outcome.result;
  const inflation = result.inflation;
  const source = data.sources[inflation.index === 'CPIH' ? 'cpih' : 'cpi'];
  const pay = outcome.mode === 'comparison' ? outcome.result.previous : outcome.result.reference;
  const basisAndPeriod = `${pay.basis === 'gross' ? 'Gross pay' : 'Take-home pay'} · ${pay.period}`;
  const baseline = pay.amount!.value;
  const historyMax = outcome.mode === 'comparison' ? Math.max(1, ...outcome.history.map((item) => item.requiredPay ?? 0)) : 1;
  const inputs: ReportRow[] = [
    ['Pay basis and period', basisAndPeriod], ['Reference pay', formatMoney(baseline)],
    ['Start month', inflation.startMonth], ['Requested end month', inflation.requestedEndMonth],
    ['Index', inflation.index],
    outcome.mode === 'comparison' ? ['Current pay', formatMoney(outcome.result.current.amount!.value)]
      : ['Desired real change', formatPercent(outcome.result.desiredRealGrowth.value * 100)],
  ];
  return (
    <Report title={outcome.mode === 'comparison' ? 'Salary purchasing power' : 'Pay rise target'}
      location={outcome.location} generated={outcome.generated} inputs={inputs}
      sources={source ? [{ name: source.name, url: source.sourceUrl, note: `${inflation.startMonth} to ${inflation.endMonth}` }] : []}
      formula={<p>Inflation factor = {inflation.end.value} ÷ {inflation.start.value}. Required pay = reference pay × factor. {outcome.mode === 'comparison'
        ? 'Real change uses current pay divided by required pay, minus one. The pay gap is current pay minus required pay.'
        : 'Target pay multiplies required pay by one plus desired real growth. The percentage increase compares target pay with reference pay.'}</p>}
      assumptions="The comparison uses one pay basis and period throughout. Annual and monthly gaps use 12 months per year."
      limitations={`The national index measures changes across many households. ${indexRounding}`}>
      <div className="section-heading"><h3 id="results-heading">Your results</h3><p>{basisAndPeriod} · Calculated</p></div>
      <p role="status">{inflation.disclosure ?? `${inflation.index} reference months: ${inflation.startMonth} to ${inflation.endMonth}.`}</p>
      {source && isStale(source) && <p className="notice">The inflation dataset is due a refresh.</p>}
      {outcome.mode === 'comparison' ? (
        <>
          <dl className="results-grid">
            <div><dt>Nominal pay change</dt><dd>{formatPercent(outcome.result.nominalChangePercent.value)}</dd></div>
            <div><dt>Cumulative inflation</dt><dd>{formatPercent(inflation.inflationPercent.value)}</dd></div>
            <div><dt>Real pay change</dt><dd>{formatPercent(outcome.result.realChangePercent.value)}</dd></div>
            <div><dt>Pay needed to keep up</dt><dd>{formatMoney(result.requiredPay.value)}</dd></div>
            <div><dt>Annual purchasing power gap</dt><dd>{formatMoney(outcome.result.annualGap.value)}</dd></div>
            <div><dt>Monthly purchasing power gap</dt><dd>{formatMoney(outcome.result.monthlyGap.value)}</dd></div>
          </dl>
          <p>Over the period used, your purchasing power {outcome.result.realChangePercent.value > 0 ? 'rose' : outcome.result.realChangePercent.value < 0 ? 'fell' : 'stayed level'} on the selected index and pay basis.</p>
          <PayChart rows={[
            { label: 'Previous pay', value: baseline },
            { label: 'Current pay', value: outcome.result.current.amount!.value },
            { label: 'Pay needed to keep up', value: result.requiredPay.value },
          ]} />
          <details className="advanced no-print"><summary>Historical purchasing power</summary>
            <div className="monthly-chart" aria-hidden="true">
              {outcome.history.map(({ month, requiredPay }) => <div key={month}>
                <span>{month}</span>{requiredPay === null ? <span>Not available</span> : <progress className="chart-track" value={requiredPay} max={historyMax} />}
              </div>)}
            </div>
            <DataTable caption="Pay needed to maintain purchasing power by month" headings={['Reference month', 'Pay needed']}
              rows={outcome.history.map(({ month, requiredPay }) => [month, requiredPay === null ? 'Not available' : formatMoney(requiredPay)])} />
          </details>
          <FormulaInspector inflation={inflation}>
            <p>Pay needed to keep up = previous pay × inflation factor = {formatMoney(baseline)} × the factor above = {formatMoney(result.requiredPay.value)}.</p>
            <p>Nominal change = (current pay ÷ previous pay − 1) × 100 = {formatPercent(outcome.result.nominalChangePercent.value)}.</p>
            <p>Real change = (current pay ÷ pay needed to keep up − 1) × 100 = {formatPercent(outcome.result.realChangePercent.value)}.</p>
            <p>Pay gap = current pay minus pay needed to keep up. The monthly and annual views use 12 months per year.</p>
          </FormulaInspector>
        </>
      ) : (
        <>
          <dl className="results-grid">
            <div><dt>Pay needed to keep up</dt><dd>{formatMoney(result.requiredPay.value)}</dd></div>
            <div><dt>Target pay</dt><dd>{formatMoney(outcome.result.targetPay.value)}</dd></div>
            <div><dt>Nominal change needed</dt><dd>{formatMoney(outcome.result.increase.value)}</dd></div>
            <div><dt>Percentage change needed</dt><dd>{formatPercent(outcome.result.increasePercent.value)}</dd></div>
          </dl>
          <p>The target reflects {formatPercent(outcome.result.desiredRealGrowth.value * 100)} real change over the reference period. Employers generally negotiate gross salary. A take-home target has no automatic gross equivalent here.</p>
          <PayChart rows={[
            { label: 'Current pay', value: baseline },
            { label: 'Pay needed to keep up', value: result.requiredPay.value },
            { label: 'Target pay', value: outcome.result.targetPay.value },
          ]} />
          <FormulaInspector inflation={inflation}>
            <p>Pay needed to keep up = current pay × inflation factor = {formatMoney(baseline)} × the factor above = {formatMoney(result.requiredPay.value)}.</p>
            <p>Target pay = pay needed to keep up × (1 + desired real change) = {formatMoney(result.requiredPay.value)} × (1 + {outcome.result.desiredRealGrowth.value}) = {formatMoney(outcome.result.targetPay.value)}.</p>
            <p>Nominal change = target pay − current pay = {formatMoney(outcome.result.increase.value)}. Percentage change = (target pay ÷ current pay − 1) × 100 = {formatPercent(outcome.result.increasePercent.value)}.</p>
          </FormulaInspector>
        </>
      )}
    </Report>
  );
}

export function Salary({ mode, data, location, loading }: {
  mode: Mode; data: Economy; location: string; loading: boolean;
}) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const comparison = mode === 'comparison';

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pay = (field: string): Pay => ({
      amount: readNumber(form, field),
      basis: form.get('basis') === 'net' ? 'net' : 'gross',
      period: form.get('period') === 'monthly' ? 'monthly' : 'annual',
    });
    const dates = {
      startMonth: String(form.get('start') ?? ''),
      endMonth: String(form.get('end') ?? ''),
      index: (form.get('index') === 'CPI' ? 'CPI' : 'CPIH') as IndexName,
      observations: inflationObservations(data),
    };
    if (comparison) {
      const result = comparePay(pay('previous'), pay('current'), dates);
      setOutcome(result.value === null ? { reason: result.reason } : {
        mode, result: result.value, generated: reportDate(), location,
        history: requiredPayHistory(result.value.previous, dates, result.value),
      });
    } else {
      const growth = readNumber(form, 'growth');
      const result = targetPay(pay('current'), growth === null ? null : { ...growth, value: growth.value / 100 }, dates);
      setOutcome(result.value === null ? { reason: result.reason } : { mode, result: result.value, generated: reportDate(), location });
    }
  }

  return (
    <section className="salary-page" aria-labelledby="salary-heading">
      <div className="tool-intro"><p className="eyebrow">Salary &amp; Pay Rise</p>
      <h1 id="salary-heading" tabIndex={-1}>{comparison ? 'Has my pay kept up?' : 'What pay rise should I negotiate?'}</h1>
      <p className="lede">{comparison ? 'Compare past and current pay against UK inflation.' : 'Estimate the pay you’d need for a real increase in purchasing power.'}</p>
      <div className="tool-switch" aria-label="Salary tools">
        <a href="#salary" aria-current={comparison ? 'page' : undefined}>Pay comparison</a>
        <a href="#pay-rise" aria-current={!comparison ? 'page' : undefined}>Pay rise target</a>
      </div>
      </div>
      <div className="salary-layout no-print">
        <form className="calculator" autoComplete="off" onSubmit={calculate} onReset={() => setOutcome(null)}>
          <h2>Your pay details</h2>
          <div className="form-grid">
            <label>Pay basis<select name="basis"><option value="gross">Gross pay</option><option value="net">Take-home pay</option></select></label>
            <label>Pay period<select name="period"><option value="annual">Annual</option><option value="monthly">Monthly</option></select></label>
            {comparison && <MoneyField label="Previous pay (£)" name="previous" />}
            <MoneyField label="Current pay (£)" name="current" />
            {!comparison && <label>Desired real change (%)<input type="number" name="growth" required step="any" defaultValue="0" /></label>}
            <MonthField label={comparison ? 'Previous pay month' : 'Last pay review month'} name="start" />
            <MonthField label={comparison ? 'Current pay month' : 'Target comparison month'} name="end"
              initial={latestObservation(data.observations.cpih)?.period} />
          </div>
          <p className="hint">Enter reference months as YYYY-MM, for example 2025-10.</p>
          <details className="advanced"><summary>Inflation assumptions</summary>
            <label>Inflation index<select name="index"><option>CPIH</option><option>CPI</option></select></label>
            <p>CPIH includes owner occupiers’ housing costs. Both indices describe UK prices across many households.</p>
          </details>
          <div className="button-row">
            <button className="button" disabled={loading} type="submit">Calculate</button>
            <button className="button secondary" type="reset">Reset</button>
          </div>
          {outcome && 'reason' in outcome && <p role="alert" className="notice">{outcome.reason}</p>}
        </form>
        <aside className="context">
          <h2>Location context</h2>
          <p><strong>{location}</strong></p>
          <p>Both tools use the national index. The effect of inflation on your own spending can vary.</p>
          <p>Use the same gross or take-home basis throughout. Tax, pension and other deductions can change take-home pay.</p>
        </aside>
      </div>
      {outcome && 'result' in outcome && <SalaryResults outcome={outcome} data={data} />}
    </section>
  );
}
