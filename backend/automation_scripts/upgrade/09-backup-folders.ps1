# Full path: backend/automation_scripts/upgrade/09-backup-folders.ps1

$ErrorActionPreference = "Stop"

$serverType = '{{SERVER_TYPE}}'

# Set paths based on server type
if ($serverType -eq 'backend') {
    $tempPath = "D:\Temp"
    $productionPath = "D:\IConduct"
} else {
    $tempPath = "C:\inetpub\wwwroot\Temp"
    $productionPath = "C:\inetpub\wwwroot"
}

try {
    # Get current date in dd.MM.yy format
    $dateStr = Get-Date -Format "dd.MM.yy"
    $backupFolderName = "Backup.$dateStr"
    $backupPath = Join-Path $productionPath $backupFolderName
    
    # Create backup folder
    if (-not (Test-Path $backupPath)) {
        New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
        Write-Host "Created backup folder: $backupPath"
    } else {
        # If exists, add timestamp
        $timestamp = Get-Date -Format "HHmmss"
        $backupFolderName = "Backup.$dateStr.$timestamp"
        $backupPath = Join-Path $productionPath $backupFolderName
        New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
        Write-Host "Created backup folder with timestamp: $backupPath"
    }
    
    $backedUpCount = 0
    
    Write-Host "`nBacking up existing folders..."
    
    # Get all folders in temp
    $tempFolders = Get-ChildItem -Path $tempPath -Directory
    
    foreach ($tempFolder in $tempFolders) {
        $sourcePath = Join-Path $productionPath $tempFolder.Name
        
        if (Test-Path $sourcePath) {
            # Rename with prefix
            $newName = "old.$dateStr.$($tempFolder.Name)"
            $renamedPath = Join-Path $productionPath $newName
            
            # Rename in production folder
            Rename-Item -Path $sourcePath -NewName $newName -Force
            Write-Host "Renamed: $($tempFolder.Name) -> $newName"
            
            # Move INTO the Backup folder
            $finalPath = Join-Path $backupPath $newName
            Move-Item -Path $renamedPath -Destination $finalPath -Force
            Write-Host "Moved to: $backupPath\$newName"
            
            $backedUpCount++
        } else {
            Write-Host "Source not found (new folder): $($tempFolder.Name)"
        }
    }
    
    Write-Host "`nBacked up $backedUpCount folder(s) to $backupPath"
}
catch {
    Write-Error "Failed to backup folders: $_"
    exit 1
}
