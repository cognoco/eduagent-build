param(
  [string]$Repo = (Get-Location).Path,
  [string]$ConfigPath = (Join-Path (Get-Location).Path "_quartet\working\lanes\mobile-ux-nav\_state\reviewer-workstreams.json"),
  [string]$DatabaseId = "f170be9e04ae45d4961828f2438666bd",
  [int]$PollSeconds = 600,
  [string]$OutDir = (Join-Path (Get-Location).Path "_quartet\working\lanes\mobile-ux-nav\_state\cosmo-status-poller")
)

$ErrorActionPreference = "Stop"

function Write-PollerLog {
  param([string]$Message)
  $stamp = (Get-Date).ToUniversalTime().ToString("o")
  $line = "[$stamp] $Message"
  Write-Output $line
  Add-Content -LiteralPath $script:LogPath -Value $line -Encoding UTF8
}

function Get-PlainTitle {
  param($Property)
  if (-not $Property -or -not $Property.title) {
    return ""
  }
  return (($Property.title | ForEach-Object { $_.plain_text }) -join "")
}

function Invoke-NotionQuery {
  param([hashtable]$Body)
  $json = $Body | ConvertTo-Json -Depth 30
  Invoke-RestMethod `
    -Method Post `
    -Uri ("https://api.notion.com/v1/databases/" + $DatabaseId + "/query") `
    -Headers $script:Headers `
    -Body $json
}

function Get-WorkstreamItems {
  param($Workstream)
  $items = @()
  $cursor = $null
  do {
    $body = @{
      page_size = 100
      filter = @{ property = "Workstream"; relation = @{ contains = $Workstream.id } }
      sorts = @(@{ property = "ID"; direction = "ascending" })
    }
    if ($cursor) {
      $body.start_cursor = $cursor
    }
    $res = Invoke-NotionQuery -Body $body
    $items += $res.results
    $cursor = if ($res.has_more) { $res.next_cursor } else { $null }
  } while ($cursor)
  return $items
}

function Convert-ToSnapshotRow {
  param($Workstream, $Page)
  $props = $Page.properties
  $unique = $props.ID.unique_id
  $wi = if ($unique) { ($unique.prefix ?? "WI") + "-" + $unique.number } else { $Page.id }
  [pscustomobject]@{
    key = $Workstream.name + "::" + $wi
    workstream = $Workstream.name
    wi = $wi
    name = Get-PlainTitle $props.Name
    stage = $props.Stage.select.name
    state = $props.State.select.name
    resolution = $props.Resolution.select.name
    modified = $props.Modified.last_edited_time
  }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$script:LogPath = Join-Path $OutDir "status-poller.log"
$statePath = Join-Path $OutDir "state.json"

$token = $env:NOTION_TOKEN
if (-not $token) {
  throw "NOTION_TOKEN missing"
}

$script:Headers = @{
  Authorization = "Bearer $token"
  "Notion-Version" = "2022-06-28"
  "Content-Type" = "application/json"
}

$workstreams = Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
$previous = @{}
if (Test-Path -LiteralPath $statePath) {
  $saved = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
  foreach ($row in $saved) {
    $previous[$row.key] = $row
  }
}

Write-PollerLog "starting Cosmo status poller; pollSeconds=$PollSeconds; workstreams=$((($workstreams | ForEach-Object { $_.name }) -join ', '))"

while ($true) {
  try {
    $currentRows = @()
    foreach ($ws in $workstreams) {
      $items = Get-WorkstreamItems -Workstream $ws
      foreach ($item in $items) {
        $row = Convert-ToSnapshotRow -Workstream $ws -Page $item
        $currentRows += $row
        $prior = $previous[$row.key]
        if (-not $prior) {
          Write-PollerLog ("baseline {0} {1}: Stage={2}; State={3}; Resolution={4}" -f $row.workstream, $row.wi, $row.stage, $row.state, $row.resolution)
        } elseif ($prior.stage -ne $row.stage -or $prior.state -ne $row.state -or $prior.resolution -ne $row.resolution) {
          Write-PollerLog ("change {0} {1}: Stage {2}->{3}; State {4}->{5}; Resolution {6}->{7}" -f $row.workstream, $row.wi, $prior.stage, $row.stage, $prior.state, $row.state, $prior.resolution, $row.resolution)
        }
        $previous[$row.key] = $row
      }
    }

    $currentRows | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statePath -Encoding UTF8
    Write-PollerLog ("poll complete; rows={0}; nextPollSeconds={1}" -f $currentRows.Count, $PollSeconds)
  } catch {
    Write-PollerLog ("poll error: " + $_.Exception.Message)
  }

  Start-Sleep -Seconds $PollSeconds
}
