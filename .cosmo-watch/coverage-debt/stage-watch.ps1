param(
  [Parameter(Mandatory=$true)][string]$StatePath,
  [Parameter(Mandatory=$true)][string]$LogPath,
  [int]$PollSeconds = 60
)

$ErrorActionPreference = "Stop"
$DataSourceId = "36fd1119-9955-4684-8bfe-deb145e6a21f"
$WorkstreamId = "3938bce9-1f7c-81ad-add6-f36bf7c317bc"

function Read-Items {
  $headers = @{
    Authorization = "Bearer " + $env:NOTION_TOKEN
    "Notion-Version" = "2025-09-03"
    "Content-Type" = "application/json"
  }
  $body = @{
    page_size = 100
    filter = @{ property = "Workstream"; relation = @{ contains = $WorkstreamId } }
    sorts = @(@{ property = "Workstream Order"; direction = "ascending" })
  } | ConvertTo-Json -Depth 10
  $resp = Invoke-RestMethod -Method Post -Uri "https://api.notion.com/v1/data_sources/$DataSourceId/query" -Headers $headers -Body $body
  $out = @{}
  foreach ($row in $resp.results) {
    $p = $row.properties
    $wi = "$($p.ID.unique_id.prefix)-$($p.ID.unique_id.number)"
    $out[$wi] = @{
      stage = $p.Stage.select.name
      state = $p.State.select.name
      resolution = $p.Resolution.select.name
      fixedIn = (($p."Fixed In".rich_text | ForEach-Object plain_text) -join "")
    }
  }
  return $out
}

$last = @{}
if (Test-Path -LiteralPath $StatePath) {
  $last = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json -AsHashtable
}

while ($true) {
  try {
    $current = Read-Items
    foreach ($wi in $current.Keys) {
      $old = $last[$wi]
      $new = $current[$wi]
      if ($null -eq $old -or $old.stage -ne $new.stage -or $old.state -ne $new.state -or $old.resolution -ne $new.resolution) {
        $stamp = (Get-Date).ToUniversalTime().ToString("o")
        $oldStage = if ($null -eq $old) { "(seed)" } else { "$($old.stage)/$($old.state)/$($old.resolution)" }
        $newStage = "$($new.stage)/$($new.state)/$($new.resolution)"
        Add-Content -LiteralPath $LogPath -Value "$stamp $wi $oldStage -> $newStage"
      }
    }
    $current | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StatePath
    $last = $current
  } catch {
    $stamp = (Get-Date).ToUniversalTime().ToString("o")
    Add-Content -LiteralPath $LogPath -Value "$stamp ERROR $($_.Exception.Message)"
  }
  Start-Sleep -Seconds $PollSeconds
}
