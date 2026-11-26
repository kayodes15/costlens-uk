# CostLens UK

Test your decisions before you make them.

CostLens UK provides UK economic statistics and calculators for salary, pay rises, relocation and home ownership. It processes financial inputs on your device.

Production address for the public release: [costlens.samuelaikulola.com](https://costlens.samuelaikulola.com).

Run the acceptance checks from the repository root with Node.js 22.12 or later, npm and Google Chrome.

```sh
npm ci && npm run test && npm run lint && npm run test:e2e
```

Use `npm run dev` for local development or `npm run build` to generate the static site in `dist/`. The Playwright suite builds the site and includes axe accessibility checks. See the [pipeline guide](pipelines/README.md) for Python setup and tests.

The React interface and data loaders live in `src/`, with the calculation engine in `src/domain/`. The Python pipeline in `pipelines/` validates publisher data and writes the static files in `public/data/`.

- [Release notes](docs/PROGRESS.md)
- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)
- [Financial methodology](docs/METHODOLOGY.md)
- [Independent financial cases](docs/TEST-CASES.md)
- [Data sources and reuse](DATA-LICENSES.md)
- [Refresh the official datasets](pipelines/README.md)
- [Release checklist](docs/RELEASE-CHECKLIST.md)

Software is licensed under [MIT](LICENSE).
