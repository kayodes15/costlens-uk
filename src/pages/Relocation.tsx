import { useState, type FormEvent } from 'react';
import { LocationPicker } from '../components/LocationPicker';
import { ComparisonChart, DataTable, money, quantity, Report, reportDate, type ReportSource } from '../components/Report';
import { asUser, FieldGroup, FormButtons, inputRows, NumberFields, readNumber, type Field } from '../components/ScenarioForm';
import type { Economy, SelectedLocation } from '../data/economy';
import { compareRelocation, type HouseholdBudget } from '../domain/relocation';

const expenses = [
  ['housing', 'Rent or mortgage'], ['localTaxes', 'Council tax'], ['groceries', 'Groceries'],
  ['energy', 'Gas and electricity'], ['water', 'Water'], ['transport', 'Transport'],
  ['childcare', 'Childcare'], ['debt', 'Debt repayments'], ['other', 'Other expenditure'],
] as const;
const movingFields: Field[] = [{ name: 'moving', label: 'One-off moving costs', unit: '£', optional: true }];
const bedroomOptions = [['all', 'All properties'], ['1', 'One bedroom'], ['2', 'Two bedrooms'],
  ['3', 'Three bedrooms'], ['4+', 'Four or more bedrooms']];

function budgetFields(prefix: string, location: SelectedLocation | null): Field[] {
  return [
    { name: `${prefix}-income`, label: 'Monthly take-home income', unit: '£' },
    ...expenses.map(([key, label]): Field => ({
      name: `${prefix}-${key}`,
      label: key === 'localTaxes' && location?.nation === 'Northern Ireland' ? 'Domestic rates' : label,
      unit: '£',
    })),
  ];
}

function locationName(location: SelectedLocation | null) {
  return location ? `${location.name}, ${location.nation}` : 'Location not selected';
}

type HousingEstimate = { value: number; name: string; period: string; source: ReportSource };

function rentEstimate(data: Economy, location: SelectedLocation | null, bedrooms: string): HousingEstimate | null {
  const code = location?.areaCode;
  if (!code) return null;
  const brma = data.brmas.find((row) => row.areaCode === code)?.bestMatch;
  const row = data.rents.find((rent) => rent.areaCode === (brma?.code ?? code) && rent.bedrooms === bedrooms);
  const source = data.sources['private-rents'];
  if (row?.value == null || !source) return null;
  const name = brma ? `${brma.name} BRMA` : row.name;
  return { value: row.value, name, period: row.period, source: {
    name: source.name, url: source.sourceUrl, note: `${name} · ${row.period} · ${bedroomOptions.find(([key]) => key === bedrooms)?.[1]}`,
  } };
}

