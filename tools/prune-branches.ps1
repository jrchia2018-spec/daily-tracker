# Deletes the branches Claude sessions leave on GitHub once their work is in
# main. The news routine leaves one claude/* branch per morning run, so they
# pile up. A branch goes only if its last commit is already inside origin/main
# AND is over 12 hours old: unmerged work and a run still in progress are
# never touched.
#
# Usage:  powershell -ExecutionPolicy Bypass -File tools\prune-branches.ps1 [-DryRun]
#
# Lists GitHub's branches with ls-remote rather than this repo's tracking
# refs: the repo lives in OneDrive, which can hold .git folders open and make
# a pruning fetch stall on a "try again? (y/n)" prompt.
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI
# unless there is a BOM, so smart quotes / dashes become parse errors.

param([switch]$DryRun)

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
git fetch -q origin main
$cutoff = [DateTimeOffset]::UtcNow.AddHours(-12).ToUnixTimeSeconds()
$gone = 0
$kept = 0

foreach ($line in (git ls-remote --heads origin 'claude/*')) {
  $sha, $ref = $line -split "`t"
  $name = $ref -replace '^refs/heads/', ''
  git merge-base --is-ancestor $sha origin/main 2>$null
  $merged = ($LASTEXITCODE -eq 0)
  $when = if ($merged) { [long](git show -s --format=%ct $sha) } else { 0 }
  if (-not $merged -or $when -gt $cutoff) {
    $kept++
    Write-Host "kept     $name"
    continue
  }
  if ($DryRun) {
    $gone++
    Write-Host "would go $name"
    continue
  }
  git push -q origin --delete $name 2>$null
  if ($LASTEXITCODE -eq 0) { $gone++; Write-Host "deleted  $name" }
  else { Write-Warning "could not delete $name" }
}

$verb = if ($DryRun) { 'would be deleted' } else { 'deleted' }
Write-Host "Old branches: $gone $verb, $kept kept (not yet in main, or under 12 hours old)."
