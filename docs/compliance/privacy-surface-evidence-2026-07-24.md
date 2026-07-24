# Privacy surface evidence refresh — 24 July 2026

**Captured:** 24 July 2026, 11:55 UTC<br>
**Rechecked:** 24 July 2026, 12:09 UTC — all recorded flags, credential
presence states, health status, deploy SHA, and registered-provider names were
unchanged<br>
**Scope:** Production-source configuration, production Worker liveness metadata,
and current `origin/main` code comparison<br>
**Handling:** No secret value was printed or retained in this artefact.

## Result

The production-source configuration remains enabled for routing v2, the
Challenge Round grader, and transcript purge. Credentials are present for all
five currently approved routing/embedding vendors **and for Gemini**.

The live production Worker is healthy but is not running current `main`. Its
public health endpoint reported deploy `23951a69`, dated 14 July 2026, while
current `origin/main` was `40e07d0d` at the time of this check. The production
health response also reported Gemini, OpenAI, Anthropic, Cerebras, and Mistral
as registered providers.

This evidence supports a configuration and provider-registration statement. It
does **not** by itself prove which provider handled any request, the serving
region, provider-side retention, transfer controls, or that every live request
used routing v2.

## Production-source configuration

Source: Doppler project `mentomate`, config `prd`, read at
`2026-07-24T11:55:08Z`.

| Setting | Observed |
|---|---|
| `LLM_ROUTING_V2_ENABLED` | `true` |
| `CHALLENGE_ROUND_GRADER_ENABLED` | `true` |
| `RETENTION_PURGE_ENABLED` | `true` |
| `CEREBRAS_API_KEY` | Present |
| `MISTRAL_API_KEY` | Present |
| `OPENAI_API_KEY` | Present |
| `ANTHROPIC_API_KEY` | Present |
| `VOYAGE_API_KEY` | Present |
| `GEMINI_API_KEY` | **Present** |

The scheduled **Production Worker Secret Sync** completed successfully at
10:50 UTC on 24 July 2026:
[GitHub Actions run 30087483233](https://github.com/cognoco/eduagent-build/actions/runs/30087483233).
The deployment workflow and its regression test place the Doppler-to-Worker
secret sync before any production traffic switch
(`.github/workflows/deploy.yml:280-359`;
`scripts/deploy-secret-sync-order.test.ts:2-71`).

That successful sync materially strengthens the inference that the Worker had
the observed production-source settings when checked. It still does not replace
a request-level routing trace.

## Live production Worker

Source: `GET https://api.mentomate.com/v1/health`, read at
`2026-07-24T11:55:45Z`.

| Field | Observed |
|---|---|
| Health | `ok` |
| Deploy SHA | `23951a69` |
| Registered providers | Gemini, OpenAI, Anthropic, Cerebras, Mistral |

Commit `23951a69` is
`feat(identity-v2): ship family-join dark behind a launch flag [WI-1753] (#2168)`,
dated 14 July 2026. It was 332 commits behind `origin/main` at the time of this
check. Ordinary pushes currently deploy the API to staging; production requires
the separate confirmation path. For example, the 24 July workflow for current
`main` deployed staging while its production-deploy and production-smoke jobs
were skipped:
[GitHub Actions run 30089566500](https://github.com/cognoco/eduagent-build/actions/runs/30089566500).

## Interpretation against code

Both deployed commit `23951a69` and current `main` contain the routing-v2 matrix.
When `LLM_ROUTING_V2_ENABLED=true`, that matrix excludes Gemini and Vertex from
its candidate and fallback sets. However:

- the middleware registers the Gemini adapter whenever `GEMINI_API_KEY` is
  present (`apps/api/src/middleware/llm.ts`);
- the live health endpoint confirms that Gemini is registered;
- legacy routing code remains in the deployed commit and current `main`;
- the feature flag is configuration, not a compile-time removal;
- the public health endpoint does not expose the effective routing-v2 flag or a
  request-level selected-provider trace.

The defensible statement is therefore:

> Routing v2 is enabled in the production source configuration and its code
> excludes Gemini/Vertex from routing-v2 selection. Gemini is nevertheless
> credentialled and registered in production, so key absence and physical
> adapter removal cannot be claimed. A controlled synthetic production trace,
> deployment-version evidence, and a rollback/kill-switch control are still
> needed to prove the effective request path and prevent a legacy-path
> regression.

## Evidence still required

1. Deploy current approved code to production through the confirmed production
   path and retain the production workflow run plus resulting health SHA.
2. Run controlled synthetic adult and 13–17 profiles through text, vision/OCR,
   deep/asynchronous, judge, embedding, and fallback paths; retain selected
   provider/model/region telemetry without using real child data.
3. Remove the production Gemini credential or document and enforce why dormant
   registration is required, including a control that prevents routing-v2
   rollback.
4. Retain provider-console, contract/DPA, subprocessor, retention, and transfer
   evidence separately; none is established by configuration or health output.
