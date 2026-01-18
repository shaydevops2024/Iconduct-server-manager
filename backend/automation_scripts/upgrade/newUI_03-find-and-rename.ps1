# Full path: backend/automation_scripts/upgrade/newUI_03-find-and-rename.ps1

$ErrorActionPreference = "Stop"

try {
    Write-Host "Starting New UI find and rename phase 3"

    $wwwrootPath = "C:\inetpub\wwwroot"
    $tempPath = "C:\temp-new-ui"

    # Find the New UI folder in wwwroot (should be something like IConductUI_NEW or IConductUINew)
    Write-Host "Searching for New UI folder in $wwwrootPath..."
    
    $newUIFolders = Get-ChildItem -Path $wwwrootPath -Directory | Where-Object { 
        $_.Name -match 'IConductUI.*New' -or $_.Name -match 'IConductUI_NEW' -or $_.Name -eq 'IConductUINew'
    }

    if ($newUIFolders.Count -eq 0) {
        throw "No New UI folder found in $wwwrootPath. Expected folder name containing 'IConductUI' and 'New'"
    }

    if ($newUIFolders.Count -gt 1) {
        Write-Host "Warning: Multiple New UI folders found:"
        foreach ($folder in $newUIFolders) {
            Write-Host "  - $($folder.Name)"
        }
        # Take the first one
        $targetFolderName = $newUIFolders[0].Name
        Write-Host "Using first match: $targetFolderName"
    } else {
        $targetFolderName = $newUIFolders[0].Name
    }

    Write-Host "Found New UI folder: $targetFolderName"

    # Find what was extracted (excluding the zip file if it still exists)
    $extractedItems = Get-ChildItem -Path $tempPath -Directory
    
    if ($extractedItems.Count -eq 0) {
        throw "No folders found in $tempPath after extraction"
    }

    # If there's only one folder, rename it to the target name
    if ($extractedItems.Count -eq 1) {
        $extractedFolder = $extractedItems[0]
        
        if ($extractedFolder.Name -ne $targetFolderName) {
            $oldPath = $extractedFolder.FullName
            $newPath = Join-Path $tempPath $targetFolderName
            
            Write-Host "Renaming folder:"
            Write-Host "  From: $($extractedFolder.Name)"
            Write-Host "  To: $targetFolderName"
            
            Rename-Item -Path $oldPath -NewName $targetFolderName -Force
            Write-Host "Folder renamed successfully"
        } else {
            Write-Host "Folder already has the correct name: $targetFolderName"
        }
    } else {
        # Multiple folders - look for one that matches
        Write-Host "Multiple folders found in temp directory:"
        foreach ($item in $extractedItems) {
            Write-Host "  - $($item.Name)"
        }
        
        # Try to find a match
        $matchingFolder = $extractedItems | Where-Object { $_.Name -eq $targetFolderName }
        
        if (-not $matchingFolder) {
            # No exact match, rename the first folder
            $folderToRename = $extractedItems[0]
            $oldPath = $folderToRename.FullName
            $newPath = Join-Path $tempPath $targetFolderName
            
            Write-Host "Renaming first folder to target name:"
            Write-Host "  From: $($folderToRename.Name)"
            Write-Host "  To: $targetFolderName"
            
            Rename-Item -Path $oldPath -NewName $targetFolderName -Force
            Write-Host "Folder renamed successfully"
        } else {
            Write-Host "Found matching folder: $targetFolderName"
        }
    }

    # Verify final result
    $finalFolder = Join-Path $tempPath $targetFolderName
    if (Test-Path $finalFolder) {
        Write-Host "Verified: New UI folder ready at $finalFolder"
    } else {
        throw "Failed to create New UI folder at $finalFolder"
    }

    Write-Host "New UI find and rename phase completed successfully"
}
catch {
    Write-Error "Failed to find and rename New UI folder: $_"
    exit 1
}