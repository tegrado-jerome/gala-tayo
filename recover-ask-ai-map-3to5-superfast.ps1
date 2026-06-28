$ErrorActionPreference = "SilentlyContinue"

$repo = (Get-Location).Path

# Focus only June 28, 2026 from 3PM to 5PM
$start  = Get-Date "2026-06-28 15:00:00"
$cutoff = Get-Date "2026-06-28 17:00:00"

$outRoot = Join-Path $repo "ask-ai-map-recovery-june28-3to5-superfast"
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null

function Is-FrontendPath($path) {
    return (
        $path -like "frontend/*" -or
        $path -like "src/*" -or
        $path -like "*.tsx" -or
        $path -like "*.ts" -or
        $path -like "*.jsx" -or
        $path -like "*.js" -or
        $path -match "Place|Map|Pin|Card|Detail|Home|Search|Leaflet|Recommendation|Itinerary|Ask|AI"
    )
}

function Is-BackendPath($path) {
    return (
        $path -like "backend/*" -or
        $path -like "server/*" -or
        $path -like "api/*" -or
        $path -like "routes/*" -or
        $path -like "controllers/*" -or
        $path -like "services/*" -or
        $path -match "api|route|controller|service|gemini|map|maps|places|ask|grounding|supabase|server|backend"
    )
}

function Is-AskPath($path) {
    return ($path -match "ask|ai|gemini|grounding|generateContent")
}

function Is-MapPath($path) {
    return ($path -match "map|maps|place|places|leaflet|pin|marker|coordinate|coordinates|latitude|longitude|lat|lng|nearby")
}

Write-Host ""
Write-Host "====================================================="
Write-Host " SUPERFAST ASK AI MAP RECOVERY SCAN"
Write-Host " June 28, 2026 | 3PM to 5PM"
Write-Host "====================================================="
Write-Host ""
Write-Host "Repo: $repo"
Write-Host "Output: $outRoot"
Write-Host ""

git config --local gc.auto 0 | Out-Null

$patterns = @(
    "map",
    "Ask AI Map",
    "ask ai map",
    "ask map ai",
    "Ask Map AI",
    "Ask AI",
    "ask ai",
    "AI Map",
    "ai map",
    "map ai",
    "ask-ai-map",
    "ask-map-ai",
    "ask-ai",
    "ai-map",
    "map-ai",
    "ask-map",
    "ask-maps",
    "ai-maps",
    "ask-ai-maps",
    "ask_ai_map",
    "ask_map_ai",
    "ask_ai",
    "ai_map",
    "map_ai",
    "ask_map",
    "ask_maps",
    "ai_maps",
    "askAiMap",
    "askAIMap",
    "askMapAi",
    "askMapAI",
    "AskAiMap",
    "AskAIMap",
    "AskMapAi",
    "AskMapAI",
    "/api/ask-ai-map",
    "/api/ask-map-ai",
    "/api/ask-ai",
    "/api/map-ai",
    "/api/ask-map",
    "/api/places",
    "/api/maps",
    "/api/map",
    "map grounding",
    "grounding",
    "Gemini",
    "gemini",
    "generateContent",
    "places",
    "Google Maps",
    "OpenStreetMap",
    "leaflet",
    "react-leaflet",
    "PlaceDetail",
    "PlaceDetailView",
    "PlaceCard",
    "MapView",
    "MapContainer",
    "TileLayer",
    "Marker",
    "Popup",
    "coordinates",
    "latitude",
    "longitude",
    "recommendation",
    "recommendations",
    "itinerary",
    "supabase",
    "backend",
    "controller",
    "service",
    "route",
    "router",
    "express",
    "server"
)

$regex = ($patterns | ForEach-Object { [regex]::Escape($_) }) -join "|"

Write-Host "Step 1: Finding loose Git objects modified from 3PM to 5PM..."

$objectsRoot = Join-Path $repo ".git\objects"

