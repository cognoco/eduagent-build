<#
.SYNOPSIS
    WI-1563 non-agent supervisor watchdog  -  Windows implementation of the algorithm in
    _quartet/library/supervisor-watchdog-contract.md. Polls one or more heartbeat.json files
    (_quartet/library/heartbeat-contract.md), and resume-relaunches a session ONLY once its
    process is confirmed gone (not just quiet) AND its recorded token-window reset time has
    passed. Never itself an agent/LLM, so it can never be rate-limited into uselessness.

.DESCRIPTION
    Run every 10 minutes by a Windows Scheduled Task (see register-supervisor-watchdog-task.ps1).
    Pure, deterministic given -Now  -  same shape as clacks/l1-liveness-check.js's --now convention,
    so a simulated death can be tested without waiting real hours.

.PARAMETER HeartbeatPath
    One or more paths to heartbeat.json files to watch (see heartbeat-contract.md for the shape
    and path convention). No new manifest schema  -  the caller/registration script lists these
    explicitly, the same way monitor-manifest.json lists watcher commands.

.PARAMETER Now
    ISO-8601 UTC timestamp to treat as "now". Defaults to the real current time. Exists purely for
    deterministic testing of the staleness/window-gate logic.

.PARAMETER StaleThresholdMinutes
    Heartbeat age past which a session is considered possibly-dead. Default 30  -  see
    supervisor-watchdog-contract.md "Staleness threshold" for the false-positive-safety rationale.

.EXAMPLE
    ./supervisor-watchdog.ps1 -HeartbeatPath C:\.tools\Nexus\_quartet\working\program\heartbeat.json

.EXAMPLE (deterministic test)
    ./supervisor-watchdog.ps1 -HeartbeatPath .\fixture\heartbeat.json -Now "2026-07-05T00:35:00Z"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string[]]$HeartbeatPath,

    [string]$Now,

    [int]$StaleThresholdMinutes = 30
)

$ErrorActionPreference = "Stop"

function Get-NowUtc {
    if ($Now) { return [DateTime]::Parse($Now, $null, [System.Globalization.DateTimeStyles]::AdjustToUniversal -bor [System.Globalization.DateTimeStyles]::AssumeUniversal) }
    return (Get-Date).ToUniversalTime()
}

function Backoff-Minutes([int]$attempt) {
    switch ($attempt) {
        1 { return 10 }
        2 { return 30 }
        3 { return 60 }
        default { return 120 }
    }
}

function Add-Breadcrumb([string]$dir, [hashtable]$fields) {
    $line = [ordered]@{ ts = (Get-NowUtc).ToString("o") }
    foreach ($k in $fields.Keys) { $line[$k] = $fields[$k] }
    $path = Join-Path $dir "supervisor-recovery.jsonl"
    ($line | ConvertTo-Json -Compress) | Add-Content -Path $path -Encoding utf8
}

function Get-RecoveryState([string]$dir) {
    $path = Join-Path $dir "supervisor-recovery-state.json"
    if (Test-Path $path) {
        try { return (Get-Content $path -Raw | ConvertFrom-Json) } catch { }
    }
    return [pscustomobject]@{ attempt_count = 0; next_attempt_not_before = $null }
}

function Set-RecoveryState([string]$dir, $state) {
    $path = Join-Path $dir "supervisor-recovery-state.json"
    ($state | ConvertTo-Json) | Set-Content -Path $path -Encoding utf8
}

