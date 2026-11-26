import { methodologyUrl } from '../components/Report';
import { ExternalLink } from '../components/ExternalLink';

const repository = 'https://github.com/kayodes15/costlens-uk';
const titles = {
  about: 'About CostLens UK',
  methodology: 'Methodology',
  privacy: 'Privacy',
  disclaimer: 'Financial information disclaimer',
};

export function isInformationPage(page: string): page is keyof typeof titles {
  return Object.hasOwn(titles, page);
}

export function InformationPage({ page }: { page: keyof typeof titles }) {
  return <article className="info-page information">
    <h1>{titles[page]}</h1>
    {page === 'about' && <>
      <p>CostLens UK is a free, independent project for comparing pay, relocation budgets and home ownership scenarios across the UK.</p>
      <h2>Data and code</h2>
      <p>The tools use official statistics from the Office for National Statistics, the Bank of England and UK house price publishers. Property tax rules link to the relevant tax authority. The software is MIT licensed.</p>
      <p>See the <ExternalLink href={`${repository}/blob/main/docs/DATA-SOURCES.md`}>source register</ExternalLink> for coverage, licences and attribution. To report an issue, use the <ExternalLink href={`${repository}/issues`}>project issue tracker</ExternalLink> with fictional inputs.</p>
      <section className="about-team" aria-labelledby="about-team-heading">
        <h2 id="about-team-heading">Meet the team</h2>
        <ul className="team-grid" role="list">
          <li className="team-card">
            <img className="team-portrait" src={`${import.meta.env.BASE_URL}team/bilkisu.jpg`}
              alt="Bilkisu Ibrahim" width={520} height={520} loading="lazy" />
            <strong>Bilkisu Ibrahim</strong>
            <span className="team-title">Co-author</span>
          </li>
          <li className="team-card">
            <img className="team-portrait" src={`${import.meta.env.BASE_URL}team/samuel.jpg`}
              alt="Samuel Aikulola" width={520} height={520} loading="lazy" />
            <strong>Samuel Aikulola</strong>
            <span className="team-title">Co-author</span>
          </li>
        </ul>
      </section>
    </>}
    {page === 'methodology' && <>
      <p>Each calculator shows how the result was calculated, the assumptions used and the relevant sources. The working follows <ExternalLink href={methodologyUrl}>CostLens UK methodology v1.1</ExternalLink>.</p>
      <h2>Pay and relocation</h2>
      <p>Pay comparisons use ratios of CPIH or CPI index observations. The economic snapshot uses the published headline rates. Relocation compares entered take-home pay after monthly expenses and treats moving costs separately.</p>
      <h2>Home ownership</h2>
      <p>Repayments are calculated as a monthly amortising loan. Buy Now vs Wait compares each purchase-date position. Rent vs Buy models equal starting resources over the same period and applies the same entered return to both paths.</p>
      <h2>Published data and estimates</h2>
      <p>Snapshot cards show source, reference period, coverage and refresh date. Results distinguish observed data, user inputs and illustrative scenarios. Local rental data can refer to a wider rental market area.</p>
    </>}
    {page === 'privacy' && <>
      <p>CostLens UK is operated by Bilkisu Ibrahim and Samuel Aikulola. For privacy questions, email <a href="mailto:ibilkisu072@gmail.com">ibilkisu072@gmail.com</a> or <a href="mailto:samuelaikulola@gmail.com">samuelaikulola@gmail.com</a>.</p>
      <p>Your financial inputs and calculation results are processed on your device and held in the current page. Reset clears the current scenario. Closing or reloading the page also clears it.</p>
      <h2>What the application requests</h2>
      <p>The site fetches its own static files and published economic datasets. It does not send scenario values with these requests or store them in cookies, localStorage or sessionStorage. The application does not use accounts, advertising or analytics.</p>
      <h2>Hosting and links</h2>
      <p>When you visit CostLens UK, Cloudflare handles web requests and may process connection information such as IP address, request times and browser details. See <ExternalLink href="https://www.cloudflare.com/privacypolicy/">Cloudflare’s privacy policy</ExternalLink>. External sites have their own policies.</p>
      <h2>Printing and sharing</h2>
      <p>Reports are generated on your device. Printed copies and saved PDFs include your entered details. Take care when choosing where to save or share them.</p>
    </>}
    {page === 'disclaimer' && <>
      <p>CostLens UK provides general financial information and illustrative comparisons. It does not provide personalised financial, mortgage, tax or investment advice.</p>
      <h2>Using the results</h2>
      <p>Results depend on the values and assumptions entered. Published data describes groups and areas and may be revised. Future prices, rates, rent and returns can change. You can check the formula, source dates and limits alongside every calculation.</p>
      <h2>Property taxes and borrowing</h2>
      <p>Automatic tax estimates cover specified purchase categories and dated rules. Check the relevant authority where your circumstances or the rules differ. Mortgage repayments are illustrative and do not represent an offer or assessment of eligibility.</p>
    </>}
  </article>;
}
