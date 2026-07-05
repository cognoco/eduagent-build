<#
.SYNOPSIS
    Self-contained verification for WI-1563's supervisor-watchdog.ps1. Builds fixture heartbeat
    files in a scratch dir and drives the watchdog with -Now overrides so the 5-hour window gate
    and 30-minute staleness threshold are exercised deterministically, without waiting real time.

.DESCRIPTION
    Not a Pester suite (none is wired into this repo for .ps1  -  see clacks/lease.test.ts for the
    equivalent .ts convention). Plain pass/fail assertions, printed, non-zero exit on any failure.
    Covers the adversarial cases called out in supervisor-watchdog-contract.md: no premature
    respawn before window reset, no respawn while the old process is still alive (duplicate
    guard), no respawn-loop (backoff), and the actual detect->wait->resume->breadcrumb path with a
    stub relaunch_command.

.EXAMPLE
    ./supervisor-watchdog.test.ps1
#>
$ErrorActionPreference = "Stop"
$failures = 0

function Assert-True([bool]$cond, [string]$msg) {
    if ($cond) { Write-Output "  PASS: $msg" }
    else { Write-Output "  FAIL: $msg"; $script:failures++ }
}

$scratch = Join-Path $env:TEMP ("wi1563-watchdog-test-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $scratch -Force | Out-Null
$watchdog = Join-Path $PSScriptRoot "supervisor-watchdog.ps1"

function New-Fixture([string]$name, [hashtable]$hb) {
    $dir = Join-Path $scratch $name
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $path = Join-Path $dir "heartbeat.json"
    ($hb | ConvertTo-Json) | Set-Content -Path $path -Encoding utf8
    return $path
}

function Recovery-Log([string]$heartbeatPath) {
    $log = Join-Path (Split-Path -Parent $heartbeatPath) "supervisor-recovery.jsonl"
    # @(...) forces array context - a single-line log otherwise returns a bare PSCustomObject
    # whose .Count is $null on Windows PowerShell, breaking every -Count assertion below.
    if (Test-Path $log) { return @(Get-Content $log | ForEach-Object { $_ | ConvertFrom-Json }) }
    return @()
}

# ---------------------------------------------------------------------------
Write-Output "Case 1: HEALTHY  -  fresh heartbeat, no action, no breadcrumb"
$hb1 = New-Fixture "healthy" @{
    session_id = "shepherd:test-1"; role = "shepherd"; lane = "ws-test"; host = $env:COMPUTERNAME
    pid = $PID; last_alive = "2026-07-05T00:28:00Z"; window_resets_at = "2026-07-05T05:28:00Z"
    relaunch_command = "New-Item -ItemType File -Path '$scratch\healthy\RESPAWNED.marker' -Force"
}
& $watchdog -HeartbeatPath $hb1 -Now "2026-07-05T00:30:00Z" | Out-Null
Assert-True (-not (Test-Path "$scratch\healthy\RESPAWNED.marker")) "healthy session not respawned"
Assert-True ((Recovery-Log $hb1).Count -eq 0) "no breadcrumb for a healthy session"

# ---------------------------------------------------------------------------
Write-Output "Case 2: WINDOW-NOT-RESET  -  stale, dead pid, but window not reset -> NO respawn (the load-bearing negative case)"
$deadPid = 999999
$hb2 = New-Fixture "windownotreset" @{
    session_id = "shepherd:test-2"; role = "shepherd"; lane = "ws-test"; host = $env:COMPUTERNAME
    pid = $deadPid; last_alive = "2026-07-05T00:00:00Z"; window_resets_at = "2026-07-05T05:00:00Z"
    relaunch_command = "New-Item -ItemType File -Path '$scratch\windownotreset\RESPAWNED.marker' -Force"
}
# now = 00:40 -> stale (40min > 30min threshold), pid dead, but window resets 05:00 -> must NOT respawn.
& $watchdog -HeartbeatPath $hb2 -Now "2026-07-05T00:40:00Z" | Out-Null
Assert-True (-not (Test-Path "$scratch\windownotreset\RESPAWNED.marker")) "no premature respawn before window reset"
$log2 = Recovery-Log $hb2
Assert-True ((@($log2 | Where-Object { $_.event -eq "window-wait" })).Count -ge 1) "window-wait breadcrumb posted"
Assert-True ((@($log2 | Where-Object { $_.event -eq "respawn-attempt" })).Count -eq 0) "no respawn-attempt breadcrumb while window closed"

# ---------------------------------------------------------------------------
Write-Output "Case 3: HANG-SUSPECTED  -  stale but pid still alive -> NO respawn (duplicate-session guard)"
$hb3 = New-Fixture "hang" @{
    session_id = "shepherd:test-3"; role = "shepherd"; lane = "ws-test"; host = $env:COMPUTERNAME
    pid = $PID; last_alive = "2026-07-05T00:00:00Z"; window_resets_at = "2026-07-05T00:10:00Z"
    relaunch_command = "New-Item -ItemType File -Path '$scratch\hang\RESPAWNED.marker' -Force"
}
# now = 00:40 -> stale, window already reset (00:10), but $PID (this test process) is alive -> must NOT respawn.
& $watchdog -HeartbeatPath $hb3 -Now "2026-07-05T00:40:00Z" | Out-Null
Assert-True (-not (Test-Path "$scratch\hang\RESPAWNED.marker")) "no respawn while recorded pid is still alive"
Assert-True ((@(Recovery-Log $hb3 | Where-Object { $_.event -eq "hang-suspected" })).Count -ge 1) "hang-suspected breadcrumb posted"

# ---------------------------------------------------------------------------
Write-Output "Case 4: RESPAWN  -  stale, dead pid, window reset -> respawns and posts breadcrumb (positive path)"
$hb4 = New-Fixture "respawn" @{
    session_id = "shepherd:test-4"; role = "shepherd"; lane = "ws-test"; host = $env:COMPUTERNAME
    pid = $deadPid; last_alive = "2026-07-05T00:00:00Z"; window_resets_at = "2026-07-05T00:10:00Z"
    relaunch_command = "New-Item -ItemType File -Path '$scratch\respawn\RESPAWNED.marker' -Force"
}
& $watchdog -HeartbeatPath $hb4 -Now "2026-07-05T00:40:00Z" | Out-Null
Start-Sleep -Seconds 2   # Start-Process spawns a new powershell.exe; give the stub command time to run.
Assert-True (Test-Path "$scratch\respawn\RESPAWNED.marker") "relaunch_command executed on confirmed dead+reset session"
$log4 = Recovery-Log $hb4
Assert-True ((@($log4 | Where-Object { $_.event -eq "respawn-attempt" -and $_.attempt -eq 1 })).Count -eq 1) "respawn-attempt #1 breadcrumb posted"

Write-Output "Case 4b: BACKOFF  -  immediately re-polling the same still-stale heartbeat must NOT respawn-loop"
Remove-Item "$scratch\respawn\RESPAWNED.marker" -Force
& $watchdog -HeartbeatPath $hb4 -Now "2026-07-05T00:41:00Z" | Out-Null
Start-Sleep -Seconds 2
Assert-True (-not (Test-Path "$scratch\respawn\RESPAWNED.marker")) "no second respawn one minute later (10-min backoff in effect)"

# ---------------------------------------------------------------------------
Write-Output "Case 5: RECOVERED  -  once last_alive advances, backoff state clears"
$hbRecoveredPath = "$scratch\respawn\heartbeat.json"
$hb = Get-Content $hbRecoveredPath -Raw | ConvertFrom-Json
$hb.last_alive = "2026-07-05T00:41:30Z"   # simulate the resumed session touching its heartbeat again
($hb | ConvertTo-Json) | Set-Content -Path $hbRecoveredPath -Encoding utf8
& $watchdog -HeartbeatPath $hb4 -Now "2026-07-05T00:42:00Z" | Out-Null
$state = Get-Content "$scratch\respawn\supervisor-recovery-state.json" -Raw | ConvertFrom-Json
Assert-True ($state.attempt_count -eq 0) "backoff attempt_count reset after heartbeat resumed"

# ---------------------------------------------------------------------------
Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue

if ($failures -gt 0) {
    Write-Output "`n$failures assertion(s) FAILED"
    exit 1
} else {
    Write-Output "`nAll assertions passed."
    exit 0
}
