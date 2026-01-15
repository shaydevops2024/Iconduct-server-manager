# Full path: backend/automation_scripts/upgrade/oldUI_02-unzip-files.ps1

$ErrorActionPreference = "Stop"

# Define paths
$tempPath = "C:\inetpub\wwwroot\temp"
$zipFile = Join-Path $tempPath "oldUI.zip"

try {
    Write-Host "---- Starting Old UI Unzip Phase ----"

    # Verify zip file exists
    if (-not (Test-Path $zipFile)) {
        throw "oldUI.zip not found at $zipFile"
    }

    # Extract zip to temp folder
    Write-Host "Extracting oldUI.zip to $tempPath..."
    Expand-Archive -Path $zipFile -DestinationPath $tempPath -Force
    Write-Host "Extraction completed"

    # Find PackageTmp folder
    Write-Host "Looking for PackageTmp folder..."
    $packageTmpPath = Get-ChildItem -Path $tempPath -Recurse -Directory | 
        Where-Object { $_.Name -eq "PackageTmp" } | 
        Select-Object -First 1

    if (-not $packageTmpPath) {
        throw "PackageTmp folder not found in extracted files"
    }

    Write-Host "Found PackageTmp at: $($packageTmpPath.FullName)"

    # Create IConductUI destination folder
    $iConductUIPath = Join-Path $tempPath "IConductUI"
    if (-not (Test-Path $iConductUIPath)) {
        New-Item -ItemType Directory -Path $iConductUIPath | Out-Null
        Write-Host "Created IConductUI folder"
    }

    # Copy PackageTmp contents to IConductUI
    Write-Host "Copying PackageTmp contents to IConductUI..."
    Copy-Item -Path (Join-Path $packageTmpPath.FullName '*') -Destination $iConductUIPath -Recurse -Force
    Write-Host "Contents copied successfully"

    # Delete everything in temp except IConductUI and the zip file
    Write-Host "Cleaning up temporary extraction files..."
    Get-ChildItem -Path $tempPath | Where-Object { 
        $_.Name -ne "IConductUI" -and $_.Name -ne "oldUI.zip" 
    } | ForEach-Object {
        if ($_.PSIsContainer) {
            Remove-Item -Recurse -Force -Path $_.FullName
            Write-Host "Deleted folder: $($_.Name)"
        } else {
            Remove-Item -Force -Path $_.FullName
            Write-Host "Deleted file: $($_.Name)"
        }
    }

    Write-Host "Cleanup complete. IConductUI folder is ready in temp"
    Write-Host "---- Unzip Phase Completed Successfully ----"
}
catch {
    Write-Error "Failed to unzip Old UI files: $_"
    exit 1
}
