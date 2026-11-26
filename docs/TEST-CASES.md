# Independent financial test cases

Expected values below come from hand arithmetic using fictional inputs, except where an official worked example is identified. These are review fixtures for M2–M4. The M1 automated test exercises the application scaffold. Cases 01–15 have automated coverage in M2, cases 16–23 and 35–44 in M3, and cases 24–34 and 45–46 in M4.

| Case | Spec | Inputs, independent working and expected result |
|---|---|---|
| 01 | §9 | Annual gross £35,000 → £37,000, index 100 → 107. Nominal gain £2,000 / £35,000 = 5.71%. Maintenance pay £35,000 + £2,450 = £37,450. Real gap −£450 / £37,450 = −1.20%. Annual gap −£450, monthly gap −£37.50. |
| 02 | §9 | £40,000 with 5% inflation and 2% real target. Inflation adds £2,000 and 2% of £42,000 adds £840. Target £42,840, increase £2,840 / £40,000 = 7.1%. |
| 03 | §9 | Index 120 at both dates, monthly pay £2,000 → £2,100. With unchanged prices the £100 rise is 5% nominal and real, or £1,200 annual gap. |
| 04 | §9 | Index 100 → 95, pay £1,900 unchanged. Maintenance pay £1,805. Real gain £95 / £1,805 = 5.26%, nominal gain 0%. |
| 05 | §9 | In successive years a basket goes from £100 to £110 to £121. £21 extra buys the same basket at the end, so inflation is 21%. Pay £20,000 needs £4,200 extra. |
| 06 | §9 | Gross £3,000 → £3,300 and net £2,000 → £2,100 with 5% inflation. Gross maintenance £3,150 and real gain £150 / £3,150 = 4.76%. Net maintenance £2,100 and real gain zero. Reject a comparison pairing gross £3,000 with net £2,100 because the inputs have different bases. |
| 07 | §9 | Jan index 100, Feb 102, Mar requested and Feb latest. £2,000 needs £40 extra in Feb. Use £2,040 with Feb disclosure. |
| 08 | §9 | Start Mar, requested Apr, latest Feb. After adjustment Feb precedes Mar, so refuse the comparison. |
| 09 | §9 | Jan 100, Feb missing, Mar 104. An end date of Feb has no observed denominator-to-end ratio. Return null with a missing-month reason. |
| 10 | §9 | Prior salary £0 or −£1, current £2,000, same indices. Reject both baselines. A zero baseline would require division by zero. |
| 11 | §9 | Index start 0 or NaN, end 110. No positive finite denominator exists, so reject. |
| 12 | §10 | London £3,200 − £1,650 − £1,000 = £550. Glasgow £2,800 − £900 − £950 = £950. Difference £400 per month and £4,800 per year. Glasgow break-even £1,850 + £550 = £2,400. £1,000 moving costs recover after 2.5 months. |
| 13 | §10 | Current £2,000 − £1,700 = £300, proposed £1,900 − £1,600 = £300. Improvement zero. £100 moving cost cannot be recovered, so recovery is null. |
| 14 | §10 | Current £2,000 − £1,500 = £500, proposed £1,600 − £1,800 = −£200. Difference −£700 monthly and −£8,400 annually. £300 moving cost yields null recovery. |
| 15 | §10 | Disposable income £200 → £250, explicit £0 moving cost. £0 / £50 = 0 months. Missing moving cost leaves recovery unavailable. |
| 16 | §§11–12 | £120,000 price, £24,000 deposit, 0% over 240 months. Deposit 20%, principal £96,000 and LTV 80%. £96,000 split into 240 equal instalments is £400/month, total interest £0. |
| 17 | §12 | £1,200 loan at 12% nominal for two months. Let each payment be x. Balance after month one is £1,212 − x, so x = 1.01 × (£1,212 − x), and x = £1,224.12 / 2.01 = £609.014925373. That payment leaves £602.985074627 after £12 interest. Month two accrues £6.029850746 and clears with £609.014925373. Display £609.01 monthly and £18.03 total interest. Principal reconciles as £597.014925373 + £602.985074627 = £1,200. |
| 18 | §12 | £100 over 3 months at 0%. Three exact thirds sum to £100, though each displays £33.33. Balance clears and interest is zero. |
| 19 | §12 | £100,000 home, £20,000 deposit, £3,000 fees and tax, £21,000 savings. Need £23,000 and are £2,000 short. Take-home £1,600 less £400 mortgage, £250 ownership, £900 living and £100 debt leaves −£50. Emergency coverage is null. |
| 20 | §12 | £25,000 savings with £20,000 deposit and £3,000 fees. £2,000 remains. At £1,250 monthly outgoings, £2,000 / £1,250 = 1.6 months of coverage. |
| 21 | §12 | £100,000 price and £100,001 deposit imply −£1 of principal, so reject. A £100,000 deposit instead produces zero mortgage payment and zero interest. |
| 22 | §12 | A £100 principal and zero term would divide by zero in the zero-rate case. Reject zero, negative or non-whole-month terms. |
| 23 | §12 | £1,200 over one month. At 0% pay £1,200. At 12% nominal pay £1,200 + £12 = £1,212. At 24% pay £1,200 + £24 = £1,224. |
| 24 | §13 | £200,000 now, £30,000 savings, £500/month saved after £800 rent, 12 months and 5% assumed price growth. Future price £210,000 and savings £36,000. £9,600 rent is separate context. Deposits £20,000 now and £25,000 then yield £180,000 and £185,000 mortgages. With zero rates over 240 months payments are £750 and £770.83. With £2,000 entered upfront fees in both columns buffers are £8,000 and £9,000. With post-purchase take-home of £2,000 and £2,100 and other monthly outgoings of £650 on each side, the cash flows are £2,000 − £750 − £650 = £600 and £2,100 − £770.83 − £650 = £679.17. |
| 25 | §13 | £200,000 price, £25,000 savings, zero savings and growth over six months, £1,000 monthly rent. Price and savings stay £200,000 and £25,000. Waiting rent totals £6,000 separately. |
| 26 | §14 | £1,200 home, £200 deposit, £200 common capital, £1,000 loan over 10 months at 0%, £150 monthly resources, £80 rent, no other costs, two months, zero growth and return. Buyer pays £200 principal and has £400 equity and £100 savings = £500. Renter saves £200 + 2 × £70 = £340. Owner leads £160, outstanding loan £800. |
| 27 | §14 | Case 26 with rent £130 instead. Owner saves £50 a month, renter £20. Renter ends at £240, owner still £500. Owner leads £260. |
| 28 | §14 | Case 26 with rent, return, price growth and all costs other than principal equal to zero. Owner £400 equity + £100 savings = £500. Renter £200 capital + 2 × £150 = £500. |
| 29 | §14 | Case 26 with monthly resources of £90. Owner owes £100 in month one, short by £10. Flag unaffordability and withhold terminal comparison. |
| 30 | §14 | £1,000 paid outright with £1,100 common capital, £100 buying fees, £0 rent and £0 monthly resources, zero returns, 12 months, 10% annual price growth and 5% selling cost. Owner starts with £0 cash, sale gives £1,100 − £55 = £1,045. Renter keeps £1,100. Difference −£55. |
| 31 | §14 | £900 home paid outright, £1,000 common capital, £200/month, £100 rent, two months and annual return 1.01^12 − 1. After month 1 renter has £1,110, owner £301. After month 2 renter £1,221.10 and owner £504.01 before equity. Add £900 property for £1,404.01 owner total and £182.91 lead. |
| 32 | §14 | £500 opening capital, £450 deposit and £60 buying costs. Buyer needs £510 at time zero, short by £10. Flag unaffordability before simulating months. |
| 33 | §14 | £100 opening rent, annual growth 1.01^12 − 1, £150 resources, zero investment return. Month one rent £100 and month two £101. Renter adds £50 + £49 = £99 to initial capital. |
| 34 | §14 | £600 zero-rate mortgage over two months, compare three months. Principal payments £300, £300, £0. End debt zero, total recurring mortgage payments £600. With monthly resources £350 and zero other costs or returns, owner saves £50 + £50 + £350 = £450. |