function Process-Heartbeat([string]$path) {
    $now = Get-NowUtc
    $dir = Split-Path -Parent $path

    if (-not (Test-Path $path)) {
        Write-Output "[$($now.ToString('o'))] SKIP $path  -  heartbeat file not found"
        return
    }
    $hb = Get-Content $path -Raw | ConvertFrom-Json
    $lastAlive = [DateTime]::Parse($hb.last_alive, $null, [System.Globalization.DateTimeStyles]::AdjustToUniversal -bor [System.Globalization.DateTimeStyles]::AssumeUniversal)
    $windowResetsAt = [DateTime]::Parse($hb.window_resets_at, $null, [System.Globalization.DateTimeStyles]::AdjustToUniversal -bor [System.Globalization.DateTimeStyles]::AssumeUniversal)
    $stalenessMin = ($now - $lastAlive).TotalMinutes

    $state = Get-RecoveryState $dir

    # A resumed session's last_alive advances past our last respawn attempt -> clear backoff.
    if ($state.attempt_count -gt 0 -and $stalenessMin -lt $StaleThresholdMinutes) {
        $state = [pscustomobject]@{ attempt_count = 0; next_attempt_not_before = $null }
        Set-RecoveryState $dir $state
        Add-Breadcrumb $dir @{ session_id = $hb.session_id; event = "recovered"; msg = "[orch-status] heartbeat resumed  -  backoff state cleared" }
    }

    if ($stalenessMin -lt $StaleThresholdMinutes) {
        Write-Output "[$($now.ToString('o'))] HEALTHY $($hb.session_id)  -  last_alive $($stalenessMin.ToString('N1'))min ago"
        return
    }

    # Stale. Duplicate-session guard: only trust PID when the heartbeat's host is this host.
    $localHost = $env:COMPUTERNAME
    if ($hb.host -eq $localHost -and $hb.pid) {
        $proc = Get-Process -Id $hb.pid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Output "[$($now.ToString('o'))] HANG-SUSPECTED $($hb.session_id)  -  stale $($stalenessMin.ToString('N0'))min but pid $($hb.pid) still running; NOT respawning"
            Add-Breadcrumb $dir @{ session_id = $hb.session_id; event = "hang-suspected"; msg = "[orch-status] heartbeat stale $($stalenessMin.ToString('N0'))min but process $($hb.pid) alive on $localHost  -  no respawn (duplicate-session guard)" }
            return
        }
    }

    # Window-reset gate  -  never respawn before the recorded reset time, regardless of cause of death.
    if ($now -lt $windowResetsAt) {
        Write-Output "[$($now.ToString('o'))] WINDOW-NOT-RESET $($hb.session_id)  -  stale but window resets $($windowResetsAt.ToString('o')); waiting"
        Add-Breadcrumb $dir @{ session_id = $hb.session_id; event = "window-wait"; msg = "[orch-status] stale since $($lastAlive.ToString('o')); window not reset until $($windowResetsAt.ToString('o'))  -  not respawning" }
        return
    }

    # Backoff gate  -  paces retries of a broken relaunch; cannot fire before the window gate above.
    if ($state.next_attempt_not_before) {
        $nextOk = [DateTime]::Parse($state.next_attempt_not_before, $null, [System.Globalization.DateTimeStyles]::AdjustToUniversal -bor [System.Globalization.DateTimeStyles]::AssumeUniversal)
        if ($now -lt $nextOk) {
            Write-Output "[$($now.ToString('o'))] BACKOFF-WAIT $($hb.session_id)  -  next attempt not before $($nextOk.ToString('o'))"
            return
        }
    }

    $attempt = [int]$state.attempt_count + 1
    if ($attempt -ge 6) {
        Write-Output "[$($now.ToString('o'))] ESCALATE $($hb.session_id)  -  5 respawn attempts exhausted, giving up"
        Add-Breadcrumb $dir @{ session_id = $hb.session_id; event = "escalate"; attempt = $attempt; msg = "[orch-status] needs-operator: 5 respawn attempts exhausted for $($hb.session_id)  -  clear supervisor-recovery-state.json to retry" }
        return
    }

    Write-Output "[$($now.ToString('o'))] RESPAWN $($hb.session_id)  -  attempt $attempt : $($hb.relaunch_command)"
    Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-Command", $hb.relaunch_command) -WindowStyle Hidden | Out-Null

    $backoffMin = Backoff-Minutes $attempt
    $newState = [pscustomobject]@{
        attempt_count            = $attempt
        next_attempt_not_before  = $now.AddMinutes($backoffMin).ToString("o")
    }
    Set-RecoveryState $dir $newState
    Add-Breadcrumb $dir @{ session_id = $hb.session_id; event = "respawn-attempt"; attempt = $attempt; msg = "[orch-status] stale since $($lastAlive.ToString('o')); window reset confirmed $($windowResetsAt.ToString('o')); relaunching (attempt $attempt, next retry not before $($newState.next_attempt_not_before) if this fails)" }
}

foreach ($p in $HeartbeatPath) {
    Process-Heartbeat -path $p
}
