# Portfolio analytics methodology

## Implemented calculations

For initial weights w_i summing to 1 and adjusted prices P_i,t, the simulated index is E_t = sum(w_i × P_i,t / P_i,0). Daily returns are E_t / E_(t-1) - 1. Initial weights for saved portfolios are proportional to current quantity × the adjusted price at the start of the selected interval; the simulation then holds units fixed.

| Metric | Definition |
| --- | --- |
| Total return | E_T / E_0 - 1 |
| Annualized volatility | Sample standard deviation of daily returns × sqrt(252) |
| Sharpe | (Mean daily return - daily risk-free rate) / sample standard deviation × sqrt(252) |
| Daily risk-free rate | (1 + annual risk-free rate)^(1/252) - 1 |
| Beta | Sample covariance of portfolio and benchmark daily returns / sample benchmark variance |
| Maximum drawdown | Minimum of E_t / running maximum(E_0...E_t) - 1 |

1M, 3M, 6M and 1Y use the last 22, 64, 127 and 253 price observations respectively. They approximate trading sessions rather than exact calendar intervals. Effective dates are returned by the API.

## CSV contract

The first column is `date`, followed by exactly the portfolio symbols and an optional `benchmark`. Use unique headers, increasing unique ISO dates, at least three complete rows and positive finite daily adjusted prices in USD. Maximum 1 MB and 10,000 rows. No missing-price filling or currency conversion is applied. Imported adjusted history does not overwrite current unadjusted valuation prices.

```csv
date,AAPL,MSFT,benchmark
2026-01-05,100,200,100
2026-01-06,102,202,101
2026-01-07,101,206,103
```

These numbers are synthetic format examples, not observations or backtest evidence. Changing symbols or benchmark invalidates saved history. Changing quantities preserves the series and recalculates the current-position simulation.

## Market data behavior

Twelve Data requests adjusted daily history and an unadjusted closing valuation separately. Each uncached symbol, including the benchmark, costs two requests; cache life is six hours. The default download horizon is one year and excludes the current partial day. Provider errors or mismatched calendars cancel the batch and preserve prior data.

## Interpretation

The engine explicitly excludes forecasts and implicit rebalancing. Expected return belongs to a future, separately documented estimation model. These metrics do not establish realized investor returns or an investment recommendation.
