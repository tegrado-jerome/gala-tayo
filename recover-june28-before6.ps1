$ErrorActionPreference = "SilentlyContinue"

$repo = (Get-Location).Path

# Target: latest recoverable work on June 28, 2026 BEFORE 6:00 PM
$start  = Get-Date "2026-06-28 00:00:00"
$cutoff = Get-Date "2026-06-28 18:00:00"

$outRoot = Join-Path $repo "frontend-recovery-june28-before6"
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
Write-Host "========================================="
Write-Host " June 28 Before 6PM Git Tree Recovery"
Write-Host "========================================="
Write-Host ""
Write-Host "Repo: $repo"
Write-Host "Output: $outRoot"
Write-Host ""

Write-Host "Disabling local Git auto-gc for safety..."
git config --local gc.auto 0 | Out-Null

Write-Host "Scanning unreachable Git objects..."
$fsck = git fsck --full --no-reflogs --unreachable 2>$null

# Get unreachable/dangling trees
$treeHashes = $fsck |
    Select-String "(?:unreachable|dangling) tree ([a-f0-9]{40})" |
    ForEach-Object { $_.Matches[0].Groups[1].Value }

# Also get trees from unreachable/dangling commits
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
Write-Host ""

$results = foreach ($tree in $allTrees) {
    $treeTime = Get-LooseObjectTime $tree

    $ls = git ls-tree -r $tree 2>$null
    $paths = git ls-tree -r --name-only $tree 2>$null

    if (-not $paths -or $paths.Count -eq 0) {
        continue
    }

    $blobTimes = foreach ($line in $ls) {
        if ($line -match "^\d+\s+blob\s+([a-f0-9]{40})\s+") {
            Get-LooseObjectTime $Matches[1]
        }
    }

    $latestBlobTime = $blobTimes |
        Where-Object { $_ -ne $null } |
        Sort-Object -Descending |
        Select-Object -First 1

    $latestTime = @($treeTime, $latestBlobTime) |
        Where-Object { $_ -ne $null } |
        Sort-Object -Descending |
        Select-Object -First 1

    # Search fingerprints for GalaTayo / June 28 frontend work
    $emeraldCount     = (git grep -I -n "emerald" $tree -- 2>$null | Measure-Object).Count
    $askAiCount       = (git grep -I -n "Ask AI" $tree -- 2>$null | Measure-Object).Count
    $askLowerCount    = (git grep -I -n "ask ai" $tree -- 2>$null | Measure-Object).Count
    $mapCount         = (git grep -I -n "map" $tree -- 2>$null | Measure-Object).Count
    $pinCount         = (git grep -I -n "pin" $tree -- 2>$null | Measure-Object).Count
    $placeDetailCount = (git grep -I -n "PlaceDetail" $tree -- 2>$null | Measure-Object).Count
    $placeCardCount   = (git grep -I -n "PlaceCard" $tree -- 2>$null | Measure-Object).Count
    $galaCount        = (git grep -I -n "gala" $tree -- 2>$null | Measure-Object).Count
    $leafletCount     = (git grep -I -n "leaflet" $tree -- 2>$null | Measure-Object).Count
    $recommendCount   = (git grep -I -n "recommend" $tree -- 2>$null | Measure-Object).Count

    $hasPackage = $paths -contains "package.json"
    $hasSrc = ($paths | Where-Object { $_ -like "src/*" }).Count -gt 0
    $hasFrontendPackage = $paths -contains "frontend/package.json"
    $hasFrontendSrc = ($paths | Where-Object { $_ -like "frontend/src/*" }).Count -gt 0
    $hasVite = $paths -contains "vite.config.ts" -or $paths -contains "vite.config.js" -or $paths -contains "frontend/vite.config.ts" -or $paths -contains "frontend/vite.config.js"

    $frontendBonus = 0
    if ($hasPackage) { $frontendBonus += 50 }
    if ($hasSrc) { $frontendBonus += 50 }
    if ($hasFrontendPackage) { $frontendBonus += 50 }
    if ($hasFrontendSrc) { $frontendBonus += 50 }
    if ($hasVite) { $frontendBonus += 30 }

    $score =
        ($emeraldCount * 3) +
        (($askAiCount + $askLowerCount) * 6) +
        ($mapCount * 2) +
        ($pinCount * 3) +
        ($placeDetailCount * 6) +
        ($placeCardCount * 4) +
        ($galaCount * 2) +
        ($leafletCount * 5) +
        ($recommendCount * 3) +
        ($paths.Count / 100) +
        $frontendBonus

    [PSCustomObject]@{
        Tree = $tree
        Short = $tree.Substring(0, 7)
        LatestObjectTime = $latestTime
        Files = $paths.Count
        Score = [Math]::Round($score, 2)
        Emerald = $emeraldCount
        AskAI = ($askAiCount + $askLowerCount)
        Map = $mapCount
        Pin = $pinCount
        PlaceDetail = $placeDetailCount
        PlaceCard = $placeCardCount
        Leaflet = $leafletCount
        Recommend = $recommendCount
        HasPackage = $hasPackage
        HasSrc = $hasSrc
        HasFrontendPackage = $hasFrontendPackage
        HasFrontendSrc = $hasFrontendSrc
        HasVite = $hasVite
    }
}

$ranked = $results |
    Where-Object {
        $_.LatestObjectTime -ne $null -and
        $_.LatestObjectTime -ge $start -and
        $_.LatestObjectTime -le $cutoff
    } |
    Sort-Object `
        @{Expression="LatestObjectTime"; Descending=$true},
        @{Expression="Score"; Descending=$true},
        @{Expression="Files"; Descending=$true}

$csv = Join-Path $outRoot "ranked-june28-before6.csv"
$ranked | Export-Csv $csv -NoTypeInformation

Write-Host ""
Write-Host "Top candidates: latest recoverable snapshots before June 28, 2026 6:00 PM"
Write-Host ""

$ranked |
    Select-Object -First 30 Short, LatestObjectTime, Files, Score, Emerald, AskAI, Map, Pin, PlaceDetail, PlaceCard, Leaflet, Recommend, HasPackage, HasSrc, HasFrontendPackage, HasFrontendSrc, HasVite |
    Format-Table -AutoSize

Write-Host ""
Write-Host "Extracting top 15 candidates safely..."
Write-Host ""

$top = $ranked | Select-Object -First 15

foreach ($item in $top) {
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
Write-Host "========================================="
Write-Host "Done."
Write-Host "CSV saved to:"
Write-Host $csv
Write-Host ""
Write-Host "Recovered folders saved in:"
Write-Host $outRoot
Write-Host "========================================="
Write-Host ""

if ($ranked.Count -eq 0) {
    Write-Host "No candidates found inside June 28 before 6 PM."
    Write-Host "This may mean the object times are outside the target window or objects were packed/cleaned."
    Write-Host "We can adjust the time window next if needed."
}