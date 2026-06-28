$ErrorActionPreference = "SilentlyContinue"

$repo = (Get-Location).Path

# Scan all recoverable file objects from June 28, 2026 11AM to 6PM
$start  = Get-Date "2026-06-28 11:00:00"
$cutoff = Get-Date "2026-06-28 18:00:00"

$outRoot = Join-Path $repo "frontend-recovery-june28-11to6"
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null

function Get-LooseObjectTime($hash) {
    if (-not $hash -or $hash.Length -lt 40) {
        return $null
    }

    $dir = $hash.Substring(0, 2)
    $file = $hash.Substring(2)
    $path = Join-Path $repo ".git\objects\$dir\$file"

    if (Test-Path $path) {
        return (Get-Item $path).LastWriteTime
    }

    return $null
}

Write-Host ""
Write-Host "==============================================="
Write-Host " June 28 11AM-6PM Git File Object Scan"
Write-Host "==============================================="
Write-Host ""
Write-Host "Repo: $repo"
Write-Host "Output: $outRoot"
Write-Host ""

git config --local gc.auto 0 | Out-Null

Write-Host "Scanning unreachable Git objects..."
$fsck = git fsck --full --no-reflogs --unreachable 2>$null

$treeHashes = $fsck |
    Select-String "(?:unreachable|dangling) tree ([a-f0-9]{40})" |
    ForEach-Object { $_.Matches[0].Groups[1].Value }

$commitHashes = $fsck |
    Select-String "(?:unreachable|dangling) commit ([a-f0-9]{40})" |
    ForEach-Object { $_.Matches[0].Groups[1].Value }

$commitTrees = foreach ($commit in $commitHashes) {
    git show -s --format=%T $commit 2>$null
}

$allTrees = @($treeHashes + $commitTrees) |
    Where-Object { $_ -match "^[a-f0-9]{40}$" } |
    Sort-Object -Unique

Write-Host "Found $($allTrees.Count) candidate trees."
Write-Host "Scanning files with Git object time from 11AM to 6PM..."
Write-Host ""

$fileRows = @()
$treeRows = @()

foreach ($tree in $allTrees) {
    $ls = git ls-tree -r $tree 2>$null

    if (-not $ls) {
        continue
    }

    $matchedFiles = @()

    foreach ($line in $ls) {
        if ($line -match "^\d+\s+blob\s+([a-f0-9]{40})\s+(.+)$") {
            $blob = $Matches[1]
            $path = $Matches[2]
            $time = Get-LooseObjectTime $blob

            if ($time -ne $null -and $time -ge $start -and $time -le $cutoff) {
                $row = [PSCustomObject]@{
                    Tree = $tree
                    Short = $tree.Substring(0, 7)
                    Blob = $blob
                    BlobShort = $blob.Substring(0, 7)
                    ObjectTime = $time
                    Path = $path
                }

                $fileRows += $row
                $matchedFiles += $row
            }
        }
    }

    if ($matchedFiles.Count -gt 0) {
        $latest = $matchedFiles |
            Sort-Object ObjectTime -Descending |
            Select-Object -First 1

        $earliest = $matchedFiles |
            Sort-Object ObjectTime |
            Select-Object -First 1

        $frontendHits = ($matchedFiles | Where-Object {
            $_.Path -like "src/*" -or
            $_.Path -like "frontend/src/*" -or
            $_.Path -match "Place|Map|Pin|Card|Ask|AI|Detail|Home|App|Search|Recommendation|Itinerary"
        }).Count

        $exampleFiles = ($matchedFiles |
            Sort-Object ObjectTime -Descending |
            Select-Object -First 8 |
            ForEach-Object { $_.Path }) -join " | "

        $treeRows += [PSCustomObject]@{
            Tree = $tree
            Short = $tree.Substring(0, 7)
            FilesInWindow = $matchedFiles.Count
            FrontendHits = $frontendHits
            EarliestInWindow = $earliest.ObjectTime
            LatestInWindow = $latest.ObjectTime
            ExampleFiles = $exampleFiles
        }
    }
}

$filesCsv = Join-Path $outRoot "files-june28-11to6.csv"
$treesCsv = Join-Path $outRoot "trees-june28-11to6.csv"

$fileRows |
    Sort-Object ObjectTime -Descending |
    Export-Csv $filesCsv -NoTypeInformation

$rankedTrees = $treeRows |
    Sort-Object @{Expression="LatestInWindow"; Descending=$true},
                @{Expression="FrontendHits"; Descending=$true},
                @{Expression="FilesInWindow"; Descending=$true}

$rankedTrees |
    Export-Csv $treesCsv -NoTypeInformation

Write-Host ""
Write-Host "Candidate trees with file objects from June 28 11AM-6PM:"
Write-Host ""

$rankedTrees |
    Select-Object -First 30 Short, LatestInWindow, EarliestInWindow, FilesInWindow, FrontendHits, ExampleFiles |
    Format-Table -AutoSize

Write-Host ""
Write-Host "Latest individual files from 11AM-6PM:"
Write-Host ""

$fileRows |
    Sort-Object ObjectTime -Descending |
    Select-Object -First 40 Short, ObjectTime, Path |
    Format-Table -AutoSize

Write-Host ""
Write-Host "Extracting top 20 candidate trees safely..."
Write-Host ""

$topTrees = $rankedTrees |
    Select-Object -First 20

foreach ($item in $topTrees) {
    $dest = Join-Path $outRoot $item.Short

    if (Test-Path $dest) {
        Remove-Item $dest -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path $dest | Out-Null

    $tarPath = Join-Path $outRoot "$($item.Short).tar"

    if (Test-Path $tarPath) {
        Remove-Item $tarPath -Force
    }

    git archive --format=tar -o $tarPath $item.Tree 2>$null

    if (Test-Path $tarPath) {
        tar -xf $tarPath -C $dest
        Remove-Item $tarPath -Force
        Write-Host "Extracted $($item.Short) -> $dest"
    } else {
        Write-Host "Failed to archive $($item.Short)"
    }
}

Write-Host ""
Write-Host "==============================================="
Write-Host "Done."
Write-Host ""
Write-Host "Files CSV:"
Write-Host $filesCsv
Write-Host ""
Write-Host "Trees CSV:"
Write-Host $treesCsv
Write-Host ""
Write-Host "Recovered folders:"
Write-Host $outRoot
Write-Host "==============================================="
Write-Host ""

if ($treeRows.Count -eq 0) {
    Write-Host "No file object matches found from June 28 11AM to 6PM."
    Write-Host "Next step: widen the scan or check if objects were packed/cleaned."
}