# Full path: backend/automation_scripts/upgrade/03-unzip-files.ps1

$ErrorActionPreference = "Stop"

$serverType = '{{SERVER_TYPE}}'

# Set paths based on server type
if ($serverType -eq 'backend') {
    $downloadPath = "D:\IConduct-Upload"
    $tempPath = "D:\Temp"
} else {
    $downloadPath = "C:\inetpub\wwwroot\IConduct-Upload"
    $tempPath = "C:\inetpub\wwwroot\Temp"
}

try {
    $unzippedCount = 0
    
    # Unzip backend
    $backendZip = Join-Path $downloadPath "backend.zip"
    if (Test-Path $backendZip) {
        Write-Host "Unzipping backend..."
        Expand-Archive -Path $backendZip -DestinationPath $tempPath -Force
        $unzippedCount++
        Write-Host "Backend unzipped to $tempPath"
    }
    
    # Unzip Old UI
    $oldUIZip = Join-Path $downloadPath "oldUI.zip"
    if (Test-Path $oldUIZip) {
        Write-Host "Unzipping Old UI..."
        Expand-Archive -Path $oldUIZip -DestinationPath $tempPath -Force
        $unzippedCount++
        Write-Host "Old UI unzipped"
    }
    
    # Unzip New UI
    $newUIZip = Join-Path $downloadPath "newUI.zip"
    if (Test-Path $newUIZip) {
        Write-Host "Unzipping New UI..."
        Expand-Archive -Path $newUIZip -DestinationPath $tempPath -Force
        $unzippedCount++
        Write-Host "New UI unzipped"
    }
    
    # Unzip API Management
    $apiMgmtZip = Join-Path $downloadPath "apiManagement.zip"
    if (Test-Path $apiMgmtZip) {
        Write-Host "Unzipping API Management..."
        Expand-Archive -Path $apiMgmtZip -DestinationPath $tempPath -Force
        $unzippedCount++
        Write-Host "API Management unzipped"
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
                
                # Delete the ZIP file after extraction
                Remove-Item -Path $nestedZip.FullName -Force
                Write-Host "Extracted and removed: $($nestedZip.Name)"
            }
        }
        
        # Now move all service folders up to temp root
        Write-Host "`nMoving service folders to temp root..."
        $serviceFolders = Get-ChildItem -Path $folder.FullName -Directory
        
        foreach ($serviceFolder in $serviceFolders) {
            $destinationPath = Join-Path $tempPath $serviceFolder.Name
            
            # If destination exists, remove it first
            if (Test-Path $destinationPath) {
                Remove-Item -Path $destinationPath -Recurse -Force
            }
            
            # Move the service folder to temp root
            Move-Item -Path $serviceFolder.FullName -Destination $destinationPath -Force
            Write-Host "Moved: $($serviceFolder.Name) to temp root"
        }
        
        # Delete the wrapper folder (like OneDrive_1_1-11-2026)
        Write-Host "Removing wrapper folder: $($folder.Name)"
        Remove-Item -Path $folder.FullName -Recurse -Force
    }
    
    Write-Host "`nUnzipped and processed $unzippedCount main file(s)"
    
    # Show final structure
    Write-Host "`nFinal folder structure in $tempPath :"
    Get-ChildItem -Path $tempPath -Directory | ForEach-Object {
        Write-Host "  - $($_.Name)"
    }
}
catch {
    Write-Error "Failed to unzip files: $_"
    exit 1
}
