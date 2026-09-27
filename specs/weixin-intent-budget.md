# Weixin intent output budget repair
The workspace generation port requires a complete output budget. Weixin intent
requests previously supplied none, causing adapter validation to reject before IO.
The CLI runtime owns model capability resolution: treat weixin-intent as an auxiliary
request, bind auxiliaryModelOptions (min(5000, model max), lowest public reasoning).
Do not mutate stored session selection or relax adapter validation. Explicit general
workspace budgets retain their existing behavior. Verify against small model caps.