## Property tax fixtures

Use qualifying standard residential transactions unless noted. Expected values here are hand arithmetic against the linked authority schedules checked on 26 November 2026. M3 official comparisons and boundary working follow the original cases.

| Case | Spec | Hand working and expected result |
|---|---|---|
| 35 | §15 | SDLT on £124,999: all in the nil band = £0. |
| 36 | §15 | SDLT on £250,100: £125,000 × 2% + £100 × 5% = £2,505. |
| 37 | §15 | Eligible first-time buyer in Northern Ireland at £400,000: £300,000 nil plus £100,000 × 5% = £5,000. |
| 38 | §15 | LBTT on £144,999: all in the nil band = £0. |
| 39 | §15 | LBTT on £300,000: £105,000 × 2% + £50,000 × 5% = £4,600. |
| 40 | §15 | Eligible Scottish first-time buyer at £200,000: £175,000 nil plus £25,000 × 2% = £500. |
| 41 | §15 | LTT on £224,999: all in the nil band = £0. |
| 42 | §15 | LTT on £500,000: £175,000 × 6% + £100,000 × 7.5% = £18,000. |
| 43 | §15 | Welsh first-time buyer at £250,000: standard schedule gives £25,000 × 6% = £1,500. |
| 44 | §15 | Additional dwelling in any jurisdiction requires manual input. Explicit manual £0 overrides the unsupported automatic result. |

