# Full path: backend/automation_scripts/upgrade/newUI_09-cleanup-temp.ps1

$ErrorActionPreference = "Stop"

try {
    Write-Host "Starting New UI cleanup temp phase 9"

    $tempPath = "C:\temp-new-ui"

    if (Test-Path $tempPath) {
        Write-Host "Cleaning up temporary folder: $tempPath"
        
        try {
            # Get folder size before deletion
            $folderSize = (Get-ChildItem -Path $tempPath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
            Write-Host "Temp folder size: $([math]::Round($folderSize, 2)) MB"
            
            # Remove the temporary folder and all its contents
            Remove-Item -Path $tempPath -Recurse -Force
            Write-Host "Successfully removed temporary folder"
        }
        catch {
            Write-Host "Warning: Failed to remove temporary folder - $_"
            Write-Host "You may need to manually delete: $tempPath"
        }
    }
    else {
        Write-Host "Temporary folder not found: $tempPath"
        Write-Host "Nothing to clean up"
    }

    Write-Host "New UI cleanup temp phase completed successfully"
}
catch {
    Write-Error "Failed to cleanup New UI temp files: $_"
    exit 1
}