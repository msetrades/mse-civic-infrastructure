# MSE Civic Systems

An infrastructure portfolio planning workspace for asset owners. It turns an operator's own inspection register into a transparent, budget-constrained repair shortlist.

## Workflow

1. Import a CSV asset register.
2. Validate schema and numeric ranges before any scoring.
3. Compare relative failure exposure using condition, asset age, and failure history, then account for consequence/criticality.
4. Allocate a user-specified repair budget in priority-per-cost order.
5. Review included and deferred assets, then export the full ranked plan.

## Input contract

Required CSV headers: `asset_id,type,condition_1_5,age_years,criticality_1_5,failures_24m,repair_cost`.

The score is an explicit screening heuristic, not a calibrated probability of failure. Age and failures are normalized against the uploaded cohort; condition and history receive documented weights; criticality scales consequence. Budget selection is a greedy priority-per-cost heuristic, not a globally optimal capital plan. Operators must validate weights and decisions with their engineering teams.

## Data handling

The current workflow parses the selected CSV in the browser and does not send it to a server. Do not import personal information. Shared accounts, server-side persistence, access control, audit history, and external system integrations are not implemented yet.

## Run locally

```sh
npm install
npm run dev
```

## Release status

Independent product repository and first usable local-analysis workflow are under development. Not yet production-ready or deployed. Production release requires field validation with an infrastructure operator, calibrated and reviewed methodology, accessibility and security review, automated tests, and a deliberate persistence/deployment design.
