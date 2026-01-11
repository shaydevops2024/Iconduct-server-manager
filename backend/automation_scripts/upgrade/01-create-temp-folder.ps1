# Full path: backend/automation_scripts/upgrade/01-create-temp-folder.ps1

$ErrorActionPreference = "Stop"

$tempPath = "D:\Temp"

try {
    # Create temp folder if it doesn't exist
    if (-not (Test-Path $tempPath)) {
        New-Item -ItemType Directory -Path $tempPath -Force | Out-Null
        Write-Output "Created temp folder: $tempPath"
    } else {
        Write-Output "Temp folder already exists: $tempPath"
    }
    
    Write-Output $tempPath
}
catch {
    Write-Error "Failed to create temp folder: $_"
    exit 1
}
