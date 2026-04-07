## What Changed

Describe the behavior change in product or system terms.

## Why

Explain the user, operator, or system reason for the change.

## Risk Review

- [ ] Auth or route-access behavior changed
- [ ] Payments, claims, settlement, or webhook behavior changed
- [ ] Supabase schema, RLS, or Edge Functions changed
- [ ] Live intake or media session behavior changed
- [ ] Runtime config, secrets, or deploy assumptions changed

## Validation

- [ ] `npm run check:fast`
- [ ] `npm run check:full`
- [ ] Targeted manual validation completed where applicable

## Docs And Ops

- [ ] Docs updated or not needed
- [ ] New env vars or secret changes documented or not needed
- [ ] Follow-up work called out explicitly if this is intentionally partial
