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

## Data handling and access

- Supabase email/password authentication is required before a workspace can be opened.
- Organizations, asset records, and budget scenarios are stored in the dedicated `civic` Postgres schema in the MSE Product Suite Supabase project.
- Row Level Security scopes records to the organization; anon access is revoked, and product schema access is granted only to authenticated users.
- CSV files are parsed in the browser and are not uploaded as files. Validated asset fields are saved to the database.
- Never put a Supabase secret/service-role key in the browser. The app uses only the project URL and publishable key.
- Organization membership changes/invitations, attachment storage, audit log, and role administration are not shipped yet. The database denies client-side membership edits until a server-side invite flow is added.

## Scoring model

The transparent screening score combines condition (40%), cohort-normalized age (25%), and cohort-normalized 24-month failures (35%). Criticality scales consequence. Items are selected greedily by consequence-weighted risk per cost until the budget is consumed. This is a decision-support heuristic, not a calibrated failure probability, lifecycle-cost model, or globally optimal capital allocation. Teams should review it against local engineering standards before acting on recommendations.

## Run locally

```sh
npm install
npm run dev
```

## Release status

Independent product repository with authenticated persistence and a first operational asset-prioritization workflow. It is not yet production-ready or deployed. A production release still requires field validation with an infrastructure operator, reviewed methodology, organization invitations/role management, accessibility and security review, automated end-to-end tests, incident/back-up procedures, and an operational support plan.
