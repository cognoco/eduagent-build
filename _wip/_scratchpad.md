if ($env:NOTION_TOKEN) { "NOTION_TOKEN: SET (len=$($env:NOTION_TOKEN.Length))"} else { "NOTION_TOKEN: STILL MISSING" }
Get-Command estate-secrets | Select-Object Name, Source
  
  Expected: NOTION_TOKEN: SET (len=…) and estate-secrets …
  \EstateSecrets\estate-secrets.ps1. Then restart the agents


  What was wrong (recap, now resolved)
  
  The two workstreams left a seam: the Secrets-Management install wired the
  host.env → NOTION_TOKEN loader into Windows PowerShell 5.1's profile, but
  Harness Hygiene-era agents run under PowerShell 7 (VS Code terminal → pwsh → cc
  → claude.exe), whose profile had no loader. Plus estate-secrets was never
  placed on PATH. Both are now patched in her profile/PATH.

  Important: the fix only affects new processes

  Her ~30 currently-running claude.exe/pwsh agents were spawned before the fix,
  so they still have a tokenless environment. They must be restarted (relaunch
  via cc from a fresh pwsh 7 terminal) to inherit NOTION_TOKEN.

  The third symptom is separate (and not a secrets problem)
  Important: the fix only affects new processes

  Her ~30 currently-running claude.exe/pwsh agents were spawned before the fix,
  so they still have a tokenless environment. They must be restarted (relaunch
  via cc from a fresh pwsh 7 terminal) to inherit NOTION_TOKEN.

  The third symptom is separate (and not a secrets problem)

  - notion-query-data-sources not found is the claude.ai Notion MCP connector
  (OAuth-based — that's why fetch/search still work). It's unrelated to
  NOTION_TOKEN and isn't fixed by this. Likely a connector capability/version
  issue — a separate track.
  - "Notion CLI not installed" — there isn't a separate Notion CLI in this
  estate's flows; the "REST query path" the agent wanted simply needs
  NOTION_TOKEN, which is what we just restored. So that symptom should clear once
  the token loads. (If you do have a specific notion CLI in mind, point me at
  it.)

  Verification (must run in her session — she's on RDP)

  In a freshly opened pwsh 7 terminal in her session:
  if ($env:NOTION_TOKEN) { "NOTION_TOKEN: SET (len=$($env:NOTION_TOKEN.Length))"
  } else { "NOTION_TOKEN: STILL MISSING" }
  Get-Command estate-secrets | Select-Object Name, Source
  Expected: NOTION_TOKEN: SET (len=…) and estate-secrets …
  \EstateSecrets\estate-secrets.ps1. Then restart the agents.