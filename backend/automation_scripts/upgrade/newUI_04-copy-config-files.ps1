$ErrorActionPreference = "Stop"

try {
    Write-Host "Starting New UI copy config files phase 4"

    $wwwrootPath = "C:\inetpub\wwwroot"
    $tempPath = "C:\temp-new-ui"

    # Find the New UI folder name
    $newUIFolders = Get-ChildItem -Path $wwwrootPath -Directory | Where-Object {
        $_.Name -match 'IConductUI.*New' -or $_.Name -match 'IConductUI_NEW' -or $_.Name -eq 'IConductUINew'
    }

    if ($newUIFolders.Count -eq 0) {
        throw "No New UI folder found in $wwwrootPath"
    }

    $targetFolderName = $newUIFolders[0].Name
    Write-Host "Target folder name: $targetFolderName"

    # Source: current production folder
    $sourcePath = Join-Path $wwwrootPath $targetFolderName

    # Destination: new upgrade folder (the renamed folder in temp)
    $destinationPath = Join-Path $tempPath $targetFolderName

    if (-not (Test-Path $sourcePath)) {
        throw "Source folder not found: $sourcePath"
    }

    if (-not (Test-Path $destinationPath)) {
        throw "Destination folder not found: $destinationPath"
    }

    # Only copy vault.json
    $fileToCopy = "vault.json"
    $sourceFile = Join-Path $sourcePath $fileToCopy
    $destinationFile = Join-Path $destinationPath $fileToCopy

    if (Test-Path $sourceFile) {
        try {
            Copy-Item -Path $sourceFile -Destination $destinationFile -Force
            Write-Host "Copied: $fileToCopy"
        }
        catch {
            Write-Host "Warning: Failed to copy $fileToCopy - $_"
        }
    }
    else {
        Write-Host "Notice: Source file not found, skipping: $fileToCopy"
    }

    Write-Host "New UI copy config files phase completed successfully"
}
catch {
    Write-Error "Failed to copy New UI config files: $_"
    exit 1
}
