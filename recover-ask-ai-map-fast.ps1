$ErrorActionPreference = "SilentlyContinue"

$repo = (Get-Location).Path

# Recovery window: June 28, 2026 from 11AM to 6PM
$start  = Get-Date "2026-06-28 11:00:00"
$cutoff = Get-Date "2026-06-28 18:00:00"

$outRoot = Join-Path $repo "ask-ai-map-recovery-june28-fast"
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

Write-Host ""
Write-Host "================================================="
Write-Host " FAST ASK AI MAP UI + BACKEND RECOVERY SCAN"
Write-Host " June 28, 2026 | 11AM to 6PM"
Write-Host "================================================="
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
Write-Host "Now scanning Ask AI Map UI + backend fingerprints..."
Write-Host ""

$patterns = @(
    # exact words / labels
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

    # slug variants
    "ask-ai-map",
    "ask-map-ai",
    "ask-ai",
    "ai-map",
    "map-ai",
    "ask-map",
    "ask-maps",
    "ai-maps",
    "ask-ai-maps",

    # underscore variants
    "ask_ai_map",
    "ask_map_ai",
    "ask_ai",
    "ai_map",
    "map_ai",
    "ask_map",
    "ask_maps",
    "ai_maps",
    "ask_ai_maps",

    # camelCase / PascalCase variants
    "askAiMap",
    "askAIMap",
    "askMapAi",
    "askMapAI",
    "AskAiMap",
    "AskAIMap",
    "AskMapAi",
    "AskMapAI",
    "askAi",
    "askAI",
    "AskAi",
    "AskAI",

    # frontend route strings
    "/ask-ai-map",
    "/ask-map-ai",
    "/ask-ai",
    "/ai-map",
    "/map-ai",
    "/ask-map",
    "/ask-maps",
    "/ai-maps",
    "/ask-ai-maps",

    # API/backend endpoint strings
    "/api/ask-ai-map",
    "/api/ask-map-ai",
    "/api/ask-ai",
    "/api/ai-map",
    "/api/map-ai",
    "/api/ask-map",
    "/api/ask-maps",
    "/api/ask-ai-maps",
    "/api/places",
    "/api/maps",
    "/api/map",
    "/api/search-places",
    "/api/nearby",
    "/api/recommendations",

    # map grounding / model / places clues
    "map grounding",
    "grounding",
    "Gemini",
    "gemini",
    "generateContent",
    "places",
    "Places API",
    "Google Maps",
    "google maps",
    "OpenStreetMap",
    "openstreetmap",
    "OSM",
    "leaflet",
    "react-leaflet",

    # frontend map component clues
    "PlaceDetail",
    "PlaceDetailView",
    "PlaceCard",
    "MapView",
    "MapContainer",
    "TileLayer",
    "Marker",
    "Popup",
    "map pin",
    "map marker",
    "pin",
    "marker",

    # data/response clues
    "coordinates",
    "coordinate",
    "latitude",
    "longitude",
    "lat",
    "lng",
    "nearby",
    "search places",
    "recommendation",
    "recommendations",
    "itinerary",
    "place_name",
    "placeName",
    "formatted_address",
    "formattedAddress",

    # backend/storage clues
    "supabase",
    "backend",
    "controller",
    "service",
    "route",
    "router",
    "express",
    "server"
)

$results = New-Object System.Collections.Generic.List[object]
$total = $allTrees.Count
$i = 0

