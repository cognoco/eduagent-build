[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ExpectedGitSha,
  [string]$DeviceId = 'emulator-5554',
  [string]$AdbBin = 'C:\Android\Sdk\platform-tools\adb.exe',
  [string]$AndroidSdk = 'C:\Android\Sdk',
  [string]$BashBin = 'C:\Program Files\Git\bin\bash.exe',
  [string]$ApiUrl = 'http://127.0.0.1:8787',
  [string]$SeedSlot = 'native-01',
  [string]$OutputDir
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = [System.IO.Path]::GetFullPath(
  (Join-Path $scriptDir '..\..\..\..')
)
$workItemTempRoot = [System.IO.Path]::GetFullPath(
  (Join-Path $repoRoot '.tmp\WI-2176')
)
$startedAt = (Get-Date).ToUniversalTime()
$runStamp = $startedAt.ToString('yyyyMMddTHHmmssZ')
if (-not $OutputDir) {
  $OutputDir = Join-Path $workItemTempRoot "$runStamp-$PID"
}
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)
if (
  -not $OutputDir.StartsWith(
    $workItemTempRoot + [System.IO.Path]::DirectorySeparatorChar,
    [System.StringComparison]::OrdinalIgnoreCase
  )
) {
  throw "OutputDir must resolve beneath $workItemTempRoot"
}

$captureDir = Join-Path $OutputDir 'raw-hierarchy'
$receiptPath = Join-Path $OutputDir 'wi2176-orion-receipt.json'
$screenshotPath = Join-Path $OutputDir 'wi2176-orion-support-hub.png'
$deviceScreenshotPath = '/sdcard/wi2176-orion-support-hub.png'
$flowPath = 'apps/mobile/e2e/flows/v2/v2-supporter-scope-geometry.yaml'
$scenario = 'v2-supporter-self-learning-active'
$apkPath = Join-Path $repoRoot `
  'apps\mobile\android\app\build\outputs\apk\release\app-release.apk'

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath exited with code $LASTEXITCODE"
  }
}

function Invoke-Text {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  $output = & $FilePath @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath exited with code $LASTEXITCODE`: $($output -join [Environment]::NewLine)"
  }
  return ($output -join [Environment]::NewLine).Trim()
}

function Invoke-AdbText {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  return Invoke-Text $AdbBin -s $DeviceId @Arguments
}

function Get-Setting {
  param([string]$Namespace, [string]$Name)
  return Invoke-AdbText shell settings get $Namespace $Name
}

function Restore-WmValue {
  param(
    [string]$Kind,
    [string]$OriginalOutput,
    [string]$OverridePattern
  )

  if ($OriginalOutput -match $OverridePattern) {
    [void](Invoke-AdbText shell wm $Kind $Matches[1])
  } else {
    [void](Invoke-AdbText shell wm $Kind reset)
  }
}

function Restore-Setting {
  param([string]$Namespace, [string]$Name, [string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value) -or $Value -eq 'null') {
    [void](Invoke-AdbText shell settings delete $Namespace $Name)
  } else {
    [void](Invoke-AdbText shell settings put $Namespace $Name $Value)
  }
}

function Assert-ExactSourceState {
  param([string]$Checkpoint)

  $checkpointGitSha = Invoke-Text git rev-parse HEAD
  if ($checkpointGitSha -ne $ExpectedGitSha) {
    throw "$Checkpoint Git SHA changed: expected $ExpectedGitSha but found $checkpointGitSha"
  }

  $statusOutput = Invoke-Text git status --porcelain --untracked-files=all
  $unsafeStatus = @(
    $statusOutput -split "`r?`n" |
      Where-Object {
        -not [string]::IsNullOrWhiteSpace($_) -and
        $_ -notmatch '^\?\? _quartet/working/lanes/bid-33-heavy-singles/'
      }
  )
  if ($unsafeStatus.Count -gt 0) {
    throw "$Checkpoint source tree is not exact:`n$($unsafeStatus -join [Environment]::NewLine)"
  }
}

foreach ($requiredExecutable in @($AdbBin, $BashBin)) {
  if (-not (Test-Path -LiteralPath $requiredExecutable -PathType Leaf)) {
    throw "Required executable not found: $requiredExecutable"
  }
}
foreach ($requiredEnvironmentVariable in @(
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'TEST_SEED_SECRET'
)) {
  $value = [Environment]::GetEnvironmentVariable(
    $requiredEnvironmentVariable,
    'Process'
  )
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Required host environment variable is missing: $requiredEnvironmentVariable"
  }
}

Push-Location $repoRoot
try {
  Assert-ExactSourceState 'Pre-build'
  $actualGitSha = $ExpectedGitSha
} finally {
  Pop-Location
}

