# Full path: backend/automation_scripts/upgrade/newUI_07-deploy-new-version.ps1

$ErrorActionPreference = "Stop"

try {
    Write-Host "Starting New UI deploy new version phase 7"

    $readyPath = "C:\temp-new-ui\"
    $wwwrootPath = "C:\inetpub\wwwroot"

    # Find the New UI folder name
    $newUIFolders = Get-ChildItem -Path $readyPath -Directory

    if ($newUIFolders.Count -eq 0) {
        throw "No folders found in $readyPath"
    }

    # Get the first folder (should be the renamed New UI folder)
    $sourceFolder = $newUIFolders[0]
    $sourcePath = $sourceFolder.FullName
    $folderName = $sourceFolder.Name

    Write-Host "Deploying New UI folder: $folderName"
    Write-Host "  From: $sourcePath"
    Write-Host "  To: $wwwrootPath"

    $destinationPath = Join-Path $wwwrootPath $folderName

    # Verify destination doesn't already exist
    if (Test-Path $destinationPath) {
        throw "Destination folder already exists: $destinationPath. Backup phase may have failed."
    }

    # Move the folder
    try {
        Move-Item -Path $sourcePath -Destination $destinationPath -Force
        Write-Host "Successfully moved folder to $destinationPath"
    }
    catch {
        throw "Failed to move folder: $_"
    }

    # Verify deployment
    if (Test-Path $destinationPath) {
        $deployedSize = (Get-ChildItem -Path $destinationPath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
        Write-Host "Deployment verified: $([math]::Round($deployedSize, 2)) MB"
        
        # Count files
        $fileCount = (Get-ChildItem -Path $destinationPath -Recurse -File).Count
        Write-Host "Total files deployed: $fileCount"
    }
    else {
        throw "Deployment verification failed: folder not found at $destinationPath"
    }

    Write-Host "New UI deploy new version phase completed successfully"
}
catch {
    Write-Error "Failed to deploy New UI new version: $_"
    exit 1
}