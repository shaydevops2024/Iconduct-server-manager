$ErrorActionPreference = "Stop"

try {
    Write-Host "Starting New UI unzip phase 2"

    $tempPath = "C:\temp-new-ui"

    # Find the first zip file in the temp directory
    $zipFile = Get-ChildItem -Path $tempPath -Filter "*.zip" | Select-Object -First 1

    if (-not $zipFile) {
        throw "No zip file found in $tempPath"
    }

    $zipFilePath = $zipFile.FullName
    $zipFileName = [System.IO.Path]::GetFileNameWithoutExtension($zipFilePath)
    $extractPath = Join-Path $tempPath $zipFileName

    # Extract the zip file into a folder with the same name
    Write-Host "Extracting $($zipFile.Name) to $extractPath..."
    Expand-Archive -Path $zipFilePath -DestinationPath $extractPath -Force
    Write-Host "Extraction completed to: $extractPath"

    # Check what was extracted
    $extractedItems = Get-ChildItem -Path $extractPath
    Write-Host "Extracted items count: $($extractedItems.Count)"

    foreach ($item in $extractedItems) {
        Write-Host "  - $($item.Name) $(if ($item.PSIsContainer) {'[Directory]'} else {'[File]'})"
    }

    Write-Host "New UI unzip phase completed successfully"
}
catch {
    Write-Error "Failed to unzip New UI files: $_"
    exit 1
}
