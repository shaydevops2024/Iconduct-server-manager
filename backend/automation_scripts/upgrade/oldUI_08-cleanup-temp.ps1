# Full path: backend/automation_scripts/upgrade/oldUI_08-cleanup-temp.ps1

$ErrorActionPreference = "Stop"

# Define temp path
$tempPath = "C:\inetpub\wwwroot\temp"

try {
    Write-Host "---- Starting Cleanup Temp Folder Phase ----"

    if (Test-Path $tempPath) {
        Write-Host "Removing temp folder: $tempPath"
        Remove-Item -Path $tempPath -Recurse -Force
        Write-Host "Successfully removed temp folder"
    } else {
        Write-Host "Temp folder does not exist (already cleaned)"
    }

    Write-Host "---- Cleanup Temp Folder Phase Completed Successfully ----"
}
catch {
    Write-Error "Failed to cleanup temp folder: $_"
    exit 1
}
