import { useState, type FormEvent } from 'react';
import { ExternalLink } from './ExternalLink';
import { isStale, latestObservation, type Economy, type SelectedLocation, type Source } from '../data/economy';

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const enteredMoney = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const percent = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Europe/London' });

function formatDate(value: string) {
  return date.format(new Date(value));
}

interface Indicator {
  key: string;
  label: string;
  value?: number | null;
  reference?: string;
  coverage: string;
  source?: Source;
  unit?: '%';
  suffix?: string;
  manual?: boolean;
}

function IndicatorCard({ item, loading }: { item: Indicator; loading: boolean }) {
  const [manual, setManual] = useState<number | null>(null);
  const published = item.source ? item.value : null;
  const value = published ?? manual;
  const display = value === null ? (loading ? 'Loading…' : 'Not available')
    : item.unit === '%' ? `${percent.format(value)}%` : (published == null ? enteredMoney : money).format(value);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = new FormData(event.currentTarget).get('manual');
    if (typeof raw === 'string' && raw.trim() && Number.isFinite(Number(raw)) && Number(raw) >= 0) {
      setManual(Number(raw));
    }
  }

  return (
    <article className="indicator">
      <h3>{item.label}</h3>
      <p className="indicator-value">{display}{value !== null && item.suffix && <span>{item.suffix}</span>}</p>
      <p className="indicator-coverage">{item.coverage}</p>
      {published != null && item.source ? (
        <details>
          <summary>Source and dates</summary>
          <dl className="metadata">
            <dt>Source</dt><dd><ExternalLink href={item.source.sourceUrl}>{item.source.name}</ExternalLink></dd>
            <dt>Reference period</dt><dd>{item.reference}</dd>
            <dt>Published</dt><dd>{formatDate(item.source.publicationDate)}</dd>
            <dt>Coverage</dt><dd>{item.coverage}</dd>
            <dt>Last refresh</dt><dd>{formatDate(item.source.retrievedAt)}</dd>
          </dl>
          <p>{item.source.knownLimitations}</p>
        </details>
      ) : !loading && item.manual && (
        <details>
          <summary>{manual === null ? 'Enter a value' : 'Edit your entry'}</summary>
          <form onSubmit={save}>
            <label>{item.label} (£)<input name="manual" required min="0" step="0.01" type="number" defaultValue={manual ?? ''} /></label>
            <button className="button secondary" type="submit">Use value</button>
          </form>
        </details>
      )}
      {published == null && manual !== null && <p className="entry-label" role="status">Your entry</p>}
      {published != null && item.source && isStale(item.source) && <p className="notice">This dataset is due a refresh.</p>}
    </article>
  );
}

export function EconomicSnapshot({ data, location, loading }: {
  data: Economy; location: SelectedLocation | null; loading: boolean;
}) {
  const area = location ? location.areaCode : 'K02000001';
  const place = location?.name ?? 'United Kingdom';
  const mapping = data.brmas.find((row) => row.areaCode === area);
  const [selectedBrma, setSelectedBrma] = useState('');
  const brma = mapping?.areas.find((row) => row.code === selectedBrma) ?? mapping?.bestMatch;
  const brmaNation = location?.nation === 'Scotland' || location?.nation === 'Northern Ireland';
  const rentCode = brmaNation ? brma?.code : area;
  const rent = data.rents.find((row) => row.areaCode === rentCode && row.bedrooms === 'all');
  const house = area ? latestObservation(data.observations['house-prices'], area) : undefined;
  const earningsDataset = area?.startsWith('N09') ? 'ni-earnings' : 'earnings';
  const earnings = area ? latestObservation(data.observations[earningsDataset], area) : undefined;
  const bank = latestObservation(data.observations['bank-rate']);
  const quoted = latestObservation(data.observations['quoted-mortgage-rate']);
  const cpih = latestObservation(data.observations['cpih-annual-rate']);
  const cpi = latestObservation(data.observations['cpi-annual-rate']);

  const items: Indicator[] = [
    { key: 'house', label: 'Average house price', value: house?.value, reference: house?.period, coverage: place, source: data.sources['house-prices'], manual: true },
    { key: rentCode ?? 'rent', label: 'Average private rent', value: rent?.value, reference: rent?.period, coverage: brma ? `${brma.name} BRMA` : place, source: data.sources['private-rents'], suffix: '/ month', manual: true },
    { key: 'earnings', label: 'Median gross full-time pay', value: earnings?.value, reference: earnings?.period, coverage: place, source: data.sources[earningsDataset], suffix: '/ year', manual: true },
    { key: 'inflation', label: 'Annual inflation · CPIH', value: cpih?.value, reference: cpih?.period, coverage: 'United Kingdom', source: data.sources['cpih-annual-rate'], unit: '%' },
    { key: 'cpi', label: 'Annual inflation · CPI', value: cpi?.value, reference: cpi?.period, coverage: 'United Kingdom', source: data.sources['cpi-annual-rate'], unit: '%' },
    { key: 'bank', label: 'Bank Rate', value: bank?.value, reference: bank?.period, coverage: 'United Kingdom', source: data.sources['bank-rate'], unit: '%' },
    { key: 'quoted', label: 'Quoted mortgage rate', value: quoted?.value, reference: quoted?.period, coverage: 'UK · two-year fixed, 75% LTV', source: data.sources['quoted-mortgage-rate'], unit: '%' },
  ];

  return (
    <section className="snapshot" aria-labelledby="snapshot-heading">
      <div className="section-heading">
        <div><p className="eyebrow">Economic insights</p><h2 id="snapshot-heading">Your economic snapshot</h2></div>
        <p className="location-name">{location ? `${location.name} · ${location.nation}` : place}</p>
      </div>
      {data.errors.length > 0 && <p role="status" className="notice">Some official data could not be loaded. Available indicators are shown below.</p>}
      {mapping && mapping.areas.length > 1 && (
        <label className="brma-control">Rental market area
          <select value={brma?.code} onChange={(event) => setSelectedBrma(event.target.value)}>
            {mapping.areas.map((row) => <option key={row.code} value={row.code}>{row.name}{row.code === mapping.bestMatch.code ? ' (ONS best match)' : ''}</option>)}
          </select>
        </label>
      )}
      <div className="snapshot-grid">{items.map((item) => <IndicatorCard key={item.key} item={item} loading={loading} />)}</div>
    </section>
  );
}
