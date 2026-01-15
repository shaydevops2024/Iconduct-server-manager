# Full path: backend/automation_scripts/upgrade/oldUI_05-backup-old-version.ps1

$ErrorActionPreference = "Stop"

# Define paths
$wwwrootPath = "C:\inetpub\wwwroot"
$currentUIPath = Join-Path $wwwrootPath "IConductUI"

try {
    Write-Host "---- Starting Backup Old Version Phase ----"

    # Get current date in dd.MM.yy format
    $dateStamp = Get-Date -Format "dd.MM.yy"

    # Check if current IConductUI exists
    if (Test-Path $currentUIPath) {
        $newName = "old.$dateStamp.IConductUI"
        $backupPath = Join-Path $wwwrootPath $newName

        Write-Host "Renaming current IConductUI to $newName..."

        # If backup with same date exists, add timestamp
        if (Test-Path $backupPath) {
            $timestamp = Get-Date -Format "HHmmss"
            $newName = "old.$dateStamp.$timestamp.IConductUI"
            $backupPath = Join-Path $wwwrootPath $newName
            Write-Host "Backup already exists, using timestamp: $newName"
        }

        # Rename the folder
        Rename-Item -Path $currentUIPath -NewName $newName -Force
        Write-Host "Successfully renamed '$currentUIPath' to '$newName'"
    } else {
        Write-Host "No existing IConductUI folder found (first time installation)"
    }

    Write-Host "---- Backup Old Version Phase Completed Successfully ----"
}
catch {
    Write-Error "Failed to backup old version: $_"
    exit 1
}
