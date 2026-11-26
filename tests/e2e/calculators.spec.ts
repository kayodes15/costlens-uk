import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function fill(page: Page, values: Record<string, number | string>) {
  for (const [name, value] of Object.entries(values)) {
    const field = page.locator(`form.calculator [name="${name}"]`);
    if (await field.evaluate((input) => input.tagName === 'SELECT')) {
      await field.selectOption(String(value));
    } else {
      await field.fill(String(value));
    }
  }
}

async function checkAccessibility(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([]);
}

async function checkLinkBehaviour(page: Page) {
  const mismatches = await page.locator('a[href]').evaluateAll((anchors) =>
    anchors.flatMap((anchor) => {
      const href = anchor.getAttribute('href') ?? '';
      const url = new URL(href, window.location.href);
      const external = ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin;
      const notice = anchor.querySelector('.visually-hidden');
      const target = anchor.getAttribute('target');
      const rel = anchor.getAttribute('rel');
      const correct = external
        ? target === '_blank' && rel === 'noopener noreferrer' &&
          notice?.textContent === ' (opens in a new tab)' && getComputedStyle(notice).clipPath === 'inset(50%)'
        : target === null && rel === null && notice === null;
      return correct ? [] : [{ href, target, rel, notice: notice?.textContent }];
    }),
  );
  expect(mismatches).toEqual([]);
}

async function submit(page: Page) {
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const report = page.locator('.print-report');
  await expect(report).toBeVisible();
  return report;
}

