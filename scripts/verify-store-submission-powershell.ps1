param(
  [Parameter(Mandatory = $false)]
  [string]$RunbookPath = 'docs/runbooks/store-submission.md',

  [Parameter(Mandatory = $false)]
  [switch]$ExecuteCleanupContract
)

$ErrorActionPreference = 'Stop'

$source = Get-Content -LiteralPath $RunbookPath -Raw
$blocks = [regex]::Matches(
  $source,
  '(?ms)^```powershell[ \t]*\r?\n(.*?)^```[ \t]*$'
)

if ($blocks.Count -eq 0) {
  throw "No PowerShell blocks found in $RunbookPath"
}

$parseErrors = [System.Collections.Generic.List[string]]::new()

for ($index = 0; $index -lt $blocks.Count; $index++) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseInput(
    $blocks[$index].Groups[1].Value,
    [ref]$tokens,
    [ref]$errors
  )

  foreach ($parseError in $errors) {
    $parseErrors.Add(
      "PowerShell parse error in block $($index + 1), line $($parseError.Extent.StartLineNumber): $($parseError.Message)"
    )
  }
}

if ($parseErrors.Count -gt 0) {
  throw ($parseErrors -join [Environment]::NewLine)
}

Write-Output "Parsed $($blocks.Count) PowerShell block(s) from $RunbookPath"

if ($ExecuteCleanupContract) {
  $cleanupBlocks = @(
    $blocks | Where-Object {
      $_.Groups[1].Value.Contains('Remove-Item -LiteralPath $credentialPath') -and
      $_.Groups[1].Value.Contains('Test-Path -LiteralPath $credentialPath')
    }
  )
  if ($cleanupBlocks.Count -ne 1) {
    throw "Expected exactly one cleanup contract, found $($cleanupBlocks.Count)"
  }

  $cleanupSource = $cleanupBlocks[0].Groups[1].Value
  $cleanupTokens = $null
  $cleanupErrors = $null
  $cleanupAst = [System.Management.Automation.Language.Parser]::ParseInput(
    $cleanupSource,
    [ref]$cleanupTokens,
    [ref]$cleanupErrors
  )
  $commandNames = @(
    $cleanupAst.FindAll(
      {
        param($node)
        $node -is [System.Management.Automation.Language.CommandAst]
      },
      $true
    ) | ForEach-Object { $_.GetCommandName() }
  )
  $unexpectedCommands = @(
    $commandNames | Where-Object { $_ -notin @('Remove-Item', 'Test-Path') }
  )
  if ($unexpectedCommands.Count -gt 0) {
    throw "Cleanup contract may not read credential content; unexpected command(s): $($unexpectedCommands -join ', ')"
  }
  $memberInvocations = @(
    $cleanupAst.FindAll(
      {
        param($node)
        $node -is [System.Management.Automation.Language.InvokeMemberExpressionAst]
      },
      $true
    )
  )
  if ($memberInvocations.Count -gt 0) {
    throw 'Cleanup contract may not invoke methods that could read credential content'
  }

  $tempPath = Join-Path ([IO.Path]::GetTempPath()) "wi2937-$([guid]::NewGuid())"
  $targetPath = Join-Path $tempPath 'google-play-service-account.json'
  $unrelatedPath = Join-Path $tempPath 'unrelated.txt'
  $credentialSentinel = "credential-secret-$([guid]::NewGuid())"
  $unrelatedSentinel = "unrelated-$([guid]::NewGuid())"

  try {
    [void][IO.Directory]::CreateDirectory($tempPath)
    [IO.File]::WriteAllText($targetPath, $credentialSentinel)
    [IO.File]::WriteAllText($unrelatedPath, $unrelatedSentinel)

    $escapedTargetPath = $targetPath.Replace("'", "''")
    $isolatedSource = $cleanupSource.Replace(
      "'apps/mobile/.eas-submit/google-play-service-account.json'",
      "'$escapedTargetPath'"
    )
    if ($isolatedSource -eq $cleanupSource) {
      throw 'Cleanup contract no longer contains the expected credential path assignment'
    }

    $executionOutput = & ([scriptblock]::Create($isolatedSource)) *>&1 | Out-String

    if (Test-Path -LiteralPath $targetPath) {
      throw 'Cleanup contract did not delete the intended credential file'
    }
    if (-not (Test-Path -LiteralPath $unrelatedPath)) {
      throw 'Cleanup contract deleted an unrelated file'
    }
    if ([IO.File]::ReadAllText($unrelatedPath) -ne $unrelatedSentinel) {
      throw 'Cleanup contract changed an unrelated file'
    }
    if ($executionOutput.Contains($credentialSentinel)) {
      throw 'Cleanup contract printed credential contents'
    }
  }
  finally {
    Remove-Item -LiteralPath $tempPath -Recurse -Force -ErrorAction SilentlyContinue
  }

  Write-Output 'Executed cleanup contract against an isolated temporary path'
}
