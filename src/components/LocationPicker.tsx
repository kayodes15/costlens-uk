import { useId, useState, type FormEvent } from 'react';
import type { Location, SelectedLocation } from '../data/economy';

const nations = ['England', 'Scotland', 'Wales', 'Northern Ireland'];

interface Props {
  locations: Location[];
  selected: SelectedLocation | null;
  loading: boolean;
  title?: string;
  onSelect: (location: SelectedLocation | null) => void;
}

export function LocationPicker({ locations, selected, loading, onSelect, title = 'Your location' }: Props) {
  const titleId = useId();
  const [nation, setNation] = useState(selected?.nation ?? 'England');
  const [query, setQuery] = useState('');
  const [manualName, setManualName] = useState('');
  const options = locations.filter((area) =>
    area.nation === nation && area.name.toLocaleLowerCase('en-GB').includes(query.trim().toLocaleLowerCase('en-GB')),
  ).sort((first, second) => first.name.localeCompare(second.name, 'en-GB'));

  function addArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = manualName.trim();
    if (name) onSelect({ areaCode: null, name, nation });
  }

  return (
    <section className="location-panel" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      <div className="location-fields">
        <label>Nation
          <select value={nation} onChange={(event) => {
            setNation(event.target.value);
            setQuery('');
            setManualName('');
            onSelect(null);
          }}>
            {nations.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label>Search local authorities
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Enter a council name" />
        </label>
        <label>Local authority
          <select value={options.some((area) => area.areaCode === selected?.areaCode) ? selected?.areaCode ?? '' : ''}
            onChange={(event) => onSelect(options.find((area) => area.areaCode === event.target.value) ?? null)}>
            <option value="">{loading ? 'Loading local authorities…' : 'Select a local authority'}</option>
            {options.map((area) => <option key={area.areaCode} value={area.areaCode}>{area.name}</option>)}
          </select>
        </label>
      </div>
      {!loading && options.length === 0 && <p role="status">No matching local authorities. Enter your area below.</p>}
      <details>
        <summary>My area isn’t listed</summary>
        <form className="inline-form" onSubmit={addArea}>
          <label>Area name
            <input required maxLength={100} value={manualName} onChange={(event) => setManualName(event.target.value)} />
          </label>
          <button className="button secondary" type="submit">Use this area</button>
        </form>
      </details>
    </section>
  );
}