$looseFiles = Get-ChildItem $objectsRoot -File -Recurse |
    Where-Object {
        $_.Directory.Name -match "^[a-f0-9]{2}$" -and
        $_.Name -match "^[a-f0-9]{38}$" -and
        $_.LastWriteTime -ge $start -and
        $_.LastWriteTime -le $cutoff
    }

Write-Host "Loose objects in 3PM-5PM window: $($looseFiles.Count)"
Write-Host "Checking which ones are file blobs..."

$blobInfo = @{}
$count = 0

foreach ($file in $looseFiles) {
    $hash = $file.Directory.Name + $file.Name
    $type = git cat-file -t $hash 2>$null

    if ($type -ne "blob") {
        continue
    }

    $count++

    $sizeText = git cat-file -s $hash 2>$null
    $size = 0
    [int64]::TryParse($sizeText, [ref]$size) | Out-Null

    $contentHits = 0

    if ($size -gt 0 -and $size -lt 2000000) {
        $content = git cat-file -p $hash 2>$null | Out-String
        if ($content) {
            $contentHits = [regex]::Matches(
                $content,
                $regex,
                [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
            ).Count
        }
    }

    $blobInfo[$hash] = [PSCustomObject]@{
        Blob = $hash
        BlobShort = $hash.Substring(0, 7)
        ObjectTime = $file.LastWriteTime
        Size = $size
        ContentHits = $contentHits
    }
}

Write-Host "Blob/file objects in 3PM-5PM window: $($blobInfo.Count)"

if ($blobInfo.Count -eq 0) {
    Write-Host ""
    Write-Host "No file blobs found from 3PM to 5PM."
    Write-Host "Next try: 2PM-6PM or 11AM-6PM."
    exit
}

Write-Host ""
Write-Host "Step 2: Getting unreachable trees..."

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

Write-Host "Candidate trees: $($allTrees.Count)"
Write-Host ""
Write-Host "Step 3: Mapping 3PM-5PM blobs back to candidate trees..."

$treeStats = @{}
$mappedRows = New-Object System.Collections.Generic.List[object]

$total = $allTrees.Count
$i = 0

foreach ($tree in $allTrees) {
    $i++

    if ($i % 200 -eq 0) {
        Write-Host "Mapped $i / $total trees | candidate trees found: $($treeStats.Count)"
    }

    $ls = git ls-tree -r $tree 2>$null

    foreach ($line in $ls) {
        if ($line -match "^\d+\s+blob\s+([a-f0-9]{40})\s+(.+)$") {
            $blob = $Matches[1]
            $path = $Matches[2]

            if (-not $blobInfo.ContainsKey($blob)) {
                continue
            }

            $info = $blobInfo[$blob]
            $short = $tree.Substring(0, 7)

            $isFrontend = Is-FrontendPath $path
            $isBackend = Is-BackendPath $path
            $isAsk = Is-AskPath $path
            $isMap = Is-MapPath $path
            $isRelevant = $isFrontend -or $isBackend -or $isAsk -or $isMap -or ($info.ContentHits -gt 0)

            $mappedRows.Add([PSCustomObject]@{
                Tree = $tree
                Short = $short
                Blob = $blob
                BlobShort = $blob.Substring(0, 7)
                ObjectTime = $info.ObjectTime
                Path = $path
                ContentHits = $info.ContentHits
                IsFrontend = $isFrontend
                IsBackend = $isBackend
                IsAsk = $isAsk
                IsMap = $isMap
                IsRelevant = $isRelevant
            }) | Out-Null

            if (-not $treeStats.ContainsKey($tree)) {
                $treeStats[$tree] = @{
                    Tree = $tree
                    Short = $short
                    FilesInWindow = 0
                    FrontendHits = 0
                    BackendHits = 0
                    AskHits = 0
                    MapHits = 0
                    RelevantHits = 0
                    ContentHits = 0
                    EarliestInWindow = $info.ObjectTime
                    LatestInWindow = $info.ObjectTime
                    ExampleFiles = New-Object System.Collections.Generic.List[string]
                }
            }

            $stat = $treeStats[$tree]
            $stat["FilesInWindow"]++
            $stat["ContentHits"] += $info.ContentHits

            if ($isFrontend) { $stat["FrontendHits"]++ }
            if ($isBackend) { $stat["BackendHits"]++ }
            if ($isAsk) { $stat["AskHits"]++ }
            if ($isMap) { $stat["MapHits"]++ }
            if ($isRelevant) { $stat["RelevantHits"]++ }

            if ($info.ObjectTime -lt $stat["EarliestInWindow"]) {
                $stat["EarliestInWindow"] = $info.ObjectTime
            }

            if ($info.ObjectTime -gt $stat["LatestInWindow"]) {
                $stat["LatestInWindow"] = $info.ObjectTime
            }

            if ($stat["ExampleFiles"].Count -lt 12) {
                $stat["ExampleFiles"].Add($path) | Out-Null
            }
        }
    }
}

Write-Host ""
Write-Host "Step 4: Ranking candidates..."

$treeRows = foreach ($key in $treeStats.Keys) {
    $s = $treeStats[$key]

    $score =
        ($s["RelevantHits"] * 100) +
        ($s["FrontendHits"] * 25) +
        ($s["BackendHits"] * 25) +
        ($s["AskHits"] * 40) +
        ($s["MapHits"] * 40) +
        ($s["ContentHits"] * 10) +
        ($s["FilesInWindow"])

    [PSCustomObject]@{
        Tree = $s["Tree"]
        Short = $s["Short"]
        LatestInWindow = $s["LatestInWindow"]
        EarliestInWindow = $s["EarliestInWindow"]
        FilesInWindow = $s["FilesInWindow"]
        FrontendHits = $s["FrontendHits"]
        BackendHits = $s["BackendHits"]
        AskHits = $s["AskHits"]
        MapHits = $s["MapHits"]
        RelevantHits = $s["RelevantHits"]
        ContentHits = $s["ContentHits"]
        Score = $score
        ExampleFiles = ($s["ExampleFiles"] -join " | ")
    }
}

$rankedTrees = $treeRows |
    Sort-Object `
        @{Expression="LatestInWindow"; Descending=$true},
        @{Expression="Score"; Descending=$true},
        @{Expression="RelevantHits"; Descending=$true},
        @{Expression="FrontendHits"; Descending=$true},
        @{Expression="BackendHits"; Descending=$true}

$filesCsv = Join-Path $outRoot "mapped-files-3to5.csv"
$treesCsv = Join-Path $outRoot "candidate-trees-3to5.csv"

$mappedRows |
    Sort-Object ObjectTime -Descending |
    Export-Csv $filesCsv -NoTypeInformation

$rankedTrees |
    Export-Csv $treesCsv -NoTypeInformation

Write-Host ""
Write-Host "Top candidate trees from 3PM-5PM:"
Write-Host ""

$rankedTrees |
    Select-Object -First 30 Short, LatestInWindow, FilesInWindow, FrontendHits, BackendHits, AskHits, MapHits, RelevantHits, ContentHits, Score, ExampleFiles |
    Format-Table -AutoSize

Write-Host ""
Write-Host "Latest individual files from 3PM-5PM:"
Write-Host ""

$mappedRows |
    Sort-Object ObjectTime -Descending |
    Select-Object -First 50 Short, ObjectTime, Path, ContentHits, IsFrontend, IsBackend, IsAsk, IsMap |
    Format-Table -AutoSize

Write-Host ""
Write-Host "Extracting top 20 candidate trees safely..."
Write-Host ""

$topTrees = $rankedTrees | Select-Object -First 20

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
Write-Host "====================================================="
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
Write-Host "====================================================="
Write-Host ""

if ($rankedTrees.Count -eq 0) {
    Write-Host "No candidate tree matched 3PM-5PM file objects."
    Write-Host "Next try: 2PM-6PM or 11AM-6PM."
}