param(
  [string]$BaseUrl = "https://de.sentry.io/api/0",
  [string]$Org = "zwizzly",
  [string]$Project = "mentomate-api",
  [string]$Query = "is:unresolved",
  [int]$Limit = 60,
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $env:SENTRY_AUTH_TOKEN) {
  throw "SENTRY_AUTH_TOKEN is not set in the environment."
}

if (-not $OutDir) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutDir = Join-Path $PSScriptRoot "runs\$stamp"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$headers = @{
  Authorization = "Bearer $env:SENTRY_AUTH_TOKEN"
}

function New-Uri {
  param(
    [string]$Path,
    [hashtable]$QueryParams = @{}
  )

  $base = $BaseUrl.TrimEnd("/")
  $builder = [System.UriBuilder]::new("$base/$($Path.TrimStart("/"))")
  if ($QueryParams.Count -gt 0) {
    $pairs = foreach ($key in $QueryParams.Keys) {
      $value = [System.Uri]::EscapeDataString([string]$QueryParams[$key])
      "$([System.Uri]::EscapeDataString([string]$key))=$value"
    }
    $builder.Query = ($pairs -join "&")
  }
  $builder.Uri.AbsoluteUri
}

function Invoke-SentryJson {
  param([string]$Uri)

  $response = Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri $Uri
  $response.Content | ConvertFrom-Json -AsHashtable
}

function Redact-Value {
  param($Value)

  if ($null -eq $Value) {
    return $null
  }

  if ($Value -is [hashtable]) {
    $clean = [ordered]@{}
    foreach ($key in $Value.Keys) {
      if ($key -match "(?i)(authorization|cookie|secret|token|password|apikey|api_key|email)") {
        $clean[$key] = "[redacted]"
      } else {
        $clean[$key] = Redact-Value $Value[$key]
      }
    }
    return $clean
  }

  if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
    return @($Value | ForEach-Object { Redact-Value $_ })
  }

  if ($Value -is [string] -and $Value.Length -gt 240) {
    return "$(Redact-String $Value.Substring(0, 240))..."
  }

  if ($Value -is [string]) {
    return Redact-String $Value
  }

  $Value
}

function Redact-String {
  param([string]$Value)

  if ($null -eq $Value) {
    return $null
  }

  $clean = $Value
  $clean = $clean -replace "(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[email]"
  $clean = $clean -replace "\buser_[A-Za-z0-9]+\b", "user_[redacted]"
  $clean = $clean -replace "\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", "[uuid]"
  $clean = $clean -replace "(?i)(token|key|secret)=([^&\s]+)", '$1=[redacted]'
  $clean
}

function Get-Entry {
  param(
    [object[]]$Entries,
    [string]$Type
  )

  @($Entries | Where-Object { $_.type -eq $Type }) | Select-Object -First 1
}

function Get-TagMap {
  param($Tags)

  $map = [ordered]@{}
  foreach ($tag in @($Tags)) {
    if ($tag.key) {
      $map[$tag.key] = Redact-Value $tag.value
    }
  }
  $map
}

function Get-LatestIssueEventSummary {
  param([hashtable]$Issue)

  $eventsUri = New-Uri "/issues/$($Issue.id)/events/" @{ limit = 1 }
  $eventSummaries = @(Invoke-SentryJson $eventsUri)
  $latestSummary = $eventSummaries | Select-Object -First 1
  if (-not $latestSummary -or -not $latestSummary.eventID) {
    return [ordered]@{
      latestEventId = $null
      latestEventCreated = $null
      breadcrumbCount = 0
      breadcrumbs = @()
      exception = $null
      request = $null
      tags = @{}
      extra = @{}
    }
  }

  $eventUri = New-Uri "/projects/$Org/$Project/events/$($latestSummary.eventID)/"
  $event = Invoke-SentryJson $eventUri
  $breadcrumbEntry = Get-Entry $event.entries "breadcrumbs"
  $exceptionEntry = Get-Entry $event.entries "exception"
  $requestEntry = Get-Entry $event.entries "request"
  $extraEntry = Get-Entry $event.entries "extra"
  $crumbs = @($breadcrumbEntry.data.values)

  [ordered]@{
    latestEventId = $event.eventID
    latestEventCreated = $event.dateCreated
    breadcrumbCount = $crumbs.Count
    breadcrumbs = @($crumbs | Select-Object -Last 10 | ForEach-Object {
        [ordered]@{
          timestamp = $_.timestamp
          type = $_.type
          category = $_.category
          level = $_.level
          message = $_.message
          data = Redact-Value $_.data
        }
      })
    exception = if ($exceptionEntry) {
      $values = @($exceptionEntry.data.values)
      $top = $values | Select-Object -First 1
      if ($top) {
        [ordered]@{
          type = $top.type
          value = Redact-Value $top.value
          mechanism = $top.mechanism.type
        }
      } else {
        $null
      }
    } else {
      $null
    }
    request = if ($requestEntry) {
      [ordered]@{
        method = $requestEntry.data.method
        url = Redact-Value $requestEntry.data.url
        query = Redact-Value $requestEntry.data.query
      }
    } else {
      $null
    }
    tags = Get-TagMap $event.tags
    extra = if ($extraEntry) { Redact-Value $extraEntry.data } else { @{} }
  }
}

