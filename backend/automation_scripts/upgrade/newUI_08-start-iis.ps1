# Full path: backend/automation_scripts/upgrade/newUI_08-start-iis.ps1

$ErrorActionPreference = "Stop"

try {
    Write-Host "Starting New UI start IIS phase 8"

    # Import IIS module
    Import-Module WebAdministration -ErrorAction SilentlyContinue

    $wwwrootPath = "C:\inetpub\wwwroot"

    # Find the New UI folder
    $newUIFolders = Get-ChildItem -Path $wwwrootPath -Directory | Where-Object { 
        $_.Name -match 'IConductUI.*New' -or $_.Name -match 'IConductUI_NEW' -or $_.Name -eq 'IConductUINew'
    }

    if ($newUIFolders.Count -eq 0) {
        throw "No New UI folder found in $wwwrootPath after deployment"
    }

    $targetFolderName = $newUIFolders[0].Name
    $folderPath = Join-Path $wwwrootPath $targetFolderName

    Write-Host "New UI folder: $folderPath"

    # Set folder permissions for IIS
    Write-Host "Setting folder permissions..."
    
    $sourceFolderPath = "C:\inetpub"
    $userName = "IIS_IUSRS"

    # Function to set folder permissions
    function Set-FolderPermission {
        param (
            [string]$folderPath,
            [string]$userName,
            [System.Security.AccessControl.FileSystemRights]$permissions
        )

        $acl = Get-Acl $folderPath
        $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            $userName,
            $permissions,
            "ContainerInherit,ObjectInherit",
            "None",
            "Allow"
        )
        $acl.SetAccessRule($accessRule)
        Set-Acl $folderPath $acl
    }

    # Get the ACL from the source folder
    $sourceAcl = Get-Acl -Path $sourceFolderPath

    # Apply permissions to wwwroot and subfolders
    try {
        Set-Acl -Path $wwwrootPath -AclObject $sourceAcl
        
        $subfolders = Get-ChildItem -Path $wwwrootPath -Directory -Recurse -ErrorAction SilentlyContinue
        foreach ($subfolder in $subfolders) {
            try {
                Set-Acl -Path $subfolder.FullName -AclObject $sourceAcl
            }
            catch {
                Write-Host "Warning: Could not set ACL for $($subfolder.FullName)"
            }
        }
        
        Write-Host "Base permissions applied to wwwroot"
    }
    catch {
        Write-Host "Warning: Error applying base permissions - $_"
    }

    # Set additional permissions for IIS_IUSRS on the New UI folder
    if (Test-Path $folderPath) {
        try {
            $permissions = [System.Security.AccessControl.FileSystemRights]"Modify, ListDirectory"
            Set-FolderPermission -folderPath $folderPath -userName $userName -permissions $permissions
            Write-Host "Additional permissions set for '$userName' on New UI folder"
        }
        catch {
            Write-Host "Warning: Could not set additional permissions - $_"
        }
    }

    # Find and start the website
    $possibleSiteNames = @("IConductUINew", "IConductUI_NEW", "IConduct UI New")
    $siteName = $null

    foreach ($name in $possibleSiteNames) {
        $site = Get-Website | Where-Object { $_.Name -eq $name }
        if ($site) {
            $siteName = $name
            break
        }
    }

    if (-not $siteName) {
        $site = Get-Website | Where-Object { $_.Name -match 'IConductUI.*New' }
        if ($site) {
            $siteName = $site.Name
        }
    }

    # Find and start the application pool
    $possibleAppPoolNames = @("IConductUINew", "IConductUI_NEW", "IConduct UI New")
    $appPoolName = $null

    foreach ($name in $possibleAppPoolNames) {
        $appPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -eq $name }
        if ($appPool) {
            $appPoolName = $name
            break
        }
    }

    if (-not $appPoolName) {
        $appPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -match 'IConductUI.*New' }
        if ($appPool) {
            $appPoolName = $appPool.Name
        }
    }

    # Start the application pool first
    if ($appPoolName) {
        $appPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -eq $appPoolName }
        if ($appPool.State -ne "Started") {
            Write-Host "Starting application pool '$appPoolName'..."
            Start-WebAppPool -Name $appPoolName
            
            # Wait for app pool to start
            $timeout = 30
            $elapsed = 0
            while ($elapsed -lt $timeout) {
                $appPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -eq $appPoolName }
                if ($appPool.State -eq "Started") {
                    break
                }
                Start-Sleep -Seconds 2
                $elapsed += 2
            }
            
            if ($appPool.State -eq "Started") {
                Write-Host "Application pool '$appPoolName' started successfully"
            } else {
                Write-Host "Warning: Application pool '$appPoolName' did not start within $timeout seconds"
            }
        } else {
            Write-Host "Application pool '$appPoolName' is already running"
        }
    } else {
        Write-Host "Warning: New UI application pool not found"
    }

    # Start the website
    if ($siteName) {
        $site = Get-Website -Name $siteName
        if ($site.State -ne "Started") {
            Write-Host "Starting website '$siteName'..."
            Start-Website -Name $siteName
            
            # Wait for website to start
            $timeout = 30
            $elapsed = 0
            while ($elapsed -lt $timeout) {
                $site = Get-Website -Name $siteName
                if ($site.State -eq "Started") {
                    break
                }
                Start-Sleep -Seconds 2
                $elapsed += 2
            }
            
            if ($site.State -eq "Started") {
                Write-Host "Website '$siteName' started successfully"
            } else {
                Write-Host "Warning: Website '$siteName' did not start within $timeout seconds"
            }
        } else {
            Write-Host "Website '$siteName' is already running"
        }
    } else {
        Write-Host "Warning: New UI website not found"
    }

    # Wait before IIS reset
    Write-Host "Waiting 5 seconds before IIS reset..."
    Start-Sleep -Seconds 5

    # Perform IIS reset to ensure everything is properly initialized
    Write-Host "Performing IIS reset..."
    try {
        Start-Process -FilePath "iisreset.exe" -Wait -NoNewWindow
        Write-Host "IIS reset completed successfully"
    }
    catch {
        Write-Host "Warning: IIS reset may have failed - $_"
    }

    Write-Host "New UI start IIS phase completed successfully"
}
catch {
    Write-Error "Failed to start New UI IIS: $_"
    exit 1
}