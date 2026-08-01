# Point-in-time backup of the whole repo: code, news archive, full git history.
#
# Produces a single .bundle file, which is a complete self-contained git repo.
# Restore with:  git clone daily-tracker-YYYY-MM-DD.bundle restored-repo
#
# Why a bundle rather than a zip: it keeps every commit, so it also protects
# against git-level accidents (a bad rebase, a force push) that a plain copy
# of the working files would happily preserve as damage.
#
# Backups land OUTSIDE the repo so they are never committed into it, in a
# OneDrive folder so they sync offsite with no manual step. A second copy
# goes to Google Drive when it is mounted, putting the snapshots with a
# different company from both OneDrive and GitHub.
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI
# unless there is a BOM, so smart quotes / dashes become parse errors.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$dest = Join-Path (Split-Path -Parent $repo) 'Tracker Repo Backups'
$keep = 5

# Google Drive for desktop mounts as a drive letter that can change between
# machines or reinstalls, so find it rather than hardcoding G:.
function Get-DriveSnapshotDir {
    foreach ($d in Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue) {
        $tb = Join-Path (Join-Path $d.Root 'My Drive') 'Tracker Backups'
        if (Test-Path $tb) { return (Join-Path $tb 'Repo snapshots') }
    }
    return $null
}

New-Item -ItemType Directory -Force $dest | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd'
$out = Join-Path $dest "daily-tracker-$stamp.bundle"

Push-Location $repo
try {
    git bundle create $out --all
    if ($LASTEXITCODE -ne 0) { throw 'git bundle failed' }
    # Verify it is actually restorable rather than trusting the exit code.
    git bundle verify $out | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'bundle verification FAILED - do not trust this file' }
} finally { Pop-Location }

# Keep the newest $keep in each location, delete older ones.
function Limit-Snapshots($dir) {
    Get-ChildItem $dir -Filter 'daily-tracker-*.bundle' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $keep |
        Remove-Item -Force
}
Limit-Snapshots $dest

$size = [math]::Round((Get-Item $out).Length / 1MB, 2)
Write-Output "Backed up to: $out"
Write-Output "Size: $size MB | verified restorable | keeping newest $keep"

# Second copy to Google Drive. A missing or offline Drive must NOT fail the
# run - the OneDrive copy above is the primary and has already succeeded.
$gdir = Get-DriveSnapshotDir
if ($gdir) {
    try {
        New-Item -ItemType Directory -Force $gdir | Out-Null
        Copy-Item $out (Join-Path $gdir (Split-Path -Leaf $out)) -Force
        Limit-Snapshots $gdir
        Write-Output "Google Drive copy: $gdir"
    } catch {
        Write-Warning "Google Drive copy FAILED: $($_.Exception.Message)"
        Write-Warning "The OneDrive backup above is fine; only the extra copy is missing."
    }
} else {
    Write-Warning "Google Drive not mounted - skipped the extra copy (OneDrive backup is fine)."
}
