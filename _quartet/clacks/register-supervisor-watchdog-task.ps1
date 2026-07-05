<#
.SYNOPSIS
    OPERATOR-RUN helper. Registers the WI-1563 supervisor watchdog as a Windows Scheduled Task
    that polls every 10 minutes. This script is NOT executed automatically by any agent  -  it
    modifies system scheduler state, which is an operator action (see supervisor-watchdog-contract.md
    "Poll interval"). Run it yourself once, from an elevated PowerShell, after editing the
    -HeartbeatPath list below to match the sessions you want supervised.

.DESCRIPTION
    Creates/updates a Scheduled Task named "Nexus Supervisor Watchdog" that runs
    supervisor-watchdog.ps1 every 10 minutes, so the watchdog itself survives reboots and can
    never be rate-limited (it is not an agent process).

.EXAMPLE
    # Edit the $heartbeats list below, then:
    .\register-supervisor-watchdog-task.ps1
#>
[CmdletBinding()]
param(
    [string]$TaskName = "Nexus Supervisor Watchdog",
    [string]$RepoRoot = "C:\.tools\Nexus",
    [string[]]$HeartbeatPath = @(
        "C:\.tools\Nexus\_quartet\working\program\heartbeat.json"
        # add one path per supervised lane/program session, e.g.:
        # "C:\.tools\Nexus\_quartet\working\lanes\<lane>\_state\heartbeat.json"
    )
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $RepoRoot "_quartet\clacks\supervisor-watchdog.ps1"
if (-not (Test-Path $scriptPath)) {
    throw "Watchdog script not found at $scriptPath  -  check -RepoRoot."
}

$quotedPaths = ($HeartbeatPath | ForEach-Object { "`"$_`"" }) -join ","
$argumentList = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -HeartbeatPath $quotedPaths"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argumentList
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "WI-1563: non-agent poll of supervised-session heartbeats; resume-relaunches only after a confirmed dead process AND a confirmed-reset token window." -Force

Write-Output "Registered scheduled task '$TaskName' polling every 10 min: $argumentList"