$issuesUri = New-Uri "/organizations/$Org/issues/" @{
  project = $Project
  query = $Query
  limit = $Limit
}

$issues = @(Invoke-SentryJson $issuesUri)
$report = @()
$index = 0

foreach ($issue in $issues) {
  $index += 1
  Write-Progress -Activity "Collecting Sentry issue breadcrumbs" -Status "$index / $($issues.Count): $($issue.shortId)" -PercentComplete (($index / [Math]::Max(1, $issues.Count)) * 100)
  $eventSummary = Get-LatestIssueEventSummary $issue
  $report += [ordered]@{
    id = $issue.id
    shortId = $issue.shortId
    title = Redact-Value $issue.title
    count = [int]$issue.count
    userCount = $issue.userCount
    level = $issue.level
    status = $issue.status
    priority = $issue.priority
    firstSeen = $issue.firstSeen
    lastSeen = $issue.lastSeen
    permalink = $issue.permalink
    latestEvent = $eventSummary
  }
}

$jsonPath = Join-Path $OutDir "sentry-unresolved-issues.json"
$mdPath = Join-Path $OutDir "sentry-unresolved-issues.md"

$report | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $jsonPath

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# Sentry Unresolved Issues Triage")
$lines.Add("")
$lines.Add("- Generated: $(Get-Date -Format o)")
$lines.Add("- Org: ``$Org``")
$lines.Add("- Project: ``$Project``")
$lines.Add("- Query: ``$Query``")
$lines.Add("- Issues: $($report.Count)")
$lines.Add("")
$lines.Add("| Short ID | Count | Users | Title | Latest Breadcrumbs |")
$lines.Add("|---|---:|---:|---|---|")

foreach ($item in ($report | Sort-Object -Property count -Descending)) {
  $crumbSummary = if ($item.latestEvent.breadcrumbs.Count -gt 0) {
    (($item.latestEvent.breadcrumbs | ForEach-Object {
          $bits = @($_.category, $_.data.method, $_.data.status_code, $_.data.url) | Where-Object { $_ }
          $bits -join " "
        }) -join "<br>")
  } else {
    "(none)"
  }

  $title = ([string]$item.title).Replace("|", "\|")
  $crumbSummary = ([string]$crumbSummary).Replace("|", "\|")
  $lines.Add("| [$($item.shortId)]($($item.permalink)) | $($item.count) | $($item.userCount) | $title | $crumbSummary |")
}

$lines.Add("")
$lines.Add("## Issue Details")
$lines.Add("")

foreach ($item in ($report | Sort-Object -Property count -Descending)) {
  $lines.Add("### $($item.shortId) — $($item.title)")
  $lines.Add("")
  $lines.Add("- Issue ID: ``$($item.id)``")
  $lines.Add("- Count: $($item.count); users: $($item.userCount); status: ``$($item.status)``; level: ``$($item.level)``")
  $lines.Add("- Latest event: ``$($item.latestEvent.latestEventId)`` at ``$($item.latestEvent.latestEventCreated)``")
  $lines.Add("- Permalink: $($item.permalink)")
  if ($item.latestEvent.request) {
    $lines.Add("- Request: ``$($item.latestEvent.request.method)`` $($item.latestEvent.request.url)")
  }
  if ($item.latestEvent.exception) {
    $lines.Add("- Exception: ``$($item.latestEvent.exception.type)`` — $($item.latestEvent.exception.value)")
  }
  $lines.Add("- Breadcrumbs:")
  if ($item.latestEvent.breadcrumbs.Count -eq 0) {
    $lines.Add("  - (none)")
  } else {
    foreach ($crumb in $item.latestEvent.breadcrumbs) {
      $data = ($crumb.data | ConvertTo-Json -Compress -Depth 8)
      $lines.Add("  - ``$($crumb.timestamp)`` ``$($crumb.level)`` ``$($crumb.category)`` $data")
    }
  }
  if ($item.latestEvent.extra.Count -gt 0) {
    $extra = ($item.latestEvent.extra | ConvertTo-Json -Compress -Depth 8)
    $lines.Add("- Extra: ``$extra``")
  }
  $lines.Add("")
}

$lines | Set-Content -Encoding UTF8 $mdPath

[pscustomobject]@{
  issueCount = $report.Count
  jsonPath = (Resolve-Path $jsonPath).Path
  markdownPath = (Resolve-Path $mdPath).Path
} | ConvertTo-Json -Depth 4
