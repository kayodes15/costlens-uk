import type { InflationInput } from '../domain/inflation';

export interface Location { areaCode: string; name: string; nation: string }
export type SelectedLocation = Location | { areaCode: null; name: string; nation: string };

interface Observation {
  areaCode: string;
  period: string;
  value: number | null;
  missingReason?: string;
}

interface RentObservation extends Observation { name: string; bedrooms: string }
export interface RentalArea { code: string; name: string }
interface BrmaMatch { areaCode: string; bestMatch: RentalArea; areas: RentalArea[] }

export interface Source {
  name: string;
  sourceOrganisation: string;
  sourceUrl: string;
  publicationDate: string;
  retrievedAt: string;
  statisticalDefinition: string;
  knownLimitations: string;
  stalenessBasis: 'publicationDate' | 'retrievedAt';
  staleAfterDays: number;
}

type DatasetId = 'cpih' | 'cpi' | 'cpih-annual-rate' | 'cpi-annual-rate' | 'bank-rate' | 'quoted-mortgage-rate' | 'house-prices' | 'private-rents' | 'earnings' | 'ni-earnings';

export interface Economy {
  sources: Partial<Record<DatasetId, Source>>;
  locations: Location[];
  brmas: BrmaMatch[];
  rents: RentObservation[];
  observations: Partial<Record<Exclude<DatasetId, 'private-rents'>, Observation[]>>;
  errors: string[];
}

export const emptyEconomy: Economy = { sources: {}, locations: [], brmas: [], rents: [], observations: {}, errors: [] };

export async function loadEconomy(signal: AbortSignal): Promise<Economy> {
  const errors: string[] = [];
  async function read<T>(file: string): Promise<T | undefined> {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/${file}.json`, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as T;
    } catch {
      errors.push(file);
      return undefined;
    }
  }
  const [manifest, locations, brmas, rents, cpih, cpi, cpihRate, cpiRate, bank, quoted, housePrices, earnings, niEarnings] = await Promise.all([
    read<{ datasets: Economy['sources'] }>('manifest'),
    read<Location[]>('locations'),
    read<BrmaMatch[]>('brma-mapping'),
    read<RentObservation[]>('private-rents'),
    read<Observation[]>('cpih'),
    read<Observation[]>('cpi'),
    read<Observation[]>('cpih-annual-rate'),
    read<Observation[]>('cpi-annual-rate'),
    read<Observation[]>('bank-rate'),
    read<Observation[]>('quoted-mortgage-rate'),
    read<Observation[]>('house-prices'),
    read<Observation[]>('earnings'),
    read<Observation[]>('ni-earnings'),
  ]);

  return {
    sources: manifest?.datasets ?? {}, locations: locations ?? [], brmas: brmas ?? [], rents: rents ?? [], errors,
    observations: { cpih, cpi, 'cpih-annual-rate': cpihRate, 'cpi-annual-rate': cpiRate, 'bank-rate': bank, 'quoted-mortgage-rate': quoted, 'house-prices': housePrices, earnings, 'ni-earnings': niEarnings },
  };
}

export function inflationObservations(data: Economy): InflationInput['observations'] {
  const entries: InflationInput['observations'] = {};
  for (const [name, key] of [['CPIH', 'cpih'], ['CPI', 'cpi']] as const) {
    const series = data.observations[key];
    const source = data.sources[key];
    if (!series || !source) continue;
    entries[name] = Object.fromEntries(series.map((row) => [
      row.period,
      row.value === null ? null : { value: row.value, kind: 'published' as const, source: source.sourceUrl },
    ]));
  }
  return entries;
}

export function latestObservation(rows: Observation[] | undefined, areaCode = 'K02000001') {
  return rows?.filter((row) => row.areaCode === areaCode).at(-1);
}

export function isStale(source: Source, now = Date.now()) {
  return now - Date.parse(source[source.stalenessBasis]) >= source.staleAfterDays * 86_400_000;
}

export const indexRounding = 'Calculated from the published index values (rounded to one decimal place). This may differ slightly from the ONS headline rate.';
