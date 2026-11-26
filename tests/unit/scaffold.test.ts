import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { App } from '../../src/App';

describe('CostLens website entry point', () => {
  it('renders the home heading and the main navigation', () => {
    const page = renderToStaticMarkup(createElement(App));
    expect(page).toContain('Make life’s biggest financial decisions with confidence.');
    expect(page).toContain('aria-label="Main navigation"');
  });
});
