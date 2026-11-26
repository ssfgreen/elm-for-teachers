# Model prices

Standard prices per 1M tokens, as Sam was given them on 7 Nov 2026. For estimating eval and
study costs; check them again before relying on them. The table had Flex/Batch, Fast and
Ultrafast tiers too, which were not copied.

| Model | Input | Output | Cached input | Cache write (30 min) | Cache write (12 h) |
| --- | --- | --- | --- | --- | --- |
| gpt-6-astra | $10.00 | $50.00 | $1.00 | $12.50 | $25.00 |
| gpt-6.1-sol | $2.00 | $10.00 | $0.10 | $2.50 | $5.00 |
| gpt-6.1-terra | $1.00 | $5.00 | $0.05 | $1.25 | $2.50 |
| gpt-6-luna | $0.10 | $0.50 | $0.01 | $0.125 | $0.25 |

The app and the evals use `gpt-6-sol`, which is not in the table; estimates so far price it as
`gpt-6.1-sol`.

The app's copy is `provider.prices` in `config/app.config.json` (with `provider.usd_to_gbp`, set to
0.75 on 12 Nov 2026). Prices are applied once, when each call is saved (`callCostGbp`, stored as
`gateway_calls.cost_gbp`); the budget (config `limits.budget_gbp` plus any £10 top-ups from /admin),
the counter under the chat box, "£N left" in the chat and Usage on Preferences add up those stored costs, so a price change applies to later calls only. The config must price every
model the app can use (`budgetProblems`).