foreach ($tree in $allTrees) {
    $i++

    if ($i % 100 -eq 0) {
        Write-Host "Scanned $i / $total trees | candidates found: $($results.Count)"
    }

    $grepArgs = @("grep", "-I", "-i", "-l")

    foreach ($p in $patterns) {
        $grepArgs += @("-e", $p)
    }

    $grepArgs += @($tree, "--")

    $rawHits = & git @grepArgs 2>$null

    if (-not $rawHits) {
        continue
    }

    $hitPaths = $rawHits |
        ForEach-Object { $_ -replace "^[a-f0-9]{40}:", "" } |
        Sort-Object -Unique

    if (-not $hitPaths -or $hitPaths.Count -eq 0) {
        continue
    }

    $treeTime = Get-LooseObjectTime $tree

    $hitBlobTimes = @()
    $windowTimes = @()

    foreach ($path in $hitPaths) {
        $entry = git ls-tree -r $tree -- $path 2>$null | Select-Object -First 1

        if ($entry -match "^\d+\s+blob\s+([a-f0-9]{40})\s+") {
            $blob = $Matches[1]
            $time = Get-LooseObjectTime $blob

            if ($time -ne $null) {
                $hitBlobTimes += $time

                if ($time -ge $start -and $time -le $cutoff) {
                    $windowTimes += $time
                }
            }
        }
    }

    if ($treeTime -ne $null -and $treeTime -ge $start -and $treeTime -le $cutoff) {
        $windowTimes += $treeTime
    }

    $allTimes = @()
    if ($treeTime -ne $null) {
        $allTimes += $treeTime
    }
    if ($hitBlobTimes.Count -gt 0) {
        $allTimes += $hitBlobTimes
    }

    $latestHitTime = $allTimes |
        Where-Object { $_ -ne $null } |
        Sort-Object -Descending |
        Select-Object -First 1

    $latestWindowTime = $windowTimes |
        Where-Object { $_ -ne $null } |
        Sort-Object -Descending |
        Select-Object -First 1

    $frontendHits = ($hitPaths | Where-Object { Is-FrontendPath $_ }).Count
    $backendHits = ($hitPaths | Where-Object { Is-BackendPath $_ }).Count

    $askHits = ($hitPaths | Where-Object {
        $_ -match "ask|AI|ai|gemini|grounding"
    }).Count

    $mapHits = ($hitPaths | Where-Object {
        $_ -match "map|maps|place|places|leaflet|pin|marker|coordinate|coordinates|latitude|longitude|lat|lng"
    }).Count

    $routeHits = ($hitPaths | Where-Object {
        $_ -match "api|route|router|controller|service|server|backend"
    }).Count

    $score =
        ($hitPaths.Count * 5) +
        ($frontendHits * 15) +
        ($backendHits * 15) +
        ($askHits * 20) +
        ($mapHits * 20) +
        ($routeHits * 10)

    if ($latestWindowTime -ne $null) {
        $score += 1000
    }

    $exampleFiles = ($hitPaths | Select-Object -First 12) -join " | "

    $results.Add([PSCustomObject]@{
        Tree = $tree
        Short = $tree.Substring(0, 7)
        LatestWindowTime = $latestWindowTime
        LatestHitObjectTime = $latestHitTime
        HitFiles = $hitPaths.Count
        FrontendHits = $frontendHits
        BackendHits = $backendHits
        AskHits = $askHits
        MapHits = $mapHits
        RouteHits = $routeHits
        Score = $score
        ExampleFiles = $exampleFiles
    }) | Out-Null
}

Write-Host ""
Write-Host "Building ranking..."

$ranked = $results |
    Sort-Object `
        @{Expression="LatestWindowTime"; Descending=$true},
        @{Expression="Score"; Descending=$true},
        @{Expression="FrontendHits"; Descending=$true},
        @{Expression="BackendHits"; Descending=$true},
        @{Expression="HitFiles"; Descending=$true}

$csv = Join-Path $outRoot "ask-ai-map-candidates.csv"
$ranked | Export-Csv $csv -NoTypeInformation

Write-Host ""
Write-Host "Top ASK AI MAP UI + BACKEND candidates:"
Write-Host ""

$ranked |
    Select-Object -First 30 Short, LatestWindowTime, LatestHitObjectTime, HitFiles, FrontendHits, BackendHits, AskHits, MapHits, RouteHits, Score, ExampleFiles |
    Format-Table -AutoSize

Write-Host ""
Write-Host "Extracting top 20 candidates safely..."
Write-Host ""

$topTrees = $ranked | Select-Object -First 20

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
Write-Host "================================================="
Write-Host "Done."
Write-Host ""
Write-Host "CSV:"
Write-Host $csv
Write-Host ""
Write-Host "Recovered folders:"
Write-Host $outRoot
Write-Host "================================================="
Write-Host ""

if ($ranked.Count -eq 0) {
    Write-Host "No Ask AI Map candidates found."
    Write-Host "Next step: widen fingerprints or scan all file objects again."
}