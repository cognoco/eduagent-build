[CmdletBinding()]
param(
  [string]$DeviceId = 'emulator-5554',
  [string]$AdbBin = 'C:\Android\Sdk\platform-tools\adb.exe',
  [string]$OutputDir
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = [System.IO.Path]::GetFullPath(
  (Join-Path $scriptDir '..\..\..\..')
)
if (-not $OutputDir) {
  $OutputDir = Join-Path $repoRoot '.tmp\WI-2176\capture'
}
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)
$headerOutput = Join-Path $OutputDir 'orion-support-hub-header.xml'
$endOutput = Join-Path $OutputDir 'orion-scope-options-end.xml'
$headerDevicePath = '/sdcard/wi2176-orion-support-hub-header.xml'
$endDevicePath = '/sdcard/wi2176-orion-scope-options-end.xml'

function Invoke-AdbText {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  $output = & $AdbBin -s $DeviceId @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "adb failed ($LASTEXITCODE): $($Arguments -join ' ')`n$($output -join [Environment]::NewLine)"
  }
  return ($output -join [Environment]::NewLine).Trim()
}

function Assert-ProfileMatch {
  param(
    [string]$Actual,
    [string]$Pattern,
    [string]$Failure
  )

  if ($Actual -notmatch $Pattern) {
    throw "WI-2176_ORION_PROFILE=FAILED $Failure"
  }
}

function Get-EffectiveDensityDpi {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DensityOutput
  )

  $override = [regex]::Match(
    $DensityOutput,
    '(?m)^\s*Override density:\s*(?<dpi>\d+)\s*$'
  )
  if ($override.Success) {
    return [int]$override.Groups['dpi'].Value
  }

  $physical = [regex]::Match(
    $DensityOutput,
    '(?m)^\s*Physical density:\s*(?<dpi>\d+)\s*$'
  )
  if (-not $physical.Success) {
    throw 'WI-2176_ORION_PROFILE=FAILED unable to read effective density'
  }
  return [int]$physical.Groups['dpi'].Value
}

function Save-Hierarchy {
  param(
    [string]$DevicePath,
    [string]$LocalPath
  )

  [void](Invoke-AdbText shell uiautomator dump $DevicePath)
  $xml = & $AdbBin -s $DeviceId exec-out cat $DevicePath 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "adb hierarchy read failed ($LASTEXITCODE): $DevicePath"
  }
  $xmlText = ($xml -join [Environment]::NewLine)
  if ($xmlText -notmatch '<hierarchy\b') {
    throw "adb hierarchy read did not contain a <hierarchy> root: $DevicePath"
  }
  $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText(
    $LocalPath,
    $xmlText,
    $utf8WithoutBom
  )
}

$state = (Invoke-AdbText get-state)
Assert-ProfileMatch $state '^device$' 'expected a connected emulator'

$sdk = (Invoke-AdbText shell getprop ro.build.version.sdk)
$size = (Invoke-AdbText shell wm size)
$density = (Invoke-AdbText shell wm density)
$effectiveDensityDpi = Get-EffectiveDensityDpi $density
$fontScale = (Invoke-AdbText shell settings get system font_scale)
$locale = (Invoke-AdbText shell getprop persist.sys.locale)
if ([string]::IsNullOrWhiteSpace($locale) -or $locale -eq 'null') {
  $locale = Invoke-AdbText shell settings get system system_locales
}
if ([string]::IsNullOrWhiteSpace($locale) -or $locale -eq 'null') {
  $locale = Invoke-AdbText shell getprop ro.product.locale
}
$windowState = Invoke-AdbText shell dumpsys window

Assert-ProfileMatch $sdk '^34$' 'expected Android API 34'
Assert-ProfileMatch $size 'Override size:\s*1080x2280' 'expected override size 1080x2280'
if ($effectiveDensityDpi -ne 480) {
  throw (
    'WI-2176_ORION_PROFILE=FAILED expected effective density 480, found ' +
    $effectiveDensityDpi
  )
}
Assert-ProfileMatch $fontScale '^1(?:\.0)?$' 'expected font_scale 1.0'
Assert-ProfileMatch $locale '^en-US$' 'expected system locale en-US'
Assert-ProfileMatch $windowState 'type=statusBars frame=\[0,0\]\[1080,72\] visible=true' 'expected a visible 72px/24dp status-bar inset'

Write-Output 'WI-2176_ORION_PROFILE=SOUND api=34 physical=1080x2280 density=480 logical=360x760 status_bar=72px/24dp locale=en-US font_scale=1.0'

[System.IO.Directory]::CreateDirectory($OutputDir) | Out-Null
$captureSucceeded = $false
try {
  # Maestro's instrumentation driver owns UIAutomator after a flow. Release
  # that exclusive session before invoking the platform dumper directly.
  [void](Invoke-AdbText shell am force-stop dev.mobile.maestro)
  [void](Invoke-AdbText shell am force-stop dev.mobile.maestro.test)
  Start-Sleep -Milliseconds 500

  Save-Hierarchy $headerDevicePath $headerOutput

  # Move only the horizontal scope strip to its end edge, exposing Me without
  # changing selected scope or navigating the page.
  [void](Invoke-AdbText shell input swipe 720 160 180 160 750)
  Save-Hierarchy $endDevicePath $endOutput

  Push-Location $repoRoot
  try {
    & pnpm exec tsx apps/mobile/scripts/verify-wi2176-orion-header.ts `
      $headerOutput `
      $endOutput
    if ($LASTEXITCODE -ne 0) {
      throw "WI-2176 hierarchy verifier exited with code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  $captureSucceeded = $true
} finally {
  & $AdbBin -s $DeviceId shell rm -f $headerDevicePath $endDevicePath `
    2>$null | Out-Null
  if (-not $captureSucceeded) {
    Remove-Item -LiteralPath $headerOutput -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $endOutput -Force -ErrorAction SilentlyContinue
  }
}
