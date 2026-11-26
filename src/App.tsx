import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink } from './components/ExternalLink';
import { EconomicSnapshot } from './components/EconomicSnapshot';
import { LocationPicker } from './components/LocationPicker';
import { emptyEconomy, loadEconomy, type SelectedLocation } from './data/economy';
import { Salary } from './pages/Salary';
import { HomeOwnership, type OwnershipTool } from './pages/HomeOwnership';
import { Relocation } from './pages/Relocation';
import { InformationPage, isInformationPage } from './pages/Information';

const repository = 'https://github.com/kayodes15/costlens-uk';
const navigation = [
  ['home', 'Home'], ['salary', 'Salary & Pay Rise'], ['relocation', 'Relocation'],
  ['home-ownership', 'Home Ownership'], ['economic-insights', 'Economic Insights'],
  ['about', 'About'], ['methodology', 'Methodology'],
] as const;
const pages = new Set<string>([...navigation.map(([id]) => id), 'pay-rise', 'buy-now-vs-wait', 'rent-vs-buy', 'privacy', 'disclaimer']);

function readPage() {
  const name = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
  return pages.has(name) ? name : 'home';
}

function HomeTools() {
  return (
    <>
      <section className="tools" aria-labelledby="tools-heading">
        <div className="section-heading"><div><p className="eyebrow">Decision tools</p><h2 id="tools-heading">What are you weighing up?</h2></div></div>
        <div className="tool-grid">
          <article><h3>Salary &amp; Pay Rise</h3><p>Check your purchasing power or calculate a target for your next pay review.</p><a href="#salary">Explore salary tools</a></article>
          <article><h3>Relocation</h3><p>Compare living costs and take-home pay across two places.</p><a href="#relocation">View relocation</a></article>
          <article><h3>Home Ownership</h3><p>Explore the costs of buying, waiting or continuing to rent.</p><a href="#home-ownership">View home ownership</a></article>
        </div>
      </section>
      <aside className="trust">
        <h2>Independent by design</h2>
        <p>CostLens UK is free and built with open-source code and official economic data. There’s no registration. Your financial calculations stay in your browser.</p>
      </aside>
    </>
  );
}

export function App() {
  const [page, setPage] = useState(readPage);
  const [data, setData] = useState(emptyEconomy);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const main = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);
  const previousPage = useRef(page);

  useEffect(() => {
    const controller = new AbortController();
    void loadEconomy(controller.signal).then((result) => {
      if (!controller.signal.aborted) {
        setData(result);
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const navigate = () => setPage(readPage());
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);

  useLayoutEffect(() => {
    if (previousPage.current !== page) {
      window.scrollTo(0, 0);
      main.current?.querySelector('h1')?.focus({ preventScroll: true });
      previousPage.current = page;
    }
  }, [page]);

  useLayoutEffect(() => {
    const element = header.current;
    if (!element) return;

    const root = document.documentElement;
    const updateScrollPadding = () => {
      root.style.setProperty('--sticky-header-height', `${element.getBoundingClientRect().height}px`);
    };
    const observer = new ResizeObserver(updateScrollPadding);
    updateScrollPadding();
    observer.observe(element, { box: 'border-box' });
    return () => {
      observer.disconnect();
      root.style.removeProperty('--sticky-header-height');
    };
  }, []);

  const selected = location;
  const salary = page === 'salary' || page === 'pay-rise';
  const ownership = page === 'home-ownership' || page === 'buy-now-vs-wait' || page === 'rent-vs-buy';
  const locationLabel = selected ? `${selected.name}, ${selected.nation}` : 'United Kingdom';
  const locationKey = JSON.stringify(selected);
  return (
    <>
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); main.current?.focus(); }}>Skip to content</a>
      <header className="site-header" ref={header}>
        <div className="wrap header-inner">
          <a className="brand" href="#home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>CostLens <span>UK</span></a>
          <nav aria-label="Main navigation">
            {navigation.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={page === id || (id === 'salary' && salary) || (id === 'home-ownership' && ownership) ? 'page' : undefined}>{label}</a>)}
            <ExternalLink href={repository}>GitHub</ExternalLink>
          </nav>
        </div>
        {page !== 'home' && page !== 'economic-insights' && (
          <details className="wrap header-location">
            <summary>Location: {locationLabel}</summary>
            <LocationPicker locations={data.locations} selected={selected} loading={loading} onSelect={setLocation} />
          </details>
        )}
      </header>

      <main id="main-content" ref={main} tabIndex={-1}>
        {page === 'home' && (
          <section className="hero">
            <div className="wrap hero-inner">
              <div>
                <p className="eyebrow">Cost of living in the UK</p>
                <h1 tabIndex={-1}>Make life’s biggest financial decisions with confidence.</h1>
                <p className="hero-copy">Understand your salary, compare living costs and explore home ownership with transparent, evidence-based financial tools.</p>
                <a className="button" href="#salary">Check your pay</a>
              </div>
              <LocationPicker locations={data.locations} selected={selected} loading={loading} onSelect={setLocation} />
            </div>
          </section>
        )}
        <div className="wrap page-body">
          {page === 'economic-insights' && (
            <div className="insights-heading"><h1 tabIndex={-1}>Economic insights</h1><LocationPicker locations={data.locations} selected={selected} loading={loading} onSelect={setLocation} /></div>
          )}
          {(page === 'home' || page === 'economic-insights') && <EconomicSnapshot key={locationKey} data={data} location={selected} loading={loading} />}
          {page === 'home' && <HomeTools />}
          {salary && <Salary key={page} mode={page === 'salary' ? 'comparison' : 'target'} data={data} location={locationLabel} loading={loading} />}
          {page === 'relocation' && <Relocation data={data} selected={selected} loading={loading} />}
          {ownership && <HomeOwnership key={page} tool={page as OwnershipTool} location={locationLabel} nation={selected?.nation} />}
          {isInformationPage(page) && <InformationPage page={page} />}
        </div>
      </main>
      <footer className="site-footer">
        <div className="wrap footer-inner">
          <div><strong>CostLens UK</strong><p>Development preview</p></div>
          <nav aria-label="Footer navigation">
            <ExternalLink href={`${repository}/blob/main/docs/DATA-SOURCES.md`}>Data sources</ExternalLink>
            <a href="#methodology">Methodology</a><a href="#privacy">Privacy</a><a href="#disclaimer">Disclaimer</a>
            <ExternalLink href={repository}>GitHub</ExternalLink><ExternalLink href={`${repository}/issues`}>Feedback</ExternalLink>
          </nav>
        </div>
      </footer>
    </>
  );
}
