# Full path: backend/automation_scripts/upgrade/07-copy-special-folders.ps1

$ErrorActionPreference = "Stop"

$serverType = '{{SERVER_TYPE}}'

# Set paths based on server type
if ($serverType -eq 'backend') {
    $tempPath = "D:\Temp"
    $iconductPath = "D:\IConduct"
} else {
    # This script only runs on backend
    Write-Host "Skipping special folders copy - frontend server"
    exit 0
}

try {
    $copiedCount = 0
    
    Write-Host "Copying special folders..."
    
    # Copy Connectors folder from Connector Repository
    $connectorRepoFolders = Get-ChildItem -Path $tempPath -Directory | Where-Object { 
        $_.Name -match "Connector.*Repo" 
    }
    
    foreach ($repoFolder in $connectorRepoFolders) {
        $sourcePath = Join-Path $iconductPath $repoFolder.Name
        
        if (Test-Path $sourcePath) {
            $connectorsSource = Join-Path $sourcePath "Connectors"
            
            if (Test-Path $connectorsSource) {
                $connectorsDest = Join-Path $repoFolder.FullName "Connectors"
                
                # Remove destination if exists
                if (Test-Path $connectorsDest) {
                    Remove-Item -Path $connectorsDest -Recurse -Force
                }
                
                Copy-Item -Path $connectorsSource -Destination $connectorsDest -Recurse -Force
                Write-Host "Copied Connectors folder to: $($repoFolder.Name)"
                $copiedCount++
            }
        }
    }
    
    # Copy ConnectorAssemblyCache from Cloud.Agent01, Cloud.Agent02, Scheduler01, Scheduler02
    $cacheSourcePatterns = @("Cloud.*Agent.*01", "Cloud.*Agent.*02", "Scheduler.*01", "Scheduler.*02")
    
    foreach ($pattern in $cacheSourcePatterns) {
        # Find matching folder in temp (might have different exact name)
        $tempFolder = Get-ChildItem -Path $tempPath -Directory | Where-Object { 
            $_.Name -match $pattern -and $_.Name -notmatch "storage"
        } | Select-Object -First 1
        
        if ($tempFolder) {
            $sourcePath = Join-Path $iconductPath $tempFolder.Name
            
            if (Test-Path $sourcePath) {
                $cacheSource = Join-Path $sourcePath "ConnectorAssemblyCache"
                
                if (Test-Path $cacheSource) {
                    $cacheDest = Join-Path $tempFolder.FullName "ConnectorAssemblyCache"
                    
                    # Remove destination if exists
                    if (Test-Path $cacheDest) {
                        Remove-Item -Path $cacheDest -Recurse -Force
                    }
                    
                    Copy-Item -Path $cacheSource -Destination $cacheDest -Recurse -Force
                    Write-Host "Copied ConnectorAssemblyCache to: $($tempFolder.Name)"
                    $copiedCount++
                } else {
                    Write-Host "ConnectorAssemblyCache not found in: $sourcePath"
                }
            }
        }
    }
    
    Write-Host "Copied $copiedCount special folder(s)"
}
catch {
    Write-Error "Failed to copy special folders: $_"
    exit 1
}
