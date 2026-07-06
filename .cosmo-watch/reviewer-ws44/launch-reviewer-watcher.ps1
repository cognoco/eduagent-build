$ErrorActionPreference = 'Stop'

$repo = 'C:\Dev\Projects\Products\Apps\eduagent-build'
$env:COSMO_WATCH_REPO = $repo
$env:COSMO_WATCH_DB = '36fd1119-9955-4684-8bfe-deb145e6a21f'
$env:COSMO_WATCH_CONFIG = Join-Path $repo '.cosmo-watch\reviewer-ws44\workstreams.json'
$env:COSMO_WATCH_OUTDIR = Join-Path $repo '.cosmo-watch\reviewer-ws44'
$env:COSMO_WATCH_POLL_MS = '60000'
$env:COSMO_REVIEWER_ACTOR = 'claude-code:reviewer-ws44'

Set-Location $repo
node (Join-Path $repo '.cosmo-watch\reviewer-ws44\reviewer-watcher.mjs')
