# Staging rehearsal — Stage-1 seed manifest (2026-06-17)

Fresh-seeded after the discard ruling (WI-814) + Option-1 rebuild. Staging branch
`br-delicate-star-agpvtzx3` (endpoint ep-fancy-cherry = Doppler `stg`).
Approach **B** (test-seed; advisor-confirmed): seeder writes legacy accounts+profiles+subscriptions
and v2 in full; legacy family_links/consent_states are NOT written → v2-only entities will show as
**pre-registered synthetic reverse-orphans** at parity (NOT bugs).

## Inventory at Stage-1 end (pre-rehearsal baseline)
| table | rows | | table | rows |
|---|---|---|---|---|
| legacy accounts | 13 | | new organization | 11 |
| legacy profiles | 17 | | new person | 17 |
| legacy family_links | 0 | | new login | 11 |
| legacy consent_states | 0 | | new membership | 17 |
| legacy subscriptions | 3 | | new guardianship | 6 |
| | | | new consent_grant | 10 |
| | | | new subscription | 3 |
| | | | new subscription_payers | 0 |
| | | | new consent_request | 1 |
| | | | new knowledge_assertions | 0 |

## Scenarios seeded (all @example.com, clerk_seed_ prefix → resettable)
parent-multi-child, parent-with-children, learning-active, multi-subject,
subscription-family-active, subscription-pro-active, trial-expired,
consent-pending, consent-withdrawn, parent-proxy, language-learner.
Raw responses: `/tmp/seed-manifest.txt` + `/tmp/seed-pmc.json` (ephemeral).

## Supplemental ownerless accounts (C3 disposal targets)
- `clerk_seed_ownerless_1` / rehearsal-ownerless-1@example.com (0 profiles)
- `clerk_seed_ownerless_2` / rehearsal-ownerless-2@example.com (0 profiles)
- Verified: `count(accounts with no is_owner profile) = 2`.

## Route-smoke (C9) target — parent-multi-child
- account        : `019ed656-b7b8-7310-b1ae-de01efc839e1`
- owner profile  : `019ed656-b82e-76af-bcc5-3e95d8cb999e`
- child1 profile : `019ed656-b9f7-720e-87fb-973e7875d462`
- email          : `rehearsal-pmc@example.com`
- owner clerk_user_id : `user_3FGruHGKTyuFA8uX0NDaDestPiw`

### JWT mint recipe (VERIFIED GREEN 2026-06-17 ~16:40Z) — headless via Clerk Backend API
```bash
doppler run -p mentomate -c stg -- bash -c '
  SID=$(curl -s -X POST https://api.clerk.com/v1/sessions \
    -H "Authorization: Bearer $CLERK_SECRET_KEY" -H "Content-Type: application/json" \
    -d "{\"user_id\":\"user_3FGruHGKTyuFA8uX0NDaDestPiw\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)[\"id\"])")
  curl -s -X POST "https://api.clerk.com/v1/sessions/$SID/tokens" \
    -H "Authorization: Bearer $CLERK_SECRET_KEY" -H "Content-Type: application/json" -d "{}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin)[\"jwt\"])"'
```
- Token = default session template (sub=clerk_user_id; ~60s TTL → mint fresh at C9). `Content-Type: application/json` REQUIRED on both POSTs. Do NOT use bash var `UID` (readonly).
- Verified: owner JWT → `GET /v1/profiles` 200 + `GET /v1/subjects` 200 on flag-OFF worker (X-Profile-Id omitted → auto-resolves owner). For child probes set header `X-Profile-Id: <child>` (proxy-guard verifies parent→child).

## Parity expectation (C5) — assert ONLY these reverse-orphans, nothing beyond
- forward checks (accounts→org, profiles→person, login, membership, subscription) → GREEN
- `no orphan guardianships (reverse)` = 6 (seeder writes guardianship, no family_links)
- `no orphan consent_grants (reverse)` = 10 (seeder writes consent_grant, no consent_states)
- `no orphan consent_requests (reverse)` = 1 (consent-pending)
- C4 reseed (0109+0115) does real work: populates subscription_payers (→3), knowledge_assertions, person.age_knowing.

## Flag baseline
- Doppler `stg` IDENTITY_V2_ENABLED=false; MAINTENANCE_READONLY/BLOCK_INNGEST=false.
- Propagated via staging deploy run **27703680721** (success): "Deploy to Workers" + "Sync secrets" both ran → worker binding = false, on current `main`.
- Incidentally fixed: staging deploy had been failing at the migrate step since the cutover (0117 non-idempotent ALTER POLICY vs broken DB); the Option-1 rebuild cleared it.
