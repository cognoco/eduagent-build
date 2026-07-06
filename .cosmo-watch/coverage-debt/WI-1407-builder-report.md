Blocked at Phase 0 claim.

The local Cosmo writer was copied into `.workitem-artifacts/cosmo-plugin` so Bun could execute it from inside the worktree, but the actual fetch failed because outbound Notion REST is blocked in this shell sandbox:

```text
error: Unable to connect. Is the computer able to access the url?
path: "https://api.notion.com/v1/databases/f170be9e04ae45d4961828f2438666bd/query"
code: "ConnectionRefused"
```

I did not claim the WI, did not edit product/test files, and did not hand-edit Notion via MCP because the brief explicitly requires `/cosmo:execute` mechanics through the local deterministic writer.

---
**[ BOTTOM LINE ]** `WI-1407` — Consent/profile gate coverage gaps; Ready at dispatch; blocked before implementation because the required Cosmo writer cannot reach Notion from the sandbox.

**[ ACTIONS ]**
1. Resume with shell network access for `https://api.notion.com`, or run the Cosmo fetch/claim externally with claimant `codex:builder:WI-1407`, then I can continue from the verified claim.