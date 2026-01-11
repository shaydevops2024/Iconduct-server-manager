# Full path: backend/automation_scripts/upgrade/12-cleanup-temp.ps1

$ErrorActionPreference = "Stop"

$serverType = '{{SERVER_TYPE}}'

# Set paths based on server type
if ($serverType -eq 'backend') {
    $tempPath = "D:\Temp"
    $uploadPath = "D:\IConduct-Upload"
} else {
    $tempPath = "C:\inetpub\wwwroot\Temp"
    $uploadPath = "C:\inetpub\wwwroot\IConduct-Upload"
}

try {
    Write-Host "Cleaning up temporary folders..."
    
    # Remove temp folder
    if (Test-Path $tempPath) {
        Remove-Item -Path $tempPath -Recurse -Force
        Write-Host "Removed temp folder: $tempPath"
    }
    
    # Remove upload folder
    if (Test-Path $uploadPath) {
        Remove-Item -Path $uploadPath -Recurse -Force
        Write-Host "Removed upload folder: $uploadPath"
    }
    
    Write-Host "Cleanup completed successfully"
}
catch {
    Write-Error "Failed to cleanup: $_"
    exit 1
}
