# Full path: backend/automation_scripts/upgrade/12-cleanup-temp.ps1

$ErrorActionPreference = "Stop"

# Backend-only paths
$tempPath = "D:\Temp"
$uploadPath = "D:\IConduct-Upload"

try {
    Write-Host "Cleaning up temporary folders..."
    
    # Remove temp folder
    if (Test-Path $tempPath) {
        Remove-Item -Path $tempPath -Recurse -Force
        Write-Host "Removed temp folder: $tempPath"
    } else {
        Write-Host "Temp folder not found: $tempPath"
    }
    
    # Remove upload folder
    if (Test-Path $uploadPath) {
        Remove-Item -Path $uploadPath -Recurse -Force
        Write-Host "Removed upload folder: $uploadPath"
    } else {
        Write-Host "Upload folder not found: $uploadPath"
    }
    
    Write-Host "Cleanup completed successfully"
}
catch {
    Write-Error "Failed to cleanup: $_"
    exit 1
}
