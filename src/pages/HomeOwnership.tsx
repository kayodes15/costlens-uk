import { useState, type FormEvent, type ReactNode } from 'react';
import { ComparisonChart, DataTable, money, quantity, Report, reportDate, type ReportRow, type ReportSource } from '../components/Report';
import { asUser, FieldGroup, FormButtons, inputRows, NumberFields, readNumber, type Field } from '../components/ScenarioForm';
import { compareBuyNowVsWait } from '../domain/buy-now-vs-wait';
import { compareHomeOwnership, compareHomeOwnershipRates } from '../domain/mortgage';
import { calculatePropertyTax, type PropertyTaxInput } from '../domain/property-tax';
import { residentialTaxRules, type TaxJurisdiction } from '../domain/property-tax-rules';
import type { Value } from '../domain/result';
import { compareRentVsBuy } from '../domain/rent-vs-buy';

export type OwnershipTool = 'home-ownership' | 'buy-now-vs-wait' | 'rent-vs-buy';
type TaxResult = NonNullable<ReturnType<typeof calculatePropertyTax>['value']>;
type HomeResult = NonNullable<ReturnType<typeof compareHomeOwnership>['value']>;
type TaxSettings = Omit<PropertyTaxInput, 'price'>;

const tools: Record<OwnershipTool, { title: string; intro: string }> = {
  'home-ownership': { title: 'Mortgage and purchase costs', intro: 'Explore repayments, purchase costs and the savings and monthly income left after buying.' },
  'buy-now-vs-wait': { title: 'Buy Now vs Wait', intro: 'Compare the financial position on two possible purchase dates.' },
  'rent-vs-buy': { title: 'Rent vs Buy', intro: 'Compare renting and owning over the same period with equal starting resources.' },
};

const loan: Field[] = [
  { name: 'price', label: 'Property price', unit: '£', min: 0.01 },
  { name: 'deposit', label: 'Deposit', unit: '£' },
  { name: 'rate', label: 'Annual nominal mortgage rate', unit: '%', min: 0 },
  { name: 'term', label: 'Mortgage term', unit: 'months', min: 1, max: 1200 },
];
const savings: Field = { name: 'savings', label: 'Available savings', unit: '£' };
const budget: Field[] = [
  { name: 'fees', label: 'One-off purchase fees', unit: '£' },
  { name: 'income', label: 'Monthly household take-home pay', unit: '£' },
  { name: 'ownership', label: 'Monthly ownership costs', unit: '£' },
  { name: 'living', label: 'Monthly non-housing costs', unit: '£' },
  { name: 'debt', label: 'Monthly debt repayments', unit: '£' },
];
const futureBudget = [loan[1], loan[2], ...budget].map((field) => ({ ...field, name: `future-${field.name}` }));
const waiting: Field[] = [
  { name: 'wait', label: 'Waiting period', unit: 'months', min: 1, max: 24 },
  { name: 'after-rent', label: 'Monthly savings after rent', unit: '£' },
  { name: 'rent', label: 'Current monthly rent', unit: '£' },
  { name: 'price-change', label: 'Price change over the waiting period', unit: '%', initial: 0 },
];
const alternatives: Field[] = [
  { name: 'alternative-1', label: 'Alternative annual rate 1', unit: '%', optional: true, min: 0 },
  { name: 'alternative-2', label: 'Alternative annual rate 2', unit: '%', optional: true, min: 0 },
];
const rentalBudget: Field[] = [
  { name: 'savings', label: 'Common opening capital', unit: '£' },
  { name: 'resources', label: 'Common monthly resources', unit: '£', optional: true },
  { name: 'rent', label: 'Starting monthly rent', unit: '£' },
  { name: 'comparison', label: 'Comparison period', unit: 'months', min: 1, max: 1200 },
  budget[2], budget[0],
  { name: 'sale-fees', label: 'Fixed selling costs', unit: '£' },
];
const rentalAssumptions: Field[] = [
  { name: 'sale-rate', label: 'Selling cost as a share of sale price', unit: '%', min: 0, max: 100, initial: 0 },
  { name: 'rent-growth', label: 'Annual rent growth', unit: '%', initial: 0 },
  { name: 'property-growth', label: 'Annual property price growth', unit: '%', initial: 0 },
  { name: 'return', label: 'Annual saving or investment return', unit: '%', initial: 0 },
];