async function checkReport(page: Page) {
  await checkLinkBehaviour(page);
  await checkAccessibility(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('form.calculator')).toBeHidden();
  const report = page.locator('.print-report');
  await expect(report.getByText('Scenario inputs', { exact: true })).toBeVisible();
  for (const name of ['How was this calculated?', 'Assumptions', 'Limitations', 'Sources']) {
    await expect(report.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await expect(report.getByRole('link', { name: 'CostLens UK methodology v1.1 (opens in a new tab)', exact: true })).toBeVisible();
  await expect(report.getByText(/does not constitute financial, tax or mortgage advice/)).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
}

async function replayIndex(page: Page, endValue: number) {
  await page.route('**/data/cpih.json', (route) => route.fulfill({ json: [
    { areaCode: 'K02000001', period: '2025-10', value: 100 },
    { areaCode: 'K02000001', period: '2025-12', value: 103 },
    { areaCode: 'K02000001', period: '2026-10', value: endValue },
  ] }));
}

test('homepage and local BRMA coverage', async ({ page }) => {
  await page.goto('/');
  const snapshot = page.getByRole('region', { name: 'Your economic snapshot' });
  await expect(snapshot.getByText('£272,642')).toBeVisible();
  await checkAccessibility(page);
  await page.getByRole('combobox', { name: 'Nation' }).selectOption('Northern Ireland');
  await page.getByRole('searchbox').fill('Belfast');
  await page.getByRole('combobox', { name: 'Local authority' }).selectOption({ label: 'Belfast' });
  const rent = snapshot.locator('article').filter({ has: page.getByRole('heading', { name: 'Average private rent' }) });
  await expect(rent).toContainText('Belfast BRMA');
  await rent.getByText('Source and dates').click();
  await expect(rent).toContainText('2026-08');
  await expect(snapshot).not.toContainText(/NBRMA[1-8]/);
  const earnings = snapshot.locator('article').filter({ has: page.getByRole('heading', { name: 'Median gross full-time pay' }) });
  // NISRA ASHE 2026 Table 8 (NI).7a, Full-Time, Belfast median is £38,403.90.
  await expect(earnings).toContainText('£38,404');
  await earnings.getByText('Source and dates').click();
  await expect(earnings.getByRole('link', { name: 'NISRA ASHE Table 8 (NI).7a (opens in a new tab)', exact: true })).toHaveAttribute('href',
    'https://www.nisra.gov.uk/publications/ni-geographies-place-work-and-place-residence');
  await expect(earnings).toContainText('2026');
  await page.setViewportSize({ width: 375, height: 850 });
  await checkAccessibility(page);
});

test('§9 salary comparison, history and private inputs', async ({ page }) => {
  await replayIndex(page, 107);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(`${request.url()} ${request.postData() ?? ''}`));
  await page.goto('/#salary');
  await fill(page, { previous: 35000, current: 37000, start: '2025-10', end: '2026-11' });
  const report = await submit(page);
  await expect(report.getByText('£37,450.00').first()).toBeVisible();
  await expect(report.getByText('-1.20%', { exact: true })).toBeVisible();
  await expect(report.getByRole('status')).toContainText('latest published CPIH');
  await report.getByText('Historical purchasing power').click();
  await expect(report.getByRole('row', { name: /2025-11 Not available/ })).toBeVisible();
  await report.locator('details.formula > summary').click();
  await expect(report.getByRole('link', { name: 'ONS CPIH all-items index (opens in a new tab)', exact: true })).toBeVisible();
  await checkReport(page);
  expect(await page.evaluate(() => ({ search: location.search, hash: location.hash, local: localStorage.length, session: sessionStorage.length })))
    .toEqual({ search: '', hash: '#salary', local: 0, session: 0 });
  expect(requests.join('\n')).not.toMatch(/35000|37000/);
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(report).toHaveCount(0);
  await expect(page.getByLabel('Previous pay (£)')).toHaveValue('');
});

test('§9 pay rise target', async ({ page }) => {
  await replayIndex(page, 105);
  await page.goto('/#pay-rise');
  await fill(page, { current: 40000, growth: 2, start: '2025-10', end: '2026-10' });
  const report = await submit(page);
  await expect(report.getByText('£42,840.00').first()).toBeVisible();
  await expect(report.getByText('7.10%', { exact: true })).toBeVisible();
  await checkReport(page);
});

test('§10 relocation current and proposed cash flow', async ({ page }) => {
  await page.goto('/#relocation');
  for (const [name, area, nation] of [['Current location', 'London', 'England'], ['Proposed location', 'Glasgow', 'Scotland']]) {
    const panel = page.getByRole('region', { name });
    await panel.getByRole('combobox', { name: 'Nation' }).selectOption(nation);
    await panel.getByText('My area isn’t listed').click();
    await panel.getByLabel('Area name').fill(area);
    await panel.getByRole('button', { name: 'Use this area' }).click();
  }
  const expenses = ['localTaxes', 'groceries', 'energy', 'water', 'transport', 'childcare', 'debt'];
  for (const prefix of ['current', 'proposed']) {
    await fill(page, Object.fromEntries(expenses.map((key) => [`${prefix}-${key}`, 0])));
  }
  await fill(page, { 'current-income': 3200, 'current-housing': 1650, 'current-other': 1000,
    'proposed-income': 2800, 'proposed-housing': 900, 'proposed-other': 950, moving: 1000 });
  await expect(page.getByText(/Scottish income tax rules/)).toBeVisible();
  const report = await submit(page);
  await expect(report).toContainText('£400.00');
  await expect(report).toContainText('£4,800.00');
  await expect(report).toContainText('2.5 months');
  await checkReport(page);
});

const home = { price: 100000, deposit: 20000, savings: 21000, rate: 0, term: 200,
  jurisdiction: 'England', 'effective-date': '2026-11-26', fees: 3000, income: 1600,
  ownership: 250, living: 900, debt: 100 };

test('§12 mortgage and purchase costs', async ({ page }) => {
  await page.goto('/#home-ownership');
  await fill(page, home);
  const report = await submit(page);
  await expect(report).toContainText('£400.00');
  await expect(report).toContainText('-£2,000.00');
  await expect(report).toContainText('-£50.00');
  await checkReport(page);
});

test('§13 Buy Now vs Wait recalculates tax and reports rent separately', async ({ page }) => {
  await page.goto('/#buy-now-vs-wait');
  await fill(page, { ...home, price: 240000, savings: 30000, term: 240, fees: 2000,
    income: 2000, ownership: 100, living: 500, debt: 50,
    wait: 12, 'after-rent': 500, rent: 800, 'price-change': 5,
    'future-deposit': 25000, 'future-rate': 0, 'future-fees': 2000, 'future-income': 2100,
    'future-ownership': 100, 'future-living': 500, 'future-debt': 50, 'future-jurisdiction': 'England' });
  const report = await submit(page);
  await expect(report.getByRole('row', { name: /Purchase tax £2,300.00 £2,600.00/ })).toBeVisible();
  await expect(report).toContainText('£9,600.00');
  await expect(report).toContainText('later than the rules check');
  await checkReport(page);
});

test('§14 Rent vs Buy checks affordability and compares equal resources', async ({ page }) => {
  await page.goto('/#rent-vs-buy');
  await fill(page, { price: 1200, deposit: 200, rate: 0, term: 10, jurisdiction: 'England',
    'effective-date': '2026-11-26', savings: 200, resources: 90, rent: 80,
    comparison: 2, ownership: 0, fees: 0, 'sale-fees': 0 });
  const report = await submit(page);
  await expect(report).toContainText('The initial capital or monthly resources are insufficient.');
  await fill(page, { resources: 150 });
  await submit(page);
  await expect(report.getByRole('row', { name: /Owner £500.00/ })).toBeVisible();
  await expect(report.getByRole('row', { name: /Renter £340.00/ })).toBeVisible();
  await checkReport(page);
});

test('About shows locally hosted portraits in team order', async ({ page }) => {
  await page.goto('/#about');
  const team = page.getByRole('region', { name: 'Meet the team' });
  const portraits = team.getByRole('img');
  await expect(portraits).toHaveCount(2);
  await expect(portraits.nth(0)).toHaveAccessibleName('Bilkisu Ibrahim');
  await expect(portraits.nth(1)).toHaveAccessibleName('Samuel Aikulola');
  await expect(team.getByRole('listitem').nth(0)).toContainText('Co-author');
  await expect(team.getByRole('listitem').nth(1)).toContainText('Co-author');
  for (const portrait of await portraits.all()) {
    await portrait.scrollIntoViewIfNeeded();
    await expect(portrait).toHaveCSS('aspect-ratio', '4 / 5');
    await expect.poll(() => portrait.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(520);
    expect(await portrait.getAttribute('style')).toBeNull();
  }
  await checkAccessibility(page);
});

test('external links announce a new tab and internal links keep their default behaviour', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'GitHub (opens in a new tab)', exact: true })).toHaveCount(2);
  await expect(page.locator('a[href="#salary"]').first()).toBeVisible();
  await expect(page.locator('.snapshot a[href^="https:"]').first()).toBeAttached();
  await checkLinkBehaviour(page);

  for (const [route, name] of [
    ['about', 'source register'],
    ['methodology', 'CostLens UK methodology v1.1'],
    ['privacy', 'Cloudflare’s privacy policy'],
  ]) {
    await page.goto('/#' + route);
    await expect(page.getByRole('link', { name: name + ' (opens in a new tab)', exact: true })).toBeVisible();
    if (route === 'privacy') await expect(page.locator('a[href^="mailto:"]')).toHaveCount(2);
    await checkLinkBehaviour(page);
  }
});

