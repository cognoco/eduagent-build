[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateNotNullOrEmpty()]
  [string]$BranchName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$taskCandidates = [System.Collections.Generic.List[string]]::new()

function Add-GitBashCandidate {
  param([string]$Path)

  if ($Path -and -not $taskCandidates.Contains($Path)) {
    $taskCandidates.Add($Path)
  }
}

if ($env:ProgramFiles) {
  Add-GitBashCandidate (Join-Path $env:ProgramFiles 'Git\bin\bash.exe')
}
if (${env:ProgramFiles(x86)}) {
  Add-GitBashCandidate (Join-Path ${env:ProgramFiles(x86)} 'Git\bin\bash.exe')
}
if ($env:LOCALAPPDATA) {
  Add-GitBashCandidate (
    Join-Path $env:LOCALAPPDATA 'Programs\Git\bin\bash.exe'
  )
}

$taskGitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
if ($taskGitCommand) {
  $taskGitBin = Split-Path $taskGitCommand.Source -Parent
  $taskGitRoot = Split-Path $taskGitBin -Parent
  if ((Split-Path $taskGitRoot -Leaf) -eq 'mingw64') {
    $taskGitRoot = Split-Path $taskGitRoot -Parent
  }
  Add-GitBashCandidate (Join-Path $taskGitRoot 'bin\bash.exe')
}

$taskGitBash = $taskCandidates |
  Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
  Select-Object -First 1

if (-not $taskGitBash) {
  throw @'
Git for Windows Bash was not found. Install Git for Windows or run the
cross-platform helper from a supported native shell. WSL Bash is not supported
for worktrees stored on the Windows filesystem.
'@
}

$taskRuntime = (& $taskGitBash --noprofile --norc -c 'uname -s').Trim()
if ($LASTEXITCODE -ne 0 -or $taskRuntime -notmatch '^(MINGW|MSYS|CYGWIN)') {
  throw "Refusing unsupported Bash runtime '$taskRuntime'; expected Git for Windows Bash."
}

$taskScript = Join-Path $PSScriptRoot 'setup-worktree.sh'
& $taskGitBash -c 'script_path="$(cygpath -u "$1")"; exec "$script_path" "$2"' -- $taskScript $BranchName
$taskExitCode = $LASTEXITCODE
if ($taskExitCode -ne 0) {
  exit $taskExitCode
}
