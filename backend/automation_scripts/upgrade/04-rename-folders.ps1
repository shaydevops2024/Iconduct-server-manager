# Full path: backend/automation_scripts/upgrade/04-rename-folders.ps1

$ErrorActionPreference = "Stop"

$serverType = '{{SERVER_TYPE}}'

# Set paths based on server type
if ($serverType -eq 'backend') {
    $tempPath = "D:\Temp"
    $productionPath = "D:\IConduct"
} else {
    $tempPath = "C:\inetpub\wwwroot\Temp"
    $productionPath = "C:\inetpub\wwwroot"
}

try {
    $renamedCount = 0
    
    # Get all folders in temp
    $tempFolders = Get-ChildItem -Path $tempPath -Directory
    
    Write-Host "Found $($tempFolders.Count) folders in temp"
    
    if ($serverType -eq 'backend') {
        # Backend server - use Windows service paths to get exact folder names
        Write-Host "`nQuerying Windows services for folder paths..."
        
        # Get all Windows services and their executable paths
        $services = Get-WmiObject Win32_Service | Where-Object { 
            $_.PathName -like "*$productionPath*" 
        }
        
        # Extract folder names from service paths
        $serviceFolders = @{}
        foreach ($service in $services) {
            $pathName = $service.PathName
            
            # Extract path between D:\IConduct\ and the executable
            if ($pathName -match "D:\\IConduct\\([^\\]+)\\") {
                $folderName = $matches[1]
                if (-not $serviceFolders.ContainsKey($folderName)) {
                    $serviceFolders[$folderName] = $true
                    Write-Host "Found service folder: $folderName"
                }
            }
        }
        
        # Also get folders directly from D:\IConduct for non-service folders
        $productionFolders = Get-ChildItem -Path $productionPath -Directory
        
        Write-Host "`nMatching temp folders with service folders..."
        
        foreach ($tempFolder in $tempFolders) {
            $tempFolderName = $tempFolder.Name
            
            # Skip special folders (will be handled separately)
            if ($tempFolderName -match "^CloudAgent$|^Cloud\.?Agent$" -or 
                ($tempFolderName -match "^Scheduler$" -and $tempFolderName -notmatch "storage")) {
                Write-Host "Skipping special folder for now: $tempFolderName"
                continue
            }
            
            # Find matching folder
            $matchedFolder = $null
            
            # Try exact match in service folders first
            if ($serviceFolders.ContainsKey($tempFolderName)) {
                $matchedFolder = $tempFolderName
            } else {
                # Try fuzzy match with service folders
                foreach ($serviceFolder in $serviceFolders.Keys) {
                    # Remove dots, dashes, spaces for comparison
                    $normalizedTemp = $tempFolderName -replace '[.\-\s]', ''
                    $normalizedService = $serviceFolder -replace '[.\-\s]', ''
                    
                    if ($normalizedTemp -eq $normalizedService) {
                        $matchedFolder = $serviceFolder
                        break
                    }
                    
                    # Check if service folder contains temp folder name or vice versa
                    if ($serviceFolder -like "*$tempFolderName*" -or $tempFolderName -like "*$serviceFolder*") {
                        $matchedFolder = $serviceFolder
                        break
                    }
                    
                    # Check for partial matches (e.g., "AgentNotification" matches "IConductAgentNotification")
                    if ($normalizedService -like "*$normalizedTemp*" -or $normalizedTemp -like "*$normalizedService*") {
                        $matchedFolder = $serviceFolder
                        break
                    }
                }
                
                # If still not found, try matching with production folders
                if (-not $matchedFolder) {
                    foreach ($prodFolder in $productionFolders) {
                        $normalizedTemp = $tempFolderName -replace '[.\-\s]', ''
                        $normalizedProd = $prodFolder.Name -replace '[.\-\s]', ''
                        
                        if ($normalizedTemp -eq $normalizedProd) {
                            $matchedFolder = $prodFolder.Name
                            break
                        }
                        
                        if ($normalizedProd -like "*$normalizedTemp*" -or $normalizedTemp -like "*$normalizedProd*") {
                            $matchedFolder = $prodFolder.Name
                            break
                        }
                    }
                }
            }
            
            # Rename if match found
            if ($matchedFolder) {
                if ($tempFolderName -ne $matchedFolder) {
                    $newPath = Join-Path $tempPath $matchedFolder
                    
                    # If destination exists in temp, remove it first
                    if (Test-Path $newPath) {
                        Remove-Item -Path $newPath -Recurse -Force
                    }
                    
                    Rename-Item -Path $tempFolder.FullName -NewName $matchedFolder -Force
                    Write-Host "Matched: $tempFolderName -> $matchedFolder"
                    Write-Host "Renamed: $tempFolderName -> $matchedFolder"
                    $renamedCount++
                } else {
                    Write-Host "Already correct name: $tempFolderName"
                }
            } else {
                Write-Host "WARNING: No match found for: $tempFolderName (keeping original name)"
            }
        }
        
        # Handle CloudAgent special case
        $cloudAgentFolders = Get-ChildItem -Path $tempPath -Directory | Where-Object { 
            $_.Name -match "^CloudAgent$|^Cloud\.?Agent$" 
        }
        
        if ($cloudAgentFolders) {
            foreach ($cloudAgentFolder in $cloudAgentFolders) {
                Write-Host "`nProcessing CloudAgent folder: $($cloudAgentFolder.Name)"
                
                # Duplicate the folder
                $basePath = $cloudAgentFolder.FullName
                $copy01Path = Join-Path $tempPath "CloudAgent01_temp"
                $copy02Path = Join-Path $tempPath "CloudAgent02_temp"
                
                Copy-Item -Path $basePath -Destination $copy01Path -Recurse -Force
                Copy-Item -Path $basePath -Destination $copy02Path -Recurse -Force
                Write-Host "Duplicated CloudAgent -> CloudAgent01_temp + CloudAgent02_temp"
                
                # Remove original
                Remove-Item -Path $basePath -Recurse -Force
                
                # Handle release folders for BOTH copies
                foreach ($copyPath in @($copy01Path, $copy02Path)) {
                    $releasePath = Join-Path $copyPath "release"
                    if (Test-Path $releasePath) {
                        Write-Host "Extracting release folder in: $(Split-Path $copyPath -Leaf)"
                        Get-ChildItem -Path $releasePath | Move-Item -Destination $copyPath -Force
                        Remove-Item -Path $releasePath -Recurse -Force
                        Write-Host "Extracted release folder content (moved files up one level)"
                    }
                }
                
                # Find matching folders using service paths
                $agent01Match = $null
                $agent02Match = $null
                
                foreach ($serviceFolder in $serviceFolders.Keys) {
                    if ($serviceFolder -match "cloud.*agent.*01" -or $serviceFolder -match "agent.*cloud.*01") {
                        $agent01Match = $serviceFolder
                    }
                    if ($serviceFolder -match "cloud.*agent.*02" -or $serviceFolder -match "agent.*cloud.*02") {
                        $agent02Match = $serviceFolder
                    }
                }
                
                if ($agent01Match) {
                    Rename-Item -Path $copy01Path -NewName $agent01Match -Force
                    Write-Host "Matched with service path: $agent01Match"
                    Write-Host "Renamed: CloudAgent01_temp -> $agent01Match"
                    $renamedCount++
                } else {
                    Write-Host "WARNING: No match found for CloudAgent01"
                }
                
                if ($agent02Match) {
                    Rename-Item -Path $copy02Path -NewName $agent02Match -Force
                    Write-Host "Matched with service path: $agent02Match"
                    Write-Host "Renamed: CloudAgent02_temp -> $agent02Match"
                    $renamedCount++
                } else {
                    Write-Host "WARNING: No match found for CloudAgent02"
                }
            }
        }
        
        # Handle Scheduler special case
        $schedulerFolders = Get-ChildItem -Path $tempPath -Directory | Where-Object { 
            $_.Name -match "^Scheduler$" -and $_.Name -notmatch "storage" 
        }
        
        if ($schedulerFolders) {
            foreach ($schedulerFolder in $schedulerFolders) {
                Write-Host "`nProcessing Scheduler folder: $($schedulerFolder.Name)"
                
                # Duplicate the folder
                $basePath = $schedulerFolder.FullName
                $copy01Path = Join-Path $tempPath "Scheduler01_temp"
                $copy02Path = Join-Path $tempPath "Scheduler02_temp"
                
                Copy-Item -Path $basePath -Destination $copy01Path -Recurse -Force
                Copy-Item -Path $basePath -Destination $copy02Path -Recurse -Force
                Write-Host "Duplicated Scheduler -> Scheduler01_temp + Scheduler02_temp"
                
                # Remove original
                Remove-Item -Path $basePath -Recurse -Force
                
                # Handle release folders for BOTH copies
                foreach ($copyPath in @($copy01Path, $copy02Path)) {
                    $releasePath = Join-Path $copyPath "release"
                    if (Test-Path $releasePath) {
                        Write-Host "Extracting release folder in: $(Split-Path $copyPath -Leaf)"
                        Get-ChildItem -Path $releasePath | Move-Item -Destination $copyPath -Force
                        Remove-Item -Path $releasePath -Recurse -Force
                        Write-Host "Extracted release folder content"
                    }
                }
                
                # Find matching folders using service paths
                $scheduler01Match = $null
                $scheduler02Match = $null
                
                foreach ($serviceFolder in $serviceFolders.Keys) {
                    if ($serviceFolder -match "scheduler.*01" -and $serviceFolder -notmatch "storage") {
                        $scheduler01Match = $serviceFolder
                    }
                    if ($serviceFolder -match "scheduler.*02" -and $serviceFolder -notmatch "storage") {
                        $scheduler02Match = $serviceFolder
                    }
                }
                
                if ($scheduler01Match) {
                    Rename-Item -Path $copy01Path -NewName $scheduler01Match -Force
                    Write-Host "Matched with service path: $scheduler01Match"
                    Write-Host "Renamed: Scheduler01_temp -> $scheduler01Match"
                    $renamedCount++
                } else {
                    Write-Host "WARNING: No match found for Scheduler01"
                }
                
                if ($scheduler02Match) {
                    Rename-Item -Path $copy02Path -NewName $scheduler02Match -Force
                    Write-Host "Matched with service path: $scheduler02Match"
                    Write-Host "Renamed: Scheduler02_temp -> $scheduler02Match"
                    $renamedCount++
                } else {
                    Write-Host "WARNING: No match found for Scheduler02"
                }
            }
        }
    } else {
        # Frontend server - simpler matching
        Write-Host "Frontend server - using simple folder matching..."
        
        $productionFolders = Get-ChildItem -Path $productionPath -Directory
        
        foreach ($tempFolder in $tempFolders) {
            $tempFolderName = $tempFolder.Name
            
            # Try to find matching folder
            $matchedFolder = $productionFolders | Where-Object { 
                $_.Name -eq $tempFolderName 
            } | Select-Object -First 1
            
            if ($matchedFolder) {
                Write-Host "Matched: $tempFolderName -> $($matchedFolder.Name)"
                
                if ($tempFolderName -ne $matchedFolder.Name) {
                    Rename-Item -Path $tempFolder.FullName -NewName $matchedFolder.Name -Force
                    Write-Host "Renamed: $tempFolderName -> $($matchedFolder.Name)"
                    $renamedCount++
                }
            } else {
                Write-Host "No match found for: $tempFolderName (new folder or keeping original name)"
            }
        }
    }
    
    Write-Host "`nRenamed $renamedCount folder(s) to match production names"
    
    # Show final structure
    Write-Host "`nFinal folders in temp:"
    Get-ChildItem -Path $tempPath -Directory | ForEach-Object {
        Write-Host "  - $($_.Name)"
    }
}
catch {
    Write-Error "Failed to rename folders: $_"
    exit 1
}
