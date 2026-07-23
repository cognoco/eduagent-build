import { spawnSync } from 'node:child_process';
import path from 'node:path';

const RUNNER_PATH = path.resolve(
  __dirname,
  '..',
  'e2e',
  'scripts',
  'run-wi2176-orion-evidence.ps1',
);

const POWERSHELL_HARNESS = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$runnerPath = [Environment]::GetEnvironmentVariable('WI2176_RUNNER_PATH')
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
  $runnerPath,
  [ref]$tokens,
  [ref]$parseErrors
)
if ($parseErrors.Count -gt 0) {
  throw "Runner did not parse: $($parseErrors[0].Message)"
}

$cleanupFunction = $ast.Find(
  {
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq 'Invoke-CleanupActions'
  },
  $true
)
if (-not $cleanupFunction) {
  throw 'Expected Invoke-CleanupActions to own cleanup failure isolation'
}
Invoke-Expression $cleanupFunction.Extent.Text
$completionFunction = $ast.Find(
  {
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq 'Complete-EvidenceRun'
  },
  $true
)
if (-not $completionFunction) {
  throw 'Expected Complete-EvidenceRun to publish only after cleanup'
}
Invoke-Expression $completionFunction.Extent.Text

foreach ($reverseFunctionName in @(
  'Get-ReverseLocalSocket',
  'Restore-ReverseMapping'
)) {
  $reverseFunction = $ast.Find(
    {
      param($node)
      $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -eq $reverseFunctionName
    },
    $true
  )
  if (-not $reverseFunction) {
    throw "Expected $reverseFunctionName to preserve the prior adb reverse mapping"
  }
  Invoke-Expression $reverseFunction.Extent.Text
}

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)]$Actual,
    [Parameter(Mandatory = $true)]$Expected,
    [Parameter(Mandatory = $true)][string]$Message
  )
  if ($Actual -ne $Expected) {
    throw "$Message (expected '$Expected', found '$Actual')"
  }
}

$reverseCalls = [System.Collections.Generic.List[string]]::new()
$reverseListOutput = @'
host-19 tcp:8082 tcp:8082
host-19 tcp:8787 tcp:9876
'@
function Invoke-AdbText {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  if (($Arguments -join ' ') -eq 'reverse --list') {
    return $reverseListOutput
  }
  [void]$reverseCalls.Add($Arguments -join ' ')
  return ''
}

Assert-Equal (
  Get-ReverseLocalSocket -RemoteSocket 'tcp:8787'
) 'tcp:9876' 'Prior adb reverse mapping was not parsed'
Restore-ReverseMapping -RemoteSocket 'tcp:8787' -OriginalLocalSocket 'tcp:9876' -WasChanged $false
Assert-Equal $reverseCalls.Count 0 'Unchanged adb reverse mapping was mutated'
Restore-ReverseMapping -RemoteSocket 'tcp:8787' -OriginalLocalSocket 'tcp:9876' -WasChanged $true
Assert-Equal (
  $reverseCalls[0]
) 'reverse tcp:8787 tcp:9876' 'Prior adb reverse mapping was not restored'
$reverseCalls.Clear()
Restore-ReverseMapping -RemoteSocket 'tcp:8787' -OriginalLocalSocket $null -WasChanged $true
Assert-Equal (
  $reverseCalls[0]
) 'reverse --remove tcp:8787' 'New adb reverse mapping was not removed'

$requiredCleanupNames = @(
  'restore adb reverse tcp:8787',
  'restore wm size',
  'restore wm density',
  'restore system font_scale',
  'restore global window_animation_scale',
  'restore global transition_animation_scale',
  'restore global animator_duration_scale',
  'remove raw hierarchy capture'
)
$stringConstants = @(
  $ast.FindAll(
    {
      param($node)
      $node -is [System.Management.Automation.Language.StringConstantExpressionAst]
    },
    $true
  ) | ForEach-Object { $_.Value }
)
foreach ($cleanupName in $requiredCleanupNames) {
  if ($cleanupName -notin $stringConstants) {
    throw "Runner does not register cleanup action '$cleanupName'"
  }
}

$attempted = [System.Collections.Generic.List[string]]::new()
$primaryActions = @(
  [pscustomobject]@{
    Name = 'restore one'
    Action = {
      [void]$attempted.Add('restore one')
      throw 'restore one failed'
    }.GetNewClosure()
  },
  [pscustomobject]@{
    Name = 'restore two'
    Action = {
      [void]$attempted.Add('restore two')
    }.GetNewClosure()
  },
  [pscustomobject]@{
    Name = 'raw capture'
    Action = {
      [void]$attempted.Add('raw capture')
      throw 'raw capture failed'
    }.GetNewClosure()
  }
)
$primaryFailure = $null
try {
  throw 'primary failure sentinel'
} catch {
  $primaryFailure = $_
}
$caughtPrimary = $null
try {
  Invoke-CleanupActions -Actions $primaryActions -PrimaryFailure $primaryFailure -WarningAction SilentlyContinue
} catch {
  $caughtPrimary = $_
}
Assert-Equal ($attempted -join ',') 'restore one,restore two,raw capture' 'Cleanup stopped after an earlier failure'
Assert-Equal $caughtPrimary.Exception.Message 'primary failure sentinel' 'Cleanup replaced the primary failure'

