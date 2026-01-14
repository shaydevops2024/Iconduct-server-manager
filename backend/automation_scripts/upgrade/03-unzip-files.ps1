# Full path: backend/automation_scripts/upgrade/03-unzip-files.ps1

$ErrorActionPreference = "Stop"

# Backend only - fixed paths
$sourcePath = "D:\IConduct-Upload"   # Where the S3 downloaded ZIP(s) are
$tempPath   = "D:\Temp"              # Extraction root

try {
    Write-Host "Step 1: Unzipping wrapper ZIP(s) from $sourcePath to $tempPath..."

    # Get all wrapper ZIP files
    $wrapperZips = Get-ChildItem -Path $sourcePath -Filter "*.zip" -File

    if ($wrapperZips.Count -eq 0) {
        Write-Host "No wrapper ZIP files found in $sourcePath"
        Write-Host "Done"
        exit 0
    }

    Write-Host "Found $($wrapperZips.Count) wrapper ZIP file(s)."

    foreach ($zip in $wrapperZips) {
        Write-Host "Unzipping wrapper: $($zip.Name) -> $tempPath"
        Expand-Archive -Path $zip.FullName -DestinationPath $tempPath -Force
        Remove-Item -Path $zip.FullName -Force
        Write-Host "Extracted and removed: $($zip.Name)"
    }

    Write-Host "`nStep 2: Processing unzipped folders inside $tempPath..."

    # Get all folders created by the wrapper ZIPs
    $unzippedFolders = Get-ChildItem -Path $tempPath -Directory

    foreach ($folder in $unzippedFolders) {
        Write-Host "Processing folder: $($folder.Name)"

        # Find all ZIP files inside this folder
        $innerZips = Get-ChildItem -Path $folder.FullName -Filter "*.zip" -File

        if ($innerZips.Count -eq 0) {
            Write-Host "No inner ZIPs found in $($folder.Name), skipping..."
            continue
        }

        Write-Host "Found $($innerZips.Count) inner ZIP file(s) in $($folder.Name)."

        foreach ($innerZip in $innerZips) {
            $innerFolderName = [System.IO.Path]::GetFileNameWithoutExtension($innerZip.Name)
            $destinationPath = Join-Path $tempPath $innerFolderName

            Write-Host "Unzipping: $($innerZip.Name) -> $destinationPath"

            # Create folder if it doesn't exist
            if (-not (Test-Path $destinationPath)) {
                New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
            }

            # Unzip the inner ZIP
            Expand-Archive -Path $innerZip.FullName -DestinationPath $destinationPath -Force

            # Delete the ZIP after extraction (with retry for locked files)
            $retries = 3
            $deleted = $false
            for ($i = 1; $i -le $retries; $i++) {
                try {
                    Remove-Item -Path $innerZip.FullName -Force -ErrorAction Stop
                    Write-Host "Extracted and removed: $($innerZip.Name)"
                    $deleted = $true
                    break
                }
                catch {
                    if ($i -lt $retries) {
                        Write-Host "Retry $i of $retries - ZIP file locked, waiting..."
                        Start-Sleep -Seconds 2
                    }
                    else {
                        Write-Host "Warning: Could not delete $($innerZip.Name) (file locked), continuing..."
                    }
                }
            }
        }

        # Remove the wrapper folder after extracting all inner ZIPs
        Write-Host "Removing wrapper folder: $($folder.Name)"
        Remove-Item -Path $folder.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Host "`nAll done! ZIPs extracted to $tempPath"
}
catch {
    Write-Error "Failed to unzip files: $_"
    exit 1
}
