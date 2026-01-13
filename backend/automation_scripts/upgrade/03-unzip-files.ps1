# Full path: backend/automation_scripts/upgrade/03-unzip-files.ps1

$ErrorActionPreference = "Stop"

$serverType = '{{SERVER_TYPE}}'

# Set paths based on server type
if ($serverType -eq 'backend') {
    $tempPath = "D:\Temp"
} else {
    $tempPath = "C:\inetpub\wwwroot\Temp"
}

try {
    Write-Host "Unzipping backend..."
    
    # Get all ZIP files in temp
    $zipFiles = Get-ChildItem -Path $tempPath -Filter "*.zip" -File
    
    if ($zipFiles.Count -eq 0) {
        Write-Host "No ZIP files found in $tempPath"
        Write-Host "Done"
        exit 0
    }
    
    Write-Host "Found $($zipFiles.Count) ZIP file(s) in $tempPath"
    
    # Unzip each file to a folder named after the ZIP (without .zip extension)
    foreach ($zipFile in $zipFiles) {
        $folderName = [System.IO.Path]::GetFileNameWithoutExtension($zipFile.Name)
        $extractPath = Join-Path $tempPath $folderName
        
        Write-Host "Unzipping: $($zipFile.Name) -> $folderName\"
        
        # Create folder if it doesn't exist
        if (-not (Test-Path $extractPath)) {
            New-Item -ItemType Directory -Path $extractPath -Force | Out-Null
        }
        
        # Unzip
        Expand-Archive -Path $zipFile.FullName -DestinationPath $extractPath -Force
        
        # Delete the ZIP file
        Remove-Item -Path $zipFile.FullName -Force
        Write-Host "Extracted and removed: $($zipFile.Name)"
    }
    
    # Handle nested ZIP files - each ZIP should create its own folder
    Write-Host "`nChecking for nested ZIP files..."
    
    # Get all directories in temp (like OneDrive_1_1-11-2026)
    $tempFolders = Get-ChildItem -Path $tempPath -Directory
    
    foreach ($folder in $tempFolders) {
        Write-Host "Checking folder: $($folder.Name)"
        
        # Find all ZIP files in this folder
        $nestedZips = Get-ChildItem -Path $folder.FullName -Filter "*.zip" -File
        
        if ($nestedZips) {
            Write-Host "Found $($nestedZips.Count) nested ZIP files in $($folder.Name)"
            
            foreach ($nestedZip in $nestedZips) {
                # Get ZIP file name without extension (this will be the folder name)
                $serviceFolderName = [System.IO.Path]::GetFileNameWithoutExtension($nestedZip.Name)
                
                # Create a folder for this service in the PARENT folder
                $serviceFolderPath = Join-Path $folder.FullName $serviceFolderName
                
                Write-Host "Unzipping: $($nestedZip.Name) -> $serviceFolderName\"
                
                # Create the service folder
                if (-not (Test-Path $serviceFolderPath)) {
                    New-Item -ItemType Directory -Path $serviceFolderPath -Force | Out-Null
                }
                
                # Unzip the service ZIP into its own folder
                Expand-Archive -Path $nestedZip.FullName -DestinationPath $serviceFolderPath -Force
                
                # Delete the ZIP file after extraction (with retry for locked files)
                $retries = 3
                $deleted = $false
                for ($i = 1; $i -le $retries; $i++) {
                    try {
                        Remove-Item -Path $nestedZip.FullName -Force -ErrorAction Stop
                        Write-Host "Extracted and removed: $($nestedZip.Name)"
                        $deleted = $true
                        break
                    }
                    catch {
                        if ($i -lt $retries) {
                            Write-Host "Retry $i of $retries - ZIP file locked, waiting..."
                            Start-Sleep -Seconds 2
                        }
                        else {
                            Write-Host "Warning: Could not delete $($nestedZip.Name) (file locked), continuing..."
                        }
                    }
                }
            }
        }
        
        # Now move all service folders up to temp root
        Write-Host "`nMoving service folders to temp root..."
        $serviceFolders = Get-ChildItem -Path $folder.FullName -Directory
        
        foreach ($serviceFolder in $serviceFolders) {
            $destinationPath = Join-Path $tempPath $serviceFolder.Name
            
            # If destination exists, remove it first
            if (Test-Path $destinationPath) {
                Remove-Item -Path $destinationPath -Recurse -Force -ErrorAction SilentlyContinue
            }
            
            # Move the service folder to temp root
            Move-Item -Path $serviceFolder.FullName -Destination $destinationPath -Force
            Write-Host "Moved: $($serviceFolder.Name) to temp root"
        }
        
        # Delete the wrapper folder (like OneDrive_1_1-11-2026)
        Write-Host "Removing wrapper folder: $($folder.Name)"
        Remove-Item -Path $folder.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    Write-Host "`nDone"
}
catch {
    Write-Error "Failed to unzip files: $_"
    exit 1
}