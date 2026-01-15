# Full path: backend/automation_scripts/upgrade/oldUI_07-start-iis.ps1

$ErrorActionPreference = "Stop"

try {
    Write-Host "---- Starting IIS Permissions & Start Phase ----"

    # Import WebAdministration module
    Import-Module WebAdministration

    # Define paths and names
    $siteName = "IConductUI"
    $appPoolName = "IConductUI"
    $folderPath = "C:\inetpub\wwwroot\IConductUI"
    $userName = "IIS_IUSRS"
    $sourceFolderPath = "C:\inetpub"
    $wwwrootPath = "C:\inetpub\wwwroot"

    # Function to set folder permissions
    function Set-FolderPermission {
        param (
            [string]$folderPath,
            [string]$userName,
            [System.Security.AccessControl.FileSystemRights]$permissions
        )

        # Get the ACL of the folder
        $acl = Get-Acl $folderPath

        # Define the rule with inheritance for subfolders and files
        $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            $userName,
            $permissions,
            "ContainerInherit,ObjectInherit",
            "None",
            "Allow"
        )

        # Add the rule to the ACL
        $acl.SetAccessRule($accessRule)

        # Set the new ACL to the folder
        Set-Acl $folderPath $acl
    }

    # Step 1: Apply permissions from source to wwwroot
    Write-Host "Step 1: Applying ACL permissions from $sourceFolderPath to $wwwrootPath..."
    
    $sourceAcl = Get-Acl -Path $sourceFolderPath

    try {
        # Apply the ACL to the wwwroot directory
        Set-Acl -Path $wwwrootPath -AclObject $sourceAcl
        Write-Host "Applied ACL to wwwroot"

        # Get all subfolders under wwwroot and apply the ACL
        $subfolders = Get-ChildItem -Path $wwwrootPath -Directory -Recurse
        foreach ($subfolder in $subfolders) {
            Set-Acl -Path $subfolder.FullName -AclObject $sourceAcl
        }

        Write-Host "Permissions applied to all subfolders in wwwroot"
    }
    catch {
        Write-Warning "Error applying permissions: $_"
    }

    # Step 2: Set additional permissions for IIS_IUSRS on IConductUI folder
    Write-Host "Step 2: Setting additional permissions for $userName on $folderPath..."
    
    if (Test-Path $folderPath) {
        try {
            $permissions = [System.Security.AccessControl.FileSystemRights]"Modify, ListDirectory"
            Set-FolderPermission -folderPath $folderPath -userName $userName -permissions $permissions
            Write-Host "Set Modify and ListDirectory permissions for $userName"
        }
        catch {
            Write-Warning "Error setting additional permissions: $_"
        }
    } else {
        Write-Warning "Folder '$folderPath' not found"
    }

    # Step 3: Start the application pool
    Write-Host "Step 3: Starting application pool '$appPoolName'..."
    $appPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -eq $appPoolName }

    if ($appPool) {
        if ($appPool.State -ne "Started") {
            Start-WebAppPool -Name $appPoolName
            Write-Host "Application pool '$appPoolName' has been started"
        } else {
            Write-Host "Application pool '$appPoolName' is already running"
        }
    } else {
        Write-Warning "Application pool '$appPoolName' was not found"
    }

    # Step 4: Start the website
    Write-Host "Step 4: Starting website '$siteName'..."
    $site = Get-Website | Where-Object { $_.Name -eq $siteName }

    if ($site) {
        if ($site.State -ne "Started") {
            Start-Website -Name $siteName
            Write-Host "Website '$siteName' has been started"
        } else {
            Write-Host "Website '$siteName' is already running"
        }
    } else {
        Write-Warning "Website '$siteName' was not found in IIS"
    }

    Write-Host "---- IIS Permissions & Start Phase Completed Successfully ----"
}
catch {
    Write-Error "Failed to set permissions and start IIS: $_"
    exit 1
}
