# Full path: backend/automation_scripts/upgrade/06-copy-config-files.ps1

$ErrorActionPreference = "Stop"

# This script only runs on backend servers
$tempPath = "D:\Temp"
$iconductPath = "D:\IConduct"

try {
    $copiedConfigCount = 0
    $copiedExeCount = 0
    
    Write-Host "Copying .config files and CloudAgent executables..."
    
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
                
                # Copy .config file
                $configFileName = "$($exeFile.Name).config"
                $configSource = Join-Path $sourcePath $configFileName
                
                if (Test-Path $configSource) {
                    $configDest = Join-Path $tempFolder.FullName $configFileName
                    Copy-Item -Path $configSource -Destination $configDest -Force
                    Write-Host "Copied $configFileName to: $($tempFolder.Name)"
                    $copiedConfigCount++
                } else {
                    Write-Host "Config file not found: $configSource"
                }
                
                # If this is a CloudAgent folder, also copy the ServIT.IConduct.CloudAgentWinService.exe
                if ($tempFolder.Name -match "Cloud\.?Agent") {
                    $cloudAgentExeName = "ServIT.IConduct.CloudAgentWinService.exe"
                    $cloudAgentExeSource = Join-Path $sourcePath $cloudAgentExeName
                    
                    if (Test-Path $cloudAgentExeSource) {
                        $cloudAgentExeDest = Join-Path $tempFolder.FullName $cloudAgentExeName
                        Copy-Item -Path $cloudAgentExeSource -Destination $cloudAgentExeDest -Force
                        Write-Host "Copied $cloudAgentExeName to: $($tempFolder.Name)"
                        $copiedExeCount++
                        
                        # Also copy the config for the CloudAgentWinService if it exists
                        $cloudAgentExeConfig = "$cloudAgentExeName.config"
                        $cloudAgentExeConfigSource = Join-Path $sourcePath $cloudAgentExeConfig
                        
                        if (Test-Path $cloudAgentExeConfigSource) {
                            $cloudAgentExeConfigDest = Join-Path $tempFolder.FullName $cloudAgentExeConfig
                            Copy-Item -Path $cloudAgentExeConfigSource -Destination $cloudAgentExeConfigDest -Force
                            Write-Host "Copied $cloudAgentExeConfig to: $($tempFolder.Name)"
                            $copiedConfigCount++
                        }
                    } else {
                        Write-Host "CloudAgent exe not found: $cloudAgentExeSource"
                    }
                }
            } else {
                Write-Host "No .exe file found in: $($tempFolder.FullName)"
            }
        } else {
            Write-Host "Source folder not found: $sourcePath"
        }
    }
    
    Write-Host "`nSummary:"
    Write-Host "Copied $copiedConfigCount .config file(s)"
    Write-Host "Copied $copiedExeCount CloudAgent executable(s)"
}
catch {
    Write-Error "Failed to copy files: $_"
    exit 1
}