function todayUK() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', dateStyle: 'short' }).format(new Date());
}

function addMonths(start: string, months: number | null) {
  if (!start || months === null || !Number.isInteger(months) || months < 1 || months > 24) return null;
  const date = new Date(`${start}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const days = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, days));
  return date.toISOString().slice(0, 10);
}

function TaxFields({ prefix = '', nation, includeDate }: { prefix?: string; nation?: string; includeDate: boolean }) {
  return <FieldGroup name={prefix ? 'Future purchase tax' : 'Purchase tax'}>
    <div className="form-grid">
      <label>{prefix ? 'Future tax jurisdiction' : 'Tax jurisdiction'}
        <select name={`${prefix}jurisdiction`} required defaultValue={nation ?? ''}>
          <option value="">Select a nation</option>
          {Object.keys(residentialTaxRules).map((name) => <option key={name}>{name}</option>)}
        </select>
      </label>
      <label>{prefix ? 'Future purchase category' : 'Purchase category'}
        <select name={`${prefix}category`}>
          <option value="standard">Standard residential</option>
          <option value="eligible-first-time-buyer">Eligible first-time buyer</option>
          <option value="unsupported">Other or unsure</option>
        </select>
      </label>
      {includeDate && <label>Effective purchase date<input type="date" name="effective-date" required defaultValue={todayUK()} /></label>}
      <label>{prefix ? 'Future manual tax override (£)' : 'Manual tax override (£)'}
        <input type="number" name={`${prefix}manual-tax`} min="0" step="0.01" />
      </label>
    </div>
    <p className="hint">For surcharges, linked purchases, shared ownership or other special cases, select Other or unsure and enter the tax manually.</p>
  </FieldGroup>;
}

function readTax(form: FormData, prefix = '', effectiveDate = String(form.get('effective-date') ?? '') || null): TaxSettings {
  const jurisdiction = String(form.get(`${prefix}jurisdiction`) ?? '');
  const category = form.get(`${prefix}category`);
  return {
    jurisdiction: Object.hasOwn(residentialTaxRules, jurisdiction) ? jurisdiction as TaxJurisdiction : null,
    category: category === 'standard' || category === 'eligible-first-time-buyer' ? category : 'unsupported',
    effectiveDate,
    manualTax: asUser(readNumber(form, `${prefix}manual-tax`)),
  };
}

function taxInputs(settings: TaxSettings, prefix = ''): ReportRow[] {
  const category = settings.category === 'eligible-first-time-buyer' ? 'Eligible first-time buyer'
    : settings.category === 'standard' ? 'Standard residential' : 'Other or unsure';
  return [
    [prefix + 'Tax jurisdiction', settings.jurisdiction ?? 'Not entered'],
    [prefix + 'Purchase category', category],
    [prefix + 'Effective purchase date', settings.effectiveDate ?? 'Not entered'],
    [prefix + 'Manual tax override', settings.manualTax ? money(settings.manualTax.value) : 'Not entered'],
  ];
}

function source(tax: TaxResult | undefined, label?: string): ReportSource[] {
  return tax?.method === 'automatic' ? [{
    name: `${label ? `${label} · ` : ''}${tax.tax} guidance`,
    url: tax.amount.source,
    note: `Effective from ${tax.effectiveFrom} · Checked ${tax.checkedOn}`,
  }] : [];
}

function TaxNote({ tax }: { tax: TaxResult }) {
  if (tax.method === 'manual') return <p>Purchase tax uses your manual entry.</p>;
  return <p>{tax.tax} rules effective from {tax.effectiveFrom}, checked {tax.checkedOn}.
    {tax.rulesMayHaveChanged && ' This purchase date is later than the rules check. Check the authority for later changes.'}
  </p>;
}

function readBudget(form: FormData, prefix = '') {
  const rate = readNumber(form, `${prefix}rate`);
  return {
    deposit: readNumber(form, `${prefix}deposit`),
    annualRate: rate === null ? null : rate / 100,
    upfrontFees: readNumber(form, `${prefix}fees`),
    monthlyTakeHome: readNumber(form, `${prefix}income`),
    monthlyOwnershipCosts: readNumber(form, `${prefix}ownership`),
    monthlyNonHousingCosts: readNumber(form, `${prefix}living`),
    monthlyDebtPayments: readNumber(form, `${prefix}debt`),
  };
}

const mortgageFormula = 'Principal is price minus deposit. Repayments use the monthly amortisation formula with nominal annual rate divided by 12. Monthly cash flow is take-home pay minus the mortgage payment and other monthly outgoings. Upfront cash is deposit plus purchase tax and fees.';
const mortgageLimitations = 'Rates are illustrative and held constant for each scenario. Figures do not represent a lender offer or APRC.';

function housingRows(scenario: Omit<HomeResult, 'price' | 'savings'> & { price: Value; savings: Value }): ReportRow[] {
  return [
    ['Property price', money(scenario.price.value)],
    ['Available savings', money(scenario.savings.value)],
    ['Deposit', money(scenario.deposit.value)],
    ['Deposit share', quantity(scenario.depositPercent.value, '%')],
    ['Loan to value', quantity(scenario.loanToValuePercent.value, '%')],
    ['Mortgage principal', money(scenario.principal.value)],
    ['Monthly mortgage repayment', money(scenario.mortgage.monthlyPayment.value)],
    ['Total mortgage interest', money(scenario.mortgage.totalInterest.value)],
    ['Purchase tax', money(scenario.purchaseTax.value)],
    ['Upfront cash', money(scenario.upfrontCosts.value)],
    ['Savings remaining', money(scenario.savingsRemaining.value)],
    ['Monthly outgoings', money(scenario.monthlyOutgoings.value)],
    ['Monthly disposable income', money(scenario.monthlyDisposable.value)],
    ['Emergency coverage', scenario.emergencyMonths.value === null ? 'Not available' : quantity(scenario.emergencyMonths.value, 'months')],
  ];
}

interface ModelReport {
  inputs: ReportRow[];
  sources: ReportSource[];
  formula: string;
  assumptions: string;
  limitations: string;
  content: ReactNode;
}

function mortgageReport(form: FormData): ModelReport | string {
  const settings = readTax(form);
  const price = readNumber(form, 'price');
  const tax = calculatePropertyTax({ ...settings, price });
  if (tax.value === null) return tax.reason;
  const input = { ...readBudget(form), price, savings: readNumber(form, 'savings'),
    termMonths: readNumber(form, 'term'), purchaseTax: tax.value.amount };
  const outcome = compareHomeOwnership(input);
  if (outcome.value === null) return outcome.reason;
  const result = outcome.value;
  const rates = alternatives.flatMap(({ name }) => {
    const value = readNumber(form, name);
    return value === null ? [] : [{ value: value / 100, kind: 'user' as const }];
  });
  const sensitivities = compareHomeOwnershipRates(input, rates);
  return {
    inputs: [...inputRows(form, [...loan, savings, ...budget, ...alternatives]), ...taxInputs(settings)],
    sources: source(tax.value), formula: mortgageFormula,
    assumptions: 'Repayments are made at month end. Fees and the deposit are paid at purchase.',
    limitations: mortgageLimitations,
    content: <>
      <p className="result-summary">Illustrative monthly repayment <strong>{money(result.mortgage.monthlyPayment.value)}</strong></p>
      {result.savingsRemaining.value < 0 && <p className="notice">Available savings fall short of the upfront cash needed.</p>}
      {result.monthlyDisposable.value < 0 && <p className="notice">This scenario produces a negative monthly balance.</p>}
      <DataTable caption="Purchase and monthly cash flow" headings={['Measure', 'Illustrative value']} rows={housingRows(result)} />
      {result.emergencyMonths.value === null && <p>{result.emergencyMonths.reason}</p>}
      <TaxNote tax={tax.value} />
      <ComparisonChart title="Mortgage payments over the full term" values={[
        { label: 'Principal repaid', value: result.mortgage.principalRepaid.value },
        { label: 'Interest paid', value: result.mortgage.totalInterest.value },
      ]} />
      {sensitivities.length > 0 && <DataTable caption="Alternative interest rates" headings={['Annual rate', 'Monthly repayment', 'Total interest', 'Monthly disposable']}
        rows={sensitivities.map(({ rate, scenario }, index) => [
          `Scenario ${index + 1} · ${quantity(rate.value * 100, '%')}`,
          scenario.value ? money(scenario.value.mortgage.monthlyPayment.value) : scenario.reason,
          money(scenario.value?.mortgage.totalInterest.value ?? null), money(scenario.value?.monthlyDisposable.value ?? null),
        ])} />}
    </>,
  };
}

function waitingReport(form: FormData): ModelReport | string {
  const months = readNumber(form, 'wait');
  const settings = readTax(form);
  const futureSettings = readTax(form, 'future-', addMonths(settings.effectiveDate ?? '', months));
  const outcome = compareBuyNowVsWait({
    current: { ...readBudget(form), price: readNumber(form, 'price'), savings: readNumber(form, 'savings'),
      termMonths: readNumber(form, 'term'), tax: settings },
    future: { ...readBudget(form, 'future-'), tax: futureSettings },
    waitMonths: months, monthlySavingsAfterRent: readNumber(form, 'after-rent'), monthlyRent: readNumber(form, 'rent'),
    priceChange: (readNumber(form, 'price-change') ?? 0) / 100,
  });
  if (outcome.value === null) return outcome.reason;
  const { now, afterWaiting, waitingPeriodCashOutflowContext } = outcome.value;
  const future = afterWaiting.scenario;
  const presentRows = new Map(now.value ? housingRows(now.value) : []);
  const futureRows = new Map(future.value ? housingRows(future.value) : [
    ['Property price', money(afterWaiting.price.value)], ['Available savings', money(afterWaiting.savings.value)],
  ]);
  const measures = new Set([...presentRows.keys(), ...futureRows.keys()]);
  return {
    inputs: [...inputRows(form, [...loan, savings, ...budget, ...waiting]), ...taxInputs(settings),
      ...inputRows(form, futureBudget, 'Waiting · '), ...taxInputs(futureSettings, 'Waiting · ')],
    sources: [...source(now.value?.tax, 'Current purchase'), ...source(future.value?.tax, 'After waiting')],
    formula: `Future price is current price multiplied by one plus the entered price change. Future savings add monthly savings after rent multiplied by the waiting months. ${mortgageFormula}`,
    assumptions: 'Waiting savings earn zero return. Each column uses its own tax effective date and purchase price.',
    limitations: 'The comparison shows purchase-date positions. Future property prices, rates and tax rules may change.',
    content: <>
      <p className="result-summary">Purchase-date comparison · Waiting scenario is simulated</p>
      <DataTable caption="Position on each purchase date" headings={['Measure', 'Buy now', 'Buy after waiting']}
        rows={Array.from(measures, (label) => [label, presentRows.get(label) ?? 'Not available', futureRows.get(label) ?? 'Not available'])} />
      {now.value === null ? <p>Current purchase unavailable. {now.reason}</p> : <TaxNote tax={now.value.tax} />}
      {future.value === null ? <p>Waiting purchase unavailable. {future.reason}</p> : <TaxNote tax={future.value.tax} />}
      {now.value && future.value && <ComparisonChart title="Monthly disposable income at each purchase date" values={[
        { label: 'Buy now', value: now.value.monthlyDisposable.value },
        { label: 'Buy after waiting', value: future.value.monthlyDisposable.value },
      ]} />}
      <aside className="report-notes">
        <h3>Waiting-period cash outflow context</h3>
        <p>Rent paid while waiting: {money(waitingPeriodCashOutflowContext.rentPaid.value)}. Entered monthly savings already account for rent.</p>
      </aside>
    </>,
  };
}

function rentReport(form: FormData): ModelReport | string {
  const settings = readTax(form);
  const price = readNumber(form, 'price');
  const tax = calculatePropertyTax({ ...settings, price });
  if (tax.value === null) return tax.reason;
  const rate = readNumber(form, 'rate');
  const outcome = compareRentVsBuy({
    price, deposit: readNumber(form, 'deposit'), capital: readNumber(form, 'savings'),
    monthlyResources: readNumber(form, 'resources'), initialRent: readNumber(form, 'rent'),
    monthlyOwnershipCosts: readNumber(form, 'ownership'), purchaseTax: tax.value.amount,
    buyingFees: readNumber(form, 'fees'), sellingFees: readNumber(form, 'sale-fees'),
    sellingRate: (readNumber(form, 'sale-rate') ?? 0) / 100, annualMortgageRate: rate === null ? null : rate / 100,
    mortgageTermMonths: readNumber(form, 'term'), months: readNumber(form, 'comparison'),
    annualRentGrowth: (readNumber(form, 'rent-growth') ?? 0) / 100,
    annualPropertyGrowth: (readNumber(form, 'property-growth') ?? 0) / 100,
    annualReturn: (readNumber(form, 'return') ?? 0) / 100,
  });
  if (outcome.value === null) return outcome.reason;
  const { terminal, monthlyResources, ownerUpfrontCash, cashFlows, shortfalls } = outcome.value;
  const end = terminal.value;
  const first = cashFlows[0];
  const last = cashFlows.at(-1);
  return {
    inputs: [...inputRows(form, [...loan, ...rentalBudget, ...rentalAssumptions]), ...taxInputs(settings)],
    sources: source(tax.value),
    formula: 'Each path invests its unused monthly resources at month end. Opening balances earn the monthly equivalent of the annual return. Owner position is property value less mortgage balance and sale costs, plus investments. Renter position is the investment balance.',
    assumptions: 'Both paths start with equal capital and monthly resources. Leaving resources blank uses the highest monthly housing cost on either path. Maintenance, insurance and service charges are held constant in nominal terms.',
    limitations: 'Monthly rent growth smooths changes that typically occur at annual reviews. Returns are illustrative and exclude investment tax, fees and risk unless included in the entered return.',
    content: <>
      <p className="result-summary">Modelled financial positions</p>
      <TaxNote tax={tax.value} />
      <p>Owner upfront cash <strong>{money(ownerUpfrontCash.value)}</strong> · Monthly resources <strong>{money(monthlyResources.value)}</strong>{monthlyResources.kind === 'assumption' && ' (peak-cost assumption)'}</p>
      {first && last && <DataTable caption="Monthly housing cash flow" headings={['Month', 'Rent', 'Mortgage payment', 'Total ownership cost']}
        rows={(first === last ? [first] : [first, last]).map((row) => [
          String(row.month), money(row.rent.value), money(row.repayment.value), money(row.ownerCost.value),
        ])} />}
      <details className="no-print"><summary>All monthly housing costs</summary>
        <DataTable caption="Month-by-month housing costs" headings={['Month', 'Rent', 'Mortgage payment', 'Total ownership cost']}
          rows={cashFlows.map((row) => [String(row.month), money(row.rent.value), money(row.repayment.value), money(row.ownerCost.value)])} />
      </details>
      {end ? <>
        <ComparisonChart title="End-of-period positions" values={[
          { label: 'Owner', value: end.ownerPosition.value }, { label: 'Renter', value: end.renterPosition.value },
        ]} />
        <DataTable caption="Costs and balances" headings={['Measure', 'Illustrative value']} rows={[
          ['Owner position minus renter position', money(end.difference.value)], ['Cumulative rent', money(end.cumulativeRent.value)],
          ['Owner cash outflow', money(end.ownerCashOutflow.value)], ['Non-recoverable ownership costs', money(end.ownerNonRecoverableCosts.value)],
          ['Total mortgage payments', money(end.mortgagePayments.value)], ['Mortgage principal repaid', money(end.principalPaid.value)],
          ['Mortgage interest paid', money(end.mortgageInterest.value)], ['Outstanding mortgage', money(end.remainingMortgage.value)],
          ['Property value', money(end.propertyValue.value)], ['Property equity before sale', money(end.equity.value)],
          ['Selling costs', money(end.sellingCosts.value)], ['Recurring ownership costs', money(end.ownershipCosts.value)],
          ['Owner savings and investments', money(end.ownerSavings.value)], ['Renter savings and investments', money(end.renterSavings.value)],
        ]} />
      </> : <p className="notice">{terminal.reason}</p>}
      {shortfalls.length > 0 && <DataTable caption="Funding shortfalls" headings={['Period and path', 'Amount']}
        rows={shortfalls.map(({ month, path, amount }) => [`${month === 0 ? 'At purchase' : `Month ${month}`} · ${path}`, money(amount.value)])} />}
    </>,
  };
}

export function HomeOwnership({ tool, location, nation }: { tool: OwnershipTool; location: string; nation?: string }) {
  const [submitted, setSubmitted] = useState<{ model: ModelReport; generated: string; location: string } | null>(null);
  const [error, setError] = useState('');
  const { title, intro } = tools[tool];

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const model = (tool === 'home-ownership' ? mortgageReport : tool === 'buy-now-vs-wait' ? waitingReport : rentReport)(form);
    setError(typeof model === 'string' ? model : '');
    setSubmitted(typeof model === 'string' ? null : { model, generated: reportDate(), location });
  }

  return <section className="model-page">
    <div className="tool-intro"><p className="eyebrow">Home Ownership</p><h1 tabIndex={-1}>{title}</h1><p className="lede">{intro}</p>
      <p className="hint">Location context · {location}</p>
      <nav className="tool-switch" aria-label="Home ownership tools">
        {Object.entries(tools).map(([key, item]) => <a key={key} href={`#${key}`} aria-current={tool === key ? 'page' : undefined}>{item.title}</a>)}
      </nav>
    </div>
    <form className="calculator model-form no-print" autoComplete="off" onSubmit={calculate} onReset={() => { setSubmitted(null); setError(''); }}>
      <FieldGroup name="Property and mortgage"><NumberFields fields={tool === 'rent-vs-buy' ? loan : [...loan, savings]} /></FieldGroup>
      <TaxFields nation={nation} includeDate />
      {tool === 'rent-vs-buy' ? <>
        <FieldGroup name="Capital and costs"><NumberFields fields={rentalBudget} />
          <p className="hint">Leave common monthly resources blank to use the peak housing cost across both paths.</p>
        </FieldGroup>
        <details className="advanced"><summary>Growth and return assumptions</summary><NumberFields fields={rentalAssumptions} /></details>
      </> : <>
        <FieldGroup name={tool === 'buy-now-vs-wait' ? 'Current purchase budget' : 'Purchase and monthly budget'}>
          <NumberFields fields={budget} /><p className="hint">Include maintenance, insurance, service charges and ground rent where applicable in ownership costs. Enter £0 where a cost does not apply.</p>
        </FieldGroup>
        {tool === 'buy-now-vs-wait' ? <>
          <FieldGroup name="Waiting period"><NumberFields fields={waiting} /></FieldGroup>
          <FieldGroup name="Future purchase budget"><NumberFields fields={futureBudget} /></FieldGroup>
          <TaxFields prefix="future-" nation={nation} includeDate={false} />
        </> : <details className="advanced"><summary>Alternative mortgage rates</summary><NumberFields fields={alternatives} /></details>}
      </>}
      <FormButtons />
      {error && <p className="notice" role="alert">{error}</p>}
    </form>
    {submitted && <Report title={title} location={submitted.location} generated={submitted.generated}
      inputs={submitted.model.inputs} sources={submitted.model.sources} formula={<p>{submitted.model.formula}</p>}
      assumptions={submitted.model.assumptions} limitations={submitted.model.limitations}>{submitted.model.content}</Report>}
  </section>;
}
