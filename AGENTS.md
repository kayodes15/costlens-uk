# CostLens UK contributor guide

## 1. Product scope

CostLens UK provides UK economic statistics and illustrative financial comparisons. Financial inputs and results stay in the browser.

The following additions require prior approval from the project owner and a new regulatory assessment:

- Adverts, sponsorship or income.
- Affiliate or referral links.
- Named mortgage products, lenders, brokers or investments.
- Links or introductions to lenders, brokers or advisers.
- Applications, quotes or eligibility decisions.
- Wording such as “you should”, “you qualify”, “best mortgage” or “FCA approved”.
- Server-side collection of financial inputs.

## 2. Changes and checks

- Read [CONTRIBUTING.md](CONTRIBUTING.md) and inspect the relevant code before editing. Keep pull requests focused and include test results and rollback instructions.
- Keep calculation logic in `src/domain/`. For changes to calculations, document the conventions in the [methodology](docs/METHODOLOGY.md) and check expected values against independent arithmetic or official examples in the [test cases](docs/TEST-CASES.md).
- Use same-series index ratios for cumulative inflation, disclose the latest available reference month, and keep gross and net values separate. Preserve missing values as null with a reason. Round for display, except where the applicable published rules require another convention.
- Verify tax rules and effective dates with the issuing authority. Check dataset reuse and attribution before adding sources, and preserve the last validated data when a refresh fails.
- Run the relevant checks listed in the [README](README.md), including browser and accessibility checks for interface changes. Use fictional inputs in tests, screenshots and reports.
