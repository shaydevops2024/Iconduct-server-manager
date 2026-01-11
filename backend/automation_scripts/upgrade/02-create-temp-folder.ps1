# Full path: backend/automation_scripts/upgrade/02-create-temp-folder.ps1

$ErrorActionPreference = "Stop"

$serverType = '{{SERVER_TYPE}}'

# Set paths based on server type
if ($serverType -eq 'backend') {
    $tempPath = "D:\Temp"
} else {
    $tempPath = "C:\inetpub\wwwroot\Temp"
}

try {
    # Remove temp folder if exists (clean slate)
    if (Test-Path $tempPath) {
        Remove-Item -Path $tempPath -Recurse -Force
        Write-Host "Removed existing temp folder"
    }
    
    # Create fresh temp folder
    New-Item -ItemType Directory -Path $tempPath -Force | Out-Null
    Write-Host "Created temp folder: $tempPath"
    
    Write-Host $tempPath
}
catch {
    Write-Error "Failed to create temp folder: $_"
    exit 1
}
