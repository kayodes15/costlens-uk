# Financial methodology v1.1

All scenarios use nominal pounds unless a result explicitly measures real purchasing power. Rates in formulas are decimals unless multiplied by 100 for display. Keep intermediate money and balances at full precision and display money to the penny. Apply authority-specific tax rounding once verified. A missing input or unavailable result is null with a reason. Explicit zero values are allowed wherever the formula is defined. Reject non-finite inputs, values outside the supported ranges and combinations that make the arithmetic undefined. Label published inputs, user inputs, estimates, assumptions and simulated results by provenance.

## 9. Salary and pay rise

Let B and C be positive previous and current pay in the same period and gross/net mode. Let I₀ and I₁ be positive observations of the same UK index (CPIH by default, CPI on request).

- Inflation factor F = I₁ / I₀. Cumulative inflation = 100 × (F − 1)%.
- Nominal pay change = 100 × (C / B − 1)%.
- Real pay change = 100 × (C / (B × F) − 1)%.
- Required pay to maintain purchasing power Q = B × F.
- Pay gap at comparison-month prices = C − Q. With annual inputs, this is the annual gap and the monthly gap is (C − Q) / 12. With monthly inputs, the annual gap is 12 × (C − Q).
- For a negotiation with reference pay B and desired real improvement g, target pay T = Q × (1 + g). The increase is T − B and the percentage is 100 × (T / B − 1)%.

Use reference months for both dates. When the end month is newer than the latest observation, disclose the actual latest reference month and exclude subsequent inflation. Reject an end month before the start after adjustment. An interior missing observation produces no result. The national indices measure aggregate price movements. Calculated from the published index values (rounded to one decimal place), the rates may differ slightly from the ONS headline rate. Gross and net pay retain their original basis throughout, including the negotiation target.

## 10. Relocation

In each location, total monthly expenditure E sums housing, council tax or domestic rates, groceries, utilities, transport, childcare, debt repayments and other expenses once each. Disposable monthly income D = take-home household income − E. Monthly improvement Δ = D_proposed − D_current. Annual improvement = 12 × Δ. Required proposed take-home pay = E_proposed + D_current. For one-off moving cost K, simple payback is K / Δ months when Δ > 0, otherwise null with a reason. Retain fractional months and exclude the one-off cost from recurring monthly and annual comparisons.

## 11–12. Home ownership cash flow

For price H > 0 and deposit D between zero and H, principal P = H − D, deposit percentage = 100 × D / H and LTV = 100 × P / H. Use a constant annual nominal mortgage rate j, monthly rate r = j / 12 and positive whole-month term n. Dividing the nominal annual rate by 12 is the illustrative monthly compounding convention and does not calculate the lender’s annual percentage rate of charge (APRC).

- Monthly payment M = P × r × (1 + r)^n / ((1 + r)^n − 1) when r > 0. At r = 0, M = P / n. A loan of zero has no payments or interest.
- Start with balance B₀ = P. In month t, interest Jₜ = r × Bₜ₋₁, principal paid Aₜ = paymentₜ − Jₜ, and Bₜ = Bₜ₋₁ − Aₜ. Pay at month end. Set the last payment to the remaining principal plus that month's interest to clear any arithmetic residual. The schedule uses the residual after summing earlier principal payments, so their sum including the last payment equals the loan. The displayed final payment is rounded to pence like the other displayed payments. The schedule supports up to 1,200 months and a cash purchase has no repayment rows. Display rounding never feeds back into the balance. Principal payments reconcile to P, and total interest equals total payments less P.
- Upfront transaction costs U = purchase tax + legal, survey, valuation, moving and other one-off fees. Total upfront cash = D + U. Savings after purchase = available savings − (D + U). A negative result is a funding shortfall.
- Monthly outgoings E = M + recurring ownership costs + non-housing spending + existing debt repayments. Disposable income = monthly take-home income − E. Emergency coverage = savings after purchase / E when E > 0 and savings are nonnegative. A funding shortfall or zero outgoings leaves coverage undefined. Recompute the payment, full-term interest and cash flow with each alternative user-entered mortgage rate.

For purchase tax use the relevant jurisdiction, effective date, purchase category and authority guidance from the source register. Sum each progressive marginal band's taxable slice times its rate using the applicable relief schedule and eligibility. A manual override takes precedence, including explicit zero. Unsupported categories require manual entry. Rule updates require independent review.

## 13. Buy Now vs Wait