test('information pages and keyboard navigation', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  for (const [route, title] of [['privacy', 'Privacy'], ['about', 'About CostLens UK'],
    ['disclaimer', 'Financial information disclaimer'], ['methodology', 'Methodology']]) {
    await page.goto('/#' + route);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    if (route === 'privacy') {
      await expect(page.getByText(/operated by Bilkisu Ibrahim and Samuel Aikulola/)).toBeVisible();
      for (const email of ['ibilkisu072@gmail.com', 'samuelaikulola@gmail.com']) {
        await expect(page.getByRole('link', { name: email })).toHaveAttribute('href', 'mailto:' + email);
      }
      await expect(page.getByText(/When you visit CostLens UK, Cloudflare handles web requests/)).toBeVisible();
    }
    await checkAccessibility(page);
  }
});

test('mobile menu navigation shows the sticky header and focuses the page heading', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto('/');
  const header = page.getByRole('banner');
  const menu = page.getByRole('navigation', { name: 'Main navigation' });
  const heading = page.getByRole('main').getByRole('heading', { level: 1 });

  for (const route of ['salary', 'relocation', 'home-ownership', 'economic-insights', 'about', 'methodology', 'home']) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => header.evaluate((element) => element.getBoundingClientRect().top)).toBe(0);
    await menu.locator(`a[href="#${route}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#${route}$`));
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(header).toBeInViewport({ ratio: 1 });
    const headerBox = await header.boundingBox();
    const headingBox = await heading.boundingBox();
    expect(headerBox!.height).toBeLessThan(140);
    expect(headingBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
  }

  await menu.getByRole('link', { name: 'Salary & Pay Rise' }).focus();
  await page.keyboard.press('Enter');
  await expect(heading).toBeFocused();
  const payComparison = page.getByRole('link', { name: 'Pay comparison' });
  await page.keyboard.press('Tab');
  await expect(payComparison).toBeFocused();
  await page.evaluate(() => window.scrollBy(0, 320));
  await page.keyboard.press('Tab');
  const payRise = page.getByRole('link', { name: 'Pay rise target' });
  await expect(payRise).toBeFocused();
  await expect.poll(() => payRise.evaluate((element) =>
    element.getBoundingClientRect().top - document.querySelector('.site-header')!.getBoundingClientRect().bottom,
  )).toBeGreaterThanOrEqual(0);
  await checkAccessibility(page);
});

test('serves the linked site icons and web manifest', async ({ page }) => {
  await page.goto('/');
  for (const [selector, file, size] of [
    ['link[rel="icon"][sizes="any"]', 'favicon.svg', 0],
    ['link[rel="icon"][sizes="32x32"]', 'favicon-32x32.png', 32],
    ['link[rel="apple-touch-icon"]', 'apple-touch-icon.png', 180],
  ] as const) {
    const link = page.locator(selector);
    await expect(link).toHaveAttribute('href', '/' + file);
    const response = await page.request.get('/' + file);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain(size ? 'image/png' : 'image/svg+xml');
    const dimensions = await link.evaluate(async (element: HTMLLinkElement) => {
      const image = new Image();
      image.src = element.href;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    });
    expect(dimensions).toEqual(size ? [size, size] : [150, 150]);
  }

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/site.webmanifest');
  const manifest = await page.request.get('/site.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({
    name: 'CostLens UK',
    icons: [
      { src: 'favicon.svg', sizes: 'any' },
      { src: 'favicon-32x32.png', sizes: '32x32' },
      { src: 'apple-touch-icon.png', sizes: '180x180' },
    ],
  });
});