$devicesOutput = Invoke-Text $AdbBin devices
$deviceIds = @(
  $devicesOutput -split "`r?`n" |
    Where-Object { $_ -match "\tdevice$" } |
    ForEach-Object { ($_ -split "`t")[0] }
)
if ($deviceIds.Count -ne 1 -or $deviceIds[0] -ne $DeviceId) {
  throw "Expected one exclusive device session on $DeviceId; found $($deviceIds -join ', ')"
}
if ((Invoke-AdbText shell getprop ro.build.version.sdk) -ne '34') {
  throw 'WI-2176 evidence requires Orion Android API 34'
}

$health = Invoke-WebRequest -Uri "$ApiUrl/v1/health" -UseBasicParsing
if ($health.StatusCode -ne 200) {
  throw "API health check failed with HTTP $($health.StatusCode)"
}

$buildToolsDir = Get-ChildItem -LiteralPath (Join-Path $AndroidSdk 'build-tools') `
  -Directory |
  Sort-Object { [version]$_.Name } |
  Select-Object -Last 1
if (-not $buildToolsDir) {
  throw "No Android build-tools found beneath $AndroidSdk"
}
$aaptBin = Join-Path $buildToolsDir.FullName 'aapt.exe'
$apksignerBin = Join-Path $buildToolsDir.FullName 'apksigner.bat'

$originalSize = Invoke-AdbText shell wm size
$originalDensity = Invoke-AdbText shell wm density
$originalFontScale = Get-Setting system font_scale
$originalWindowAnimation = Get-Setting global window_animation_scale
$originalTransitionAnimation = Get-Setting global transition_animation_scale
$originalAnimatorDuration = Get-Setting global animator_duration_scale
$profilePrepared = $false
$captureOutput = ''

try {
  [System.IO.Directory]::CreateDirectory($OutputDir) | Out-Null
  [System.IO.Directory]::CreateDirectory('C:\Temp\wi2176-evidence') | Out-Null
  $env:TEMP = 'C:\Temp\wi2176-evidence'
  $env:TMP = 'C:\Temp\wi2176-evidence'
  $env:CI = 'true'
  $env:NODE_ENV = 'production'
  $env:EXPO_PUBLIC_E2E = 'true'
  $env:EXPO_PUBLIC_ENABLE_MODE_NAV = 'true'
  $env:EXPO_PUBLIC_ENABLE_MODE_NAV_V1 = 'true'
  $env:EXPO_PUBLIC_ENABLE_MODE_NAV_V2 = 'true'
  $env:EXPO_PUBLIC_API_URL = 'http://10.0.2.2:8787'
  $env:EXPO_PUBLIC_CLERK_OPENAI_SSO_SLUG = 'openai'
  $env:SENTRY_DISABLE_AUTO_UPLOAD = 'true'

  Push-Location $repoRoot
  try {
    Invoke-Checked pnpm exec tsc --build packages/schemas/tsconfig.lib.json
    Push-Location (Join-Path $repoRoot 'apps\mobile')
    try {
      Invoke-Checked pnpm exec expo prebuild --clean --platform android `
        --no-install
    } finally {
      Pop-Location
    }
    Push-Location (Join-Path $repoRoot 'apps\mobile\android')
    try {
      Invoke-Checked .\gradlew.bat `
        '-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m' `
        assembleRelease `
        --no-daemon `
        --max-workers=2 `
        --stacktrace
    } finally {
      Pop-Location
    }
    Assert-ExactSourceState 'Post-build'
  } finally {
    Pop-Location
  }

  if (-not (Test-Path -LiteralPath $apkPath -PathType Leaf)) {
    throw "Release APK was not produced: $apkPath"
  }
  Invoke-Checked $apksignerBin verify --verbose $apkPath
  $apkBadging = Invoke-Text $aaptBin dump badging $apkPath
  if ($apkBadging -notmatch "package: name='com\.mentomate\.app'") {
    throw 'Built APK does not declare com.mentomate.app'
  }
  $apkSha256 = (Get-FileHash -LiteralPath $apkPath -Algorithm SHA256).Hash

  Invoke-Checked $AdbBin -s $DeviceId install -r $apkPath
  $runAsOutput = & $AdbBin -s $DeviceId shell run-as com.mentomate.app id 2>&1
  if ($LASTEXITCODE -eq 0) {
    throw 'Installed release APK is debuggable; run-as unexpectedly succeeded'
  }
  if (($runAsOutput -join [Environment]::NewLine) -notmatch 'not debuggable') {
    throw "Unable to prove non-debuggable APK: $($runAsOutput -join [Environment]::NewLine)"
  }

  $profilePrepared = $true
  [void](Invoke-AdbText shell wm size 1080x2280)
  [void](Invoke-AdbText shell wm density 480)
  [void](Invoke-AdbText shell settings put system font_scale 1.0)
  [void](Invoke-AdbText shell settings put global window_animation_scale 0)
  [void](Invoke-AdbText shell settings put global transition_animation_scale 0)
  [void](Invoke-AdbText shell settings put global animator_duration_scale 0)
  [void](Invoke-AdbText reverse tcp:8787 tcp:8787)
  $env:API_URL = $ApiUrl
  $env:E2E_SEED_SLOT = $SeedSlot
  $env:ADB_PATH = '/c/Android/Sdk/platform-tools/adb.exe'
  $env:MAESTRO_PATH = '/c/tools/maestro/bin/maestro'
  Push-Location $repoRoot
  try {
    Invoke-Checked $BashBin `
      apps/mobile/e2e/scripts/seed-and-run-release.sh `
      $scenario `
      $flowPath `
      --udid `
      $DeviceId
  } finally {
    Pop-Location
  }

  [void](Invoke-AdbText shell screencap -p $deviceScreenshotPath)
  Invoke-Checked $AdbBin -s $DeviceId pull $deviceScreenshotPath $screenshotPath
  [void](Invoke-AdbText shell rm -f $deviceScreenshotPath)
  $pngHeader = [System.IO.File]::ReadAllBytes($screenshotPath)[0..7]
  if (
    [System.BitConverter]::ToString($pngHeader) -ne
      '89-50-4E-47-0D-0A-1A-0A'
  ) {
    throw 'Captured screenshot does not have a valid PNG signature'
  }
  $screenshotSha256 = (
    Get-FileHash -LiteralPath $screenshotPath -Algorithm SHA256
  ).Hash

  $captureOutput = & powershell.exe `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File (Join-Path $scriptDir 'capture-wi2176-orion-header.ps1') `
    -DeviceId $DeviceId `
    -AdbBin $AdbBin `
    -OutputDir $captureDir 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Hierarchy capture failed ($LASTEXITCODE): $($captureOutput -join [Environment]::NewLine)"
  }
  $captureOutput = ($captureOutput -join [Environment]::NewLine).Trim()
  if ($captureOutput -notmatch 'WI-2176_ORION_HEADER=SOUND') {
    throw "Hierarchy capture did not emit a SOUND verifier receipt: $captureOutput"
  }

  Push-Location $repoRoot
  try {
    Assert-ExactSourceState 'Pre-receipt'
  } finally {
    Pop-Location
  }

  $receipt = [ordered]@{
    workItem = 'WI-2176'
    claimant = 'shepherd:codex:heavy-singles'
    startedAtUtc = $startedAt.ToString('o')
    completedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    gitSha = $actualGitSha
    apk = [ordered]@{
      path = 'apps/mobile/android/app/build/outputs/apk/release/app-release.apk'
      sha256 = $apkSha256
      package = 'com.mentomate.app'
      nonDebuggable = $true
    }
    nativeRun = [ordered]@{
      flow = $flowPath
      scenario = $scenario
      seedSlot = $SeedSlot
      maestroExitCode = 0
      hierarchyVerifier = $captureOutput
    }
    device = [ordered]@{
      id = $DeviceId
      exclusiveConnectedDevices = $deviceIds
      apiLevel = 34
      physicalViewport = '1080x2280'
      densityDpi = 480
      logicalViewport = '360x760'
      fontScale = 1.0
      locale = 'en-US'
    }
    screenshot = [ordered]@{
      file = [System.IO.Path]::GetFileName($screenshotPath)
      sha256 = $screenshotSha256
    }
  }
  $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText(
    $receiptPath,
    ($receipt | ConvertTo-Json -Depth 8),
    $utf8WithoutBom
  )
  Write-Output "WI-2176_ORION_EVIDENCE=SOUND receipt=$receiptPath"
} finally {
  & $AdbBin -s $DeviceId shell rm -f $deviceScreenshotPath 2>$null |
    Out-Null
  if ($profilePrepared) {
    Restore-WmValue size $originalSize 'Override size:\s*(\d+x\d+)'
    Restore-WmValue density $originalDensity 'Override density:\s*(\d+)'
    Restore-Setting system font_scale $originalFontScale
    Restore-Setting global window_animation_scale $originalWindowAnimation
    Restore-Setting global transition_animation_scale `
      $originalTransitionAnimation
    Restore-Setting global animator_duration_scale $originalAnimatorDuration
  }
  if (Test-Path -LiteralPath $captureDir -PathType Container) {
    $resolvedCaptureDir = [System.IO.Path]::GetFullPath($captureDir)
    if (
      $resolvedCaptureDir.StartsWith(
        $workItemTempRoot + [System.IO.Path]::DirectorySeparatorChar,
        [System.StringComparison]::OrdinalIgnoreCase
      )
    ) {
      Remove-Item -LiteralPath $resolvedCaptureDir -Recurse -Force
    }
  }
}