Authority schedules and release evidence are linked in [DATA-SOURCES.md](DATA-SOURCES.md).

## Additional Rent vs Buy fixtures

| Case | Spec | Inputs, independent working and expected result |
|---|---|---|
| 45 | §14 | £1,200 price, £200 deposit and common capital, £1,000 loan over 10 months at 12% nominal, £150 monthly resources, £80 flat rent, no growth or other costs, two months, annual return 1.005^12 − 1. At month 10 the loan would grow to £1,104.622125411 without payments. The 10 payments accumulate with weights 1 through 1.01^9, summing to 10.462212541. Dividing gives a monthly payment of £105.582077. Month one interest is £10, principal £95.582077 and debt £904.417923. In month two, £9.044179 interest gives £807.880026 debt after payment. Owner contributes about £44.417923 each month, accumulating £44.417923 × 2.005 ≈ £89.057937. Renter starts at £200 and contributes £70 per month: £200 × 1.005 + £70 = £271, then £271 × 1.005 + £70 = £342.355. Owner has £1,200 − £807.880026 + £89.057937 ≈ £481.177911. Expected displays: owner £481.18, renter £342.36, owner lead £138.82 from unrounded balances, and total mortgage interest £19.04. |
| 46 | §14 | Case 26 with monthly resources left blank, £100 initial rent and annual rent growth 1.10^12 − 1. Rent is £100 then £110, while ownership costs £100 in each month. The maximum of the four costs is £110, so default Y is £110. The renter contributes £10 then £0, finishing at £210. The owner contributes £10 both months and finishes with £400 equity + £20 savings = £420. Neither path is flagged unaffordable. |

## M3 official purchase tax comparisons (§15)

Checked 26 November 2026 UK. All values are in pounds. HMRC applies the same published SDLT rules in England and Northern Ireland. Each SDLT comparison runs for both jurisdictions in the test suite.