function BudgetFields({ prefix, title, fields, location, data, chosen, onEstimate }: {
  prefix: string; title: string; fields: Field[]; location: SelectedLocation | null; data: Economy;
  chosen: HousingEstimate | null; onEstimate: (estimate: HousingEstimate | null) => void;
}) {
  const [bedrooms, setBedrooms] = useState('all');
  const [housing, setHousing] = useState('');
  const estimate = rentEstimate(data, location, bedrooms);
  return <FieldGroup name={title}>
    <p className="budget-place">{locationName(location)}</p>
    <label>Rent or mortgage (£)<input name={`${prefix}-housing`} type="number" min="0" step="0.01" required
      value={housing} onChange={(event) => { setHousing(event.target.value); onEstimate(null); }} /></label>
    <details className="advanced">
      <summary>Official rent estimate</summary>
      <label>Property size<select value={bedrooms} onChange={(event) => setBedrooms(event.target.value)}>
        {bedroomOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      {estimate ? <>
        <p>{money(estimate.value)} per month · {estimate.name} · {estimate.period}</p>
        <button type="button" className="button secondary" onClick={() => {
          setHousing(String(estimate.value));
          onEstimate(estimate);
        }}>Use this estimate</button>
      </> : <p>Not available. Enter your rent or mortgage above.</p>}
    </details>
    {chosen && <p className="hint">Estimate · {chosen.name} · {chosen.period}</p>}
    <NumberFields fields={fields.filter((field) => field.name !== `${prefix}-housing`)} />
  </FieldGroup>;
}

type RelocationResult = NonNullable<ReturnType<typeof compareRelocation>['value']>;
interface Submission {
  result: RelocationResult;
  currentName: string;
  proposedName: string;
  generated: string;
  inputs: ReturnType<typeof inputRows>;
  sources: ReportSource[];
  scotland: boolean;
}

export function Relocation({ data, selected, loading }: {
  data: Economy; selected: SelectedLocation | null; loading: boolean;
}) {
  const [current, setCurrent] = useState(selected);
  const [proposed, setProposed] = useState<SelectedLocation | null>(null);
  const [currentEstimate, setCurrentEstimate] = useState<HousingEstimate | null>(null);
  const [proposedEstimate, setProposedEstimate] = useState<HousingEstimate | null>(null);
  const [submitted, setSubmitted] = useState<Submission | null>(null);
  const [error, setError] = useState('');
  const [reset, setReset] = useState(0);
  const currentFields = budgetFields('current', current);
  const proposedFields = budgetFields('proposed', proposed);
  const scotland = Boolean(current && proposed && ((current.nation === 'Scotland') !== (proposed.nation === 'Scotland')));

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(null);
    if (!current || !proposed) {
      setError('Select or enter both locations before calculating.');
      return;
    }
    const form = new FormData(event.currentTarget);
    function budget(prefix: string, estimated: HousingEstimate | null): HouseholdBudget {
      return {
        monthlyTakeHome: asUser(readNumber(form, `${prefix}-income`)),
        expenses: Object.fromEntries(expenses.map(([key]) => [
          key,
          key === 'housing' && estimated
            ? { value: estimated.value, kind: 'estimate' as const, source: estimated.source.url }
            : asUser(readNumber(form, `${prefix}-${key}`)),
        ])),
      };
    }
    const outcome = compareRelocation(budget('current', currentEstimate), budget('proposed', proposedEstimate),
      asUser(readNumber(form, 'moving')));
    if (outcome.value === null) {
      setError(outcome.reason);
      return;
    }
    setError('');
    setSubmitted({
      result: outcome.value, currentName: locationName(current), proposedName: locationName(proposed),
      generated: reportDate(), scotland,
      inputs: [...inputRows(form, currentFields, 'Current · '), ...inputRows(form, proposedFields, 'Proposed · '),
        ...inputRows(form, movingFields)],
      sources: Array.from(new Map([currentEstimate, proposedEstimate].filter((estimate) => estimate !== null)
        .map((estimate) => [estimate.source.note, estimate.source])).values()),
    });
  }

  return <section className="model-page">
    <div className="tool-intro"><p className="eyebrow">Relocation</p><h1 tabIndex={-1}>How would moving change your budget?</h1>
      <p className="lede">Compare monthly take-home income and living costs across two locations.</p></div>
    <div className="paired location-pair no-print">
      <LocationPicker title="Current location" locations={data.locations} selected={current} loading={loading}
        onSelect={(area) => { setCurrent(area); setCurrentEstimate(null); }} />
      <LocationPicker title="Proposed location" locations={data.locations} selected={proposed} loading={loading}
        onSelect={(area) => { setProposed(area); setProposedEstimate(null); }} />
    </div>
    <form className="calculator model-form no-print" key={reset} autoComplete="off" onSubmit={calculate} onReset={() => {
      setSubmitted(null); setError(''); setCurrentEstimate(null); setProposedEstimate(null); setReset(reset + 1);
    }}>
      <p className="hint">Enter each monthly expense. Use £0 when you have no cost in that category.</p>
      <div className="paired">
        <BudgetFields key={`current:${JSON.stringify(current)}`} prefix="current" title="Current monthly budget" fields={currentFields}
          location={current} data={data} chosen={currentEstimate} onEstimate={setCurrentEstimate} />
        <BudgetFields key={`proposed:${JSON.stringify(proposed)}`} prefix="proposed" title="Proposed monthly budget" fields={proposedFields}
          location={proposed} data={data} chosen={proposedEstimate} onEstimate={setProposedEstimate} />
      </div>
      <NumberFields fields={movingFields} />
      {scotland && <p className="notice">Scottish income tax rules may affect your take-home pay when moving between Scotland and another UK nation. Enter your expected take-home pay for each location.</p>}
      <FormButtons />
      {error && <p role="alert" className="notice">{error}</p>}
    </form>
    {submitted && <RelocationReport submission={submitted} />}
  </section>;
}

function RelocationReport({ submission }: { submission: Submission }) {
  const { result, currentName, proposedName, generated, inputs, sources, scotland } = submission;
  const assumptions = 'Monthly income and spending stay constant. Annual figures use 12 months. Moving costs are a one-off expense.';
  return <Report title="Relocation comparison" location={`${currentName} to ${proposedName}`} generated={generated}
    inputs={inputs} sources={sources} assumptions={assumptions}
    limitations={`Housing figures marked as estimates come from area-level data. ${scotland ? 'Scottish income tax rules may affect take-home pay. ' : ''}The tool uses entered take-home pay and does not calculate tax.`}
    formula={<p>Disposable income is take-home pay minus expenses. The proposed amount minus the current amount gives the monthly difference. Moving costs divided by a positive monthly improvement give the recovery period.</p>}>
    <p className="result-summary">Monthly difference <strong>{money(result.monthlyDifference.value)}</strong> · Annual difference <strong>{money(result.annualDifference.value)}</strong></p>
    <DataTable caption="Budget comparison" headings={['Measure', 'Current', 'Proposed']} rows={[
      ['Take-home income', money(result.current.monthlyTakeHome.value), money(result.proposed.monthlyTakeHome.value)],
      ['Total expenditure', money(result.current.totalExpenditure.value), money(result.proposed.totalExpenditure.value)],
      ...expenses.map(([key, label]) => [
        key === 'localTaxes' ? 'Council tax or domestic rates' : label,
        money(result.current.expenses[key]?.value ?? null), money(result.proposed.expenses[key]?.value ?? null),
      ]),
      ['Disposable income', money(result.current.disposableIncome.value), money(result.proposed.disposableIncome.value)],
    ]} />
    <ComparisonChart title="Monthly expenditure" values={[
      { label: 'Current', value: result.current.totalExpenditure.value },
      { label: 'Proposed', value: result.proposed.totalExpenditure.value },
    ]} />
    <DataTable caption="Moving costs and recovery" headings={['Measure', 'Value']} rows={[
      ['Required proposed take-home pay', money(result.requiredTakeHome.value)],
      ['Recovery period', result.recoveryMonths.value === null ? result.recoveryMonths.reason : quantity(result.recoveryMonths.value, 'months')],
    ]} />
  </Report>;
}
