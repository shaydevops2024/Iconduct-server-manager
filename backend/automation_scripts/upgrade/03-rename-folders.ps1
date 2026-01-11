# Full path: backend/automation_scripts/upgrade/03-rename-folders.ps1

$ErrorActionPreference = "Stop"

$tempPath = "D:\Temp"
$iconductPath = "D:\IConduct"

try {
    $renamedCount = 0
    
    # Get all folders in temp
    $tempFolders = Get-ChildItem -Path $tempPath -Directory
    
    # Get all folders in D:\IConduct for reference
    $iconductFolders = Get-ChildItem -Path $iconductPath -Directory
    
    foreach ($tempFolder in $tempFolders) {
        $tempFolderName = $tempFolder.Name
        
        # Skip special folders (will be handled separately)
        if ($tempFolderName -match "Cloud\.?Agent" -or $tempFolderName -match "Scheduler") {
            Write-Output "Skipping special folder for now: $tempFolderName"
            continue
        }
        
        # Find matching folder in D:\IConduct
        $matchedFolder = $null
        
        # Try exact match first
        $matchedFolder = $iconductFolders | Where-Object { $_.Name -eq $tempFolderName } | Select-Object -First 1
        
        # If no exact match, try fuzzy match
        if (-not $matchedFolder) {
            # Split the temp folder name into keywords
            $keywords = $tempFolderName -split '[._-]' | Where-Object { $_.Length -gt 2 }
            
            foreach ($iconductFolder in $iconductFolders) {
                $matchCount = 0
                foreach ($keyword in $keywords) {
                    if ($iconductFolder.Name -match [regex]::Escape($keyword)) {
                        $matchCount++
                    }
                }
                
                # If at least 70% of keywords match, consider it a match
                if ($matchCount -ge ($keywords.Count * 0.7)) {
                    $matchedFolder = $iconductFolder
                    break
                }
            }
        }
        
        # Rename if match found
        if ($matchedFolder) {
            $newName = $matchedFolder.Name
            if ($tempFolderName -ne $newName) {
                $newPath = Join-Path $tempPath $newName
                
                # If destination exists in temp, remove it first
                if (Test-Path $newPath) {
                    Remove-Item -Path $newPath -Recurse -Force
                }
                
                Rename-Item -Path $tempFolder.FullName -NewName $newName -Force
                Write-Output "Renamed: $tempFolderName -> $newName"
                $renamedCount++
            } else {
                Write-Output "Already correct name: $tempFolderName"
            }
        } else {
            Write-Output "WARNING: No match found for: $tempFolderName (keeping original name)"
        }
    }
    
    # Handle Cloud.Agent special case
    $cloudAgentFolders = Get-ChildItem -Path $tempPath -Directory | Where-Object { $_.Name -match "Cloud\.?Agent" }
    if ($cloudAgentFolders) {
        foreach ($cloudAgentFolder in $cloudAgentFolders) {
            # Duplicate the folder
            $basePath = $cloudAgentFolder.FullName
            $copy01Path = Join-Path $tempPath "CloudAgent01_temp"
            $copy02Path = Join-Path $tempPath "CloudAgent02_temp"
            
            Copy-Item -Path $basePath -Destination $copy01Path -Recurse -Force
            Copy-Item -Path $basePath -Destination $copy02Path -Recurse -Force
            
            # Remove original
            Remove-Item -Path $basePath -Recurse -Force
            
            # Handle release folders
            foreach ($copyPath in @($copy01Path, $copy02Path)) {
                $releasePath = Join-Path $copyPath "release"
                if (Test-Path $releasePath) {
                    Get-ChildItem -Path $releasePath | Move-Item -Destination $copyPath -Force
                    Remove-Item -Path $releasePath -Recurse -Force
                    Write-Output "Extracted release folder in: $copyPath"
                }
            }
            
            # Find matching folders in D:\IConduct
            $agent01Match = $iconductFolders | Where-Object { $_.Name -match "cloud" -and $_.Name -match "agent" -and $_.Name -match "01" } | Select-Object -First 1
            $agent02Match = $iconductFolders | Where-Object { $_.Name -match "cloud" -and $_.Name -match "agent" -and $_.Name -match "02" } | Select-Object -First 1
            
            if ($agent01Match) {
                Rename-Item -Path $copy01Path -NewName $agent01Match.Name -Force
                Write-Output "Renamed Cloud Agent 01: $($agent01Match.Name)"
                $renamedCount++
            }
            
            if ($agent02Match) {
                Rename-Item -Path $copy02Path -NewName $agent02Match.Name -Force
                Write-Output "Renamed Cloud Agent 02: $($agent02Match.Name)"
                $renamedCount++
            }
        }
    }
    
    # Handle Scheduler special case
    $schedulerFolders = Get-ChildItem -Path $tempPath -Directory | Where-Object { $_.Name -match "Scheduler" -and $_.Name -notmatch "storage" }
    if ($schedulerFolders) {
        foreach ($schedulerFolder in $schedulerFolders) {
            # Duplicate the folder
            $basePath = $schedulerFolder.FullName
            $copy01Path = Join-Path $tempPath "Scheduler01_temp"
            $copy02Path = Join-Path $tempPath "Scheduler02_temp"
            
            Copy-Item -Path $basePath -Destination $copy01Path -Recurse -Force
            Copy-Item -Path $basePath -Destination $copy02Path -Recurse -Force
            
            # Remove original
            Remove-Item -Path $basePath -Recurse -Force
            
            # Handle release folders
            foreach ($copyPath in @($copy01Path, $copy02Path)) {
                $releasePath = Join-Path $copyPath "release"
                if (Test-Path $releasePath) {
                    Get-ChildItem -Path $releasePath | Move-Item -Destination $copyPath -Force
                    Remove-Item -Path $releasePath -Recurse -Force
                    Write-Output "Extracted release folder in: $copyPath"
                }
            }
            
            # Find matching folders in D:\IConduct
            $scheduler01Match = $iconductFolders | Where-Object { $_.Name -match "scheduler" -and $_.Name -match "01" -and $_.Name -notmatch "storage" } | Select-Object -First 1
            $scheduler02Match = $iconductFolders | Where-Object { $_.Name -match "scheduler" -and $_.Name -match "02" -and $_.Name -notmatch "storage" } | Select-Object -First 1
            
            if ($scheduler01Match) {
                Rename-Item -Path $copy01Path -NewName $scheduler01Match.Name -Force
                Write-Output "Renamed Scheduler 01: $($scheduler01Match.Name)"
                $renamedCount++
            }
            
            if ($scheduler02Match) {
                Rename-Item -Path $copy02Path -NewName $scheduler02Match.Name -Force
                Write-Output "Renamed Scheduler 02: $($scheduler02Match.Name)"
                $renamedCount++
            }
        }
    }
    
    Write-Output "Renamed $renamedCount folder(s)"
}
catch {
    Write-Error "Failed to rename folders: $_"
    exit 1
}
