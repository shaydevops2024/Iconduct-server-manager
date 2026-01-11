# Full path: backend/automation_scripts/upgrade/02-unzip-files.ps1

$ErrorActionPreference = "Stop"

$uploadPath = "D:\IConduct-Upload"
$tempPath = "D:\Temp"
$backendZipPath = "{{BACKEND_ZIP_PATH}}"

try {
    $unzippedCount = 0
    
    # Unzip backend if provided
    if ($backendZipPath -and (Test-Path $backendZipPath)) {
        Write-Output "Unzipping backend: $backendZipPath"
        Expand-Archive -Path $backendZipPath -DestinationPath $tempPath -Force
        $unzippedCount++
        Write-Output "Backend unzipped successfully"
    }
    
    # Check for nested folders and extract them
    $items = Get-ChildItem -Path $tempPath -Directory
    foreach ($item in $items) {
        # Check if there's a single subfolder inside
        $subItems = Get-ChildItem -Path $item.FullName
        if ($subItems.Count -eq 1 -and $subItems[0].PSIsContainer) {
            # Move contents up one level
            $innerFolder = $subItems[0].FullName
            Get-ChildItem -Path $innerFolder | Move-Item -Destination $tempPath -Force
            Remove-Item -Path $item.FullName -Recurse -Force
            Write-Output "Flattened nested folder: $($item.Name)"
        }
    }
    
    Write-Output "Unzipped $unzippedCount file(s) to $tempPath"
}
catch {
    Write-Error "Failed to unzip files: $_"
    exit 1
}
