param(
  [Parameter(Mandatory = $false)]
  [string]$RunbookPath = 'docs/runbooks/store-submission.md'
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
