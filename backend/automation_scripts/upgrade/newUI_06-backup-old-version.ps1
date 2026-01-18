# Full path: backend/automation_scripts/upgrade/newUI_06-backup-old-version.ps1

$ErrorActionPreference = "Stop"

try {
    Write-Host "Starting New UI backup old version phase 6"

    $wwwrootPath = "C:\inetpub\wwwroot"

    # Find the New UI folder
    $newUIFolders = Get-ChildItem -Path $wwwrootPath -Directory | Where-Object { 
        $_.Name -match 'IConductUI.*New' -or $_.Name -match 'IConductUI_NEW' -or $_.Name -eq 'IConductUINew'
    }

    if ($newUIFolders.Count -eq 0) {
        Write-Host "Warning: No New UI folder found in $wwwrootPath - nothing to backup"
        Write-Host "This might be a fresh installation"
        exit 0
    }

    $targetFolderName = $newUIFolders[0].Name
    $targetPath = Join-Path $wwwrootPath $targetFolderName

    Write-Host "Found New UI folder: $targetFolderName"

    if (Test-Path $targetPath) {
        # Get current date in dd.MM.yy format
        $dateStamp = Get-Date -Format "dd.MM.yy"
        $newName = "old.$dateStamp.$targetFolderName"
        $newPath = Join-Path $wwwrootPath $newName

        Write-Host "Backing up current version:"
        Write-Host "  From: $targetFolderName"
        Write-Host "  To: $newName"

        # If a backup with this name already exists, add a time stamp
        if (Test-Path $newPath) {
            $timeStamp = Get-Date -Format "HHmmss"
            $newName = "old.$dateStamp.$timeStamp.$targetFolderName"
            $newPath = Join-Path $wwwrootPath $newName
            Write-Host "Backup already exists, using timestamped name: $newName"
        }

        try {
            Rename-Item -Path $targetPath -NewName $newName -ErrorAction Stop
            Write-Host "Successfully renamed '$targetFolderName' to '$newName'"
            
            # Verify the backup exists
            if (Test-Path $newPath) {
                $backupSize = (Get-ChildItem -Path $newPath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
                Write-Host "Backup verified: $([math]::Round($backupSize, 2)) MB"
            }
        }
        catch {
            throw "Failed to rename '$targetPath' to '$newName': $_"
        }
    }
    else {
        Write-Host "No existing folder found at $targetPath - nothing to backup"
        Write-Host "This might be a fresh installation"
    }

    Write-Host "New UI backup old version phase completed successfully"
}
catch {
    Write-Error "Failed to backup New UI old version: $_"
    exit 1
}