| Authority | Scenario | Independent working | Official tax |
|---|---|---|---:|
| [HMRC worked example](https://www.gov.uk/stamp-duty-land-tax/residential-property-rates) | Standard purchase at £295,000, April 2025 | £125,000 × 2% + £45,000 × 5% | £4,750 |
| [HMRC worked example](https://www.gov.uk/stamp-duty-land-tax/residential-property-rates) | Eligible first-time buyer at £500,000, current schedule | £200,000 × 5% | £10,000 |
| [HMRC calculator](https://www.tax.service.gov.uk/calculate-stamp-duty-land-tax) | £500,001, effective 26 November 2026, freehold residence, UK resident, individual first-time buyer | £125,000 × 2% + £250,001 × 5% = £15,000.05 before rounding. The relief ceiling is exceeded. | £15,000 |
| [Revenue Scotland worked example](https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property) | Standard £135,000 | Entirely in the nil band | £0 |
| [Revenue Scotland worked example](https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property) | Standard £235,000 | £90,000 × 2% | £1,800 |
| [Revenue Scotland worked example](https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property) | Standard £875,000 | £105,000 × 2% + £75,000 × 5% + £425,000 × 10% + £125,000 × 12% | £63,350 |
| [WRA technical guidance example 1](https://www.gov.wales/calculation-land-transaction-tax-payable-technical-guidance) | First home at £120,000 | Entirely in the main residential nil band | £0 |
| [WRA technical guidance example 2](https://www.gov.wales/calculation-land-transaction-tax-payable-technical-guidance) | First home at £350,000 | £125,000 × 6% | £7,500 |
| [WRA technical guidance example 3](https://www.gov.wales/calculation-land-transaction-tax-payable-technical-guidance) | First home at £1,700,000 | £175,000 × 6% + £350,000 × 7.5% + £750,000 × 10% + £200,000 × 12% | £135,750 |

[WRA’s return guidance](https://www.gov.wales/land-transaction-tax-return-guidance-about-calculation-all-transactions-html) confirms Wales has no first-time buyer relief.

### M3 boundary fixtures (§15)

At each boundary, the tax comes from completed marginal slices in the authority’s schedule. For £1 either side, subtract one pound times the preceding rate or add one pound times the next rate, then apply the [jurisdiction rounding rule](METHODOLOGY.md#15-residential-purchase-tax-implementation). The SDLT relief ceiling changes the schedule entirely above £500,000. The raw columns show the independent working before rounding.

| Schedule | Boundary | Raw tax at boundary | Raw adjustment below / above | Expected at −£1 / exact / +£1 |
|---|---:|---:|---|---|
| SDLT standard | £125,000 | £0 | −£0 / +£0.02 | £0 / £0 / £0 |
| SDLT standard | £250,000 | £2,500 | −£0.02 / +£0.05 | £2,499 / £2,500 / £2,500 |
| SDLT standard | £925,000 | £36,250 | −£0.05 / +£0.10 | £36,249 / £36,250 / £36,250 |
| SDLT standard | £1,500,000 | £93,750 | −£0.10 / +£0.12 | £93,749 / £93,750 / £93,750 |
| SDLT first-time buyer | £300,000 | £0 | −£0 / +£0.05 | £0 / £0 / £0 |
| SDLT first-time buyer | £500,000 | £10,000 | −£0.05 / standard rates, £15,000.05 | £9,999 / £10,000 / £15,000 |
| LBTT standard | £145,000 | £0 | −£0 / +£0.02 | £0 / £0 / £0 |
| LBTT standard | £250,000 | £2,100 | −£0.02 / +£0.05 | £2,099 / £2,100 / £2,100 |
| LBTT standard | £325,000 | £5,850 | −£0.05 / +£0.10 | £5,849 / £5,850 / £5,850 |
| LBTT standard | £750,000 | £48,350 | −£0.10 / +£0.12 | £48,349 / £48,350 / £48,350 |
| LBTT first-time buyer | £175,000 | £0 | −£0 / +£0.02 | £0 / £0 / £0 |
| LBTT first-time buyer | £250,000 | £1,500 | −£0.02 / +£0.05 | £1,499 / £1,500 / £1,500 |
| LBTT first-time buyer | £325,000 | £5,250 | −£0.05 / +£0.10 | £5,249 / £5,250 / £5,250 |
| LBTT first-time buyer | £750,000 | £47,750 | −£0.10 / +£0.12 | £47,749 / £47,750 / £47,750 |
| LTT main residential | £225,000 | £0 | −£0 / +£0.06 | £0 / £0 / £0.06 |
| LTT main residential | £400,000 | £10,500 | −£0.06 / +£0.075 | £10,499.94 / £10,500 / £10,500.07 |
| LTT main residential | £750,000 | £36,750 | −£0.075 / +£0.10 | £36,749.92 / £36,750 / £36,750.10 |
| LTT main residential | £1,500,000 | £111,750 | −£0.10 / +£0.12 | £111,749.90 / £111,750 / £111,750.12 |

Additional precision checks use the same working. At £500,000.01 the first-time buyer SDLT relief is unavailable and standard tax of £15,000.0005 floors to £15,000. For LBTT, £49.99 × 2% gives £0.9998 and floors to £0, while £50 × 2% is exactly £1. For LTT at £400,001.99, floor consideration to £400,001 and then floor £10,500.075 to £10,500.07.

## M4 review fixtures (§13)

- SDLT band crossing: a 5% rise adds £12,000 to £240,000. Current tax is £115,000 × 2% = £2,300. At £252,000, tax is £125,000 × 2% + £2,000 × 5% = £2,600. With respective deposits of £20,000 and £25,000 and £2,000 fees each, upfront cash is £24,300 and £29,600. With an effective date equal to the rules check date in the first column and later in the second, only the second is flagged.
- Unsupported category: an automatic calculation leaves the column unavailable with the tax reason. An explicit manual £0 in the other column remains valid.
- Projected pence: 5.1234567% of £240,000 is £12,296.29608. Keep £252,296.29608 for the comparison, and use £252,296.30 as tax consideration. £2,500 + £2,296.30 × 5% is £2,614.815 before rounding, giving £2,614.


## M8 salary history fixtures (§9)

For £1,000 monthly pay and a starting index of 100 in December, each index point represents £10 of maintenance pay. CPIH values 100, 102, 105 and 106 through March give £1,000, £1,020, £1,050 and £1,060. An explicit null or absent interior month leaves that month's amount unavailable without changing the other months. If May is requested and March is the latest observation, the series ends at £1,060 in March. Using the separate CPI values 100, 98, 99 and 101 instead gives £1,000, £980, £990 and £1,010. These fixtures use fictional indices.