$attempted.Clear()
$cleanupOnlyActions = @(
  [pscustomobject]@{
    Name = 'restore one'
    Action = {
      [void]$attempted.Add('restore one')
      throw 'restore one failed'
    }.GetNewClosure()
  },
  [pscustomobject]@{
    Name = 'restore two'
    Action = {
      [void]$attempted.Add('restore two')
    }.GetNewClosure()
  },
  [pscustomobject]@{
    Name = 'raw capture'
    Action = {
      [void]$attempted.Add('raw capture')
      throw 'raw capture failed'
    }.GetNewClosure()
  }
)
$caughtCleanup = $null
try {
  Invoke-CleanupActions -Actions $cleanupOnlyActions
} catch {
  $caughtCleanup = $_
}
Assert-Equal ($attempted -join ',') 'restore one,restore two,raw capture' 'Cleanup-only failure stopped later actions'
if (
  $caughtCleanup.Exception.Message -notmatch 'restore one' -or
  $caughtCleanup.Exception.Message -notmatch 'raw capture'
) {
  throw "Cleanup-only failure did not identify every failed action: $($caughtCleanup.Exception.Message)"
}

$finalizationRoot = Join-Path (
  [System.IO.Path]::GetTempPath()
) "wi2176-finalization-$PID-$([guid]::NewGuid().ToString('N'))"
$receiptPath = Join-Path $finalizationRoot 'receipt.json'
[System.IO.Directory]::CreateDirectory($finalizationRoot) | Out-Null
try {
  $receipt = [ordered]@{
    workItem = 'WI-2176'
    status = 'SOUND'
  }
  [System.IO.File]::WriteAllText($receiptPath, '{"status":"STALE"}')
  $cleanupFailed = $null
  $cleanupFailureOutput = [System.Collections.Generic.List[object]]::new()
  try {
    $cleanupFailureArguments = @{
      CleanupActions = @(
        [pscustomobject]@{
          Name = 'restore profile'
          Action = { throw 'restore profile failed' }
        }
      )
      Receipt = $receipt
      ReceiptPath = $receiptPath
    }
    Complete-EvidenceRun @cleanupFailureArguments |
      ForEach-Object { [void]$cleanupFailureOutput.Add($_) }
  } catch {
    $cleanupFailed = $_
  }
  if (-not $cleanupFailed) {
    throw 'Expected cleanup failure to fail evidence finalization'
  }
  if (Test-Path -LiteralPath $receiptPath) {
    throw 'Cleanup failure left a valid-looking receipt on disk'
  }
  if (
    ($cleanupFailureOutput -join [Environment]::NewLine) -match
      'WI-2176_ORION_EVIDENCE=SOUND'
  ) {
    throw 'Cleanup failure emitted a false SOUND signal'
  }

  $successArguments = @{
    CleanupActions = @(
      [pscustomobject]@{
        Name = 'restore profile'
        Action = {}
      }
    )
    Receipt = $receipt
    ReceiptPath = $receiptPath
  }
  $successfulOutput = @(Complete-EvidenceRun @successArguments)
  if (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) {
    throw 'Successful cleanup did not publish the evidence receipt'
  }
  if (
    ($successfulOutput -join [Environment]::NewLine) -notmatch
      'WI-2176_ORION_EVIDENCE=SOUND'
  ) {
    throw 'Successful cleanup did not emit the SOUND signal'
  }
} finally {
  if (Test-Path -LiteralPath $finalizationRoot -PathType Container) {
    Remove-Item -LiteralPath $finalizationRoot -Recurse -Force
  }
}

Write-Output 'WI-2176 cleanup contract: PASS'
`;

function safePowerShellEnvironment(): NodeJS.ProcessEnv {
  const safeKeys = [
    'PATH',
    'Path',
    'SystemRoot',
    'ComSpec',
    'PATHEXT',
    'TEMP',
    'TMP',
    'HOME',
  ];
  const environment: NodeJS.ProcessEnv = { NODE_ENV: 'test' };
  for (const key of safeKeys) {
    if (process.env[key] !== undefined) {
      environment[key] = process.env[key];
    }
  }
  environment.WI2176_RUNNER_PATH = RUNNER_PATH;
  return environment;
}

const powershellExecutables =
  process.platform === 'win32' ? ['pwsh.exe', 'powershell.exe'] : ['pwsh'];

test.each(powershellExecutables)(
  'attempts every cleanup action and preserves primary failure precedence under %s',
  (powershellExecutable) => {
    const encodedCommand = Buffer.from(POWERSHELL_HARNESS, 'utf16le').toString(
      'base64',
    );
    const result = spawnSync(
      powershellExecutable,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        encodedCommand,
      ],
      {
        encoding: 'utf8',
        env: safePowerShellEnvironment(),
      },
    );

    expect({
      error: result.error?.message,
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
    }).toEqual({
      error: undefined,
      status: 0,
      stderr: '',
      stdout: expect.stringContaining('WI-2176 cleanup contract: PASS'),
    });
  },
);
