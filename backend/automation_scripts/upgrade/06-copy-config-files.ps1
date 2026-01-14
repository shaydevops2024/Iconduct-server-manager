# Full path: backend/automation_scripts/upgrade/06-copy-config-files.ps1

$ErrorActionPreference = "Stop"

# This script only runs on backend servers
$tempPath = "D:\Temp"
$iconductPath = "D:\IConduct"

try {
    $copiedCount = 0
    
    Write-Host "Copying .config files for Agents and Schedulers..."
    
    # Get Cloud.Agent and Scheduler folders from temp
    $specialFolders = Get-ChildItem -Path $tempPath -Directory | Where-Object { 
        $_.Name -match "Cloud\.?Agent|Scheduler" -and $_.Name -notmatch "storage"
    }
    
    foreach ($tempFolder in $specialFolders) {
        # Look for matching folder in D:\IConduct
        $sourcePath = Join-Path $iconductPath $tempFolder.Name
        
        if (Test-Path $sourcePath) {
            # Find .exe file in temp folder to determine config name
            $exeFiles = Get-ChildItem -Path $tempFolder.FullName -Filter "*.exe" -File
            
            if ($exeFiles) {
                $exeFile = $exeFiles[0]
                Write-Host "Found exe: $($exeFile.Name) in $($tempFolder.Name)"
                
                $configFileName = "$($exeFile.Name).config"
                $configSource = Join-Path $sourcePath $configFileName
                
                if (Test-Path $configSource) {
                    $configDest = Join-Path $tempFolder.FullName $configFileName
                    Copy-Item -Path $configSource -Destination $configDest -Force
                    Write-Host "Copied $configFileName to: $($tempFolder.Name)"
                    $copiedCount++
                } else {
                    Write-Host "Config file not found: $configSource"
                }
            } else {
                Write-Host "No .exe file found in: $($tempFolder.FullName)"
            }
        } else {
            Write-Host "Source folder not found: $sourcePath"
        }
    }
    
    Write-Host "Copied $copiedCount .config file(s)"
}
catch {
    Write-Error "Failed to copy .config files: $_"
    exit 1
}
