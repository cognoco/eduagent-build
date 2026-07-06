param(
  [Parameter(Mandatory=$true)][string]$InboxPath,
  [Parameter(Mandatory=$true)][string]$SeenPath,
  [Parameter(Mandatory=$true)][string]$LogPath,
  [int]$PollSeconds = 15
)

$ErrorActionPreference = "Stop"
$lastSeen = $null
if (Test-Path -LiteralPath $SeenPath) {
  $lastSeen = (Get-Content -LiteralPath $SeenPath -Raw).Trim()
}

while ($true) {
  try {
    if (Test-Path -LiteralPath $InboxPath) {
      $lines = Get-Content -LiteralPath $InboxPath
      foreach ($line in $lines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $event = $line | ConvertFrom-Json
        if ($null -eq $lastSeen -or [string]$event.id -gt $lastSeen) {
          $stamp = (Get-Date).ToUniversalTime().ToString("o")
          Add-Content -LiteralPath $LogPath -Value "$stamp inbox $($event.id): $($event.type) $($event.msg)"
          $lastSeen = [string]$event.id
          Set-Content -LiteralPath $SeenPath -Value $lastSeen
        }
      }
    }
  } catch {
    $stamp = (Get-Date).ToUniversalTime().ToString("o")
    Add-Content -LiteralPath $LogPath -Value "$stamp ERROR $($_.Exception.Message)"
  }
  Start-Sleep -Seconds $PollSeconds
}