Each column describes the position on its own purchase date. For w waiting months, initial savings S, monthly savings s after rent and period-wide assumed price change g, future savings = S + w × s and future price = H × (1 + g). If a rate is presented annually, convert it to the full waiting-period change as (1 + annual rate)^(w/12) − 1. Use the relevant deposit, mortgage rate, upfront cost, expenses and income in the section 12 formulas for each column. Default price growth to zero. Waiting-period savings earn zero return. Calculate tax inside the comparison using each column’s price, jurisdiction, purchase category and effective date. Round the projected tax consideration to pence for the tax engine and retain the full-precision price for mortgage calculations. Fees remain user-entered. A manual tax amount overrides automatic tax for its column, including explicit zero. An unsupported tax case makes that column unavailable and returns the tax reason. The waiting column carries the automatic tax rule check date and later-date flag. Waiting-period cash outflow context = w × current monthly rent. Keep that amount separate from purchase costs because s already accounts for rent.

## 14. Rent vs Buy

Use the same opening capital S, monthly resources Y and comparison length N for both paths. N is a whole number from 1 to 1,200 months. Opening investments are renter S and owner S − deposit − purchase tax − buying fees. Flag insufficient initial capital.

For annual effective rent growth gᵣ, property growth gₕ and investment return a, use monthly equivalents (1 + g)^(1/12) − 1. Defaults are zero. Model month-one rent at the entered level R. Rent at month t = R × (1 + gᵣ)^((t − 1)/12). End property value V = H × (1 + gₕ)^(N/12). Use constant recurring ownership costs O plus the scheduled mortgage payment, which becomes zero after maturity.

Y is user-editable. If left blank, use the highest single-month housing cost across both paths and all N months: max over t of rentₜ and mortgage paymentₜ + O. The path with that peak cost contributes zero in its most expensive month. Neither path has a monthly shortfall with this default, although the initial capital check still applies.

At the end of month t, pay housing costs and invest each side's unused monthly resources. Renter contribution = Y − rentₜ. Owner contribution = Y − (mortgage paymentₜ + O). Both may contribute. The cheaper path contributes exactly the monthly cost difference more than the other. For either path, balanceₜ = balanceₜ₋₁ × (1 + a)^(1/12) + contributionₜ. Growth applies to the opening balance and contributions first earn a return the following month. If either contribution would be negative, identify the scenario, month and shortfall and withhold the comparable terminal result.

At month N, equity before sale = V − outstanding mortgage. Selling costs = entered fixed sale costs plus any entered fraction of V. Owner terminal position = V − outstanding mortgage − selling costs + owner investment balance. Renter terminal position = renter investment balance. Difference = owner terminal position − renter terminal position.

Report upfront cash, cumulative rent, owner mortgage payments, principal, interest, other recurring costs, remaining debt, equity and savings separately. Non-recoverable owner costs comprise purchase tax, buying fees, interest, recurring ownership costs and selling costs. The deposit and principal transfer cash into equity. Investment growth already measures the alternative use of funds. Exclude investment taxes, fees and risk unless explicitly captured by the entered return, and disclose the limitations of fixed assumptions and nominal results.

### Limitations

Monthly rent escalation smooths rent changes that typically occur at annual reviews. As rent grows, holding recurring ownership costs flat can favour buying over longer comparisons. The UI must disclose: “Maintenance, insurance and service charges are held constant in nominal terms.”

## 15. Residential purchase tax implementation

The input must identify a standard residential purchase or a purchase otherwise within standard scope for which all buyers qualify for first-time buyer relief. Cases with surcharges, linked transactions, shared ownership, mixed use, rent-related lease charges or unverified eligibility require manual entry. Wales uses its main residential schedule for a qualifying standard transaction regardless of first-time buyer status. An automatic calculation flags dates after the last source check so the UI can disclose the check date and direct users to the authority for later changes. The current schedules are pinned to their effective-from dates in the rules file. Earlier dates require manual entry. Later scenario dates use the checked rules as an estimate of what would apply if the rules were unchanged.

- **SDLT (England and Northern Ireland).** Sum marginal charges before rounding the total tax down to whole pounds. Check the £500,000 relief price ceiling against the full consideration before applying standard rates or any rounding. [HMRC calculation guidance](https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm00050).
- **LBTT (Scotland).** Apply verified relief, then round the final tax down to whole pounds. [Revenue Scotland return guidance](https://revenue.scot/sites/default/files/LBTT%20Paper%20Return%20Form_0.pdf).
- **LTT (Wales).** Use chargeable consideration rounded down to whole pounds as in the return guidance. The official calculator floors band charges to the penny. For the supported main residential bands, each completed band yields an exact amount in pence, so flooring the sum to the penny gives the same result. [WRA return guidance](https://www.gov.wales/land-transaction-tax-return-guidance-about-calculation-all-transactions-html), [WRA calculator](https://www.gov.wales/land-transaction-tax-calculator), [WRA payment guidance](https://www.gov.wales/pay-land-transaction-tax).
