# Full path: backend/automation_scripts/upgrade/oldUI_07-start-iis.ps1

$ErrorActionPreference = "Stop"

try {
    Write-Host "---- Starting IIS Permissions and Start Phase ----"

    # Import WebAdministration module
    Import-Module WebAdministration

    # Define paths and names
    $siteName = "IConductUI"
    $appPoolName = "IConductUI"
    $folderPath = "C:\inetpub\wwwroot\IConductUI"
    $userName = "IIS_IUSRS"
    $sourceFolderPath = "C:\inetpub"
    $wwwrootPath = "C:\inetpub\wwwroot"

    $maxRetries = 3
    $retryDelay = 5

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
    Write-Host "Step 1 - Applying ACL permissions from $sourceFolderPath to $wwwrootPath..."
    
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
        Write-Warning "Error applying permissions"
    }

    # Step 2: Set additional permissions for IIS_IUSRS on IConductUI folder
    Write-Host "Step 2 - Setting additional permissions for $userName on $folderPath..."
    
    if (Test-Path $folderPath) {
        try {
            $permissions = [System.Security.AccessControl.FileSystemRights]"Modify, ListDirectory"
            Set-FolderPermission -folderPath $folderPath -userName $userName -permissions $permissions
            Write-Host "Set Modify and ListDirectory permissions for $userName"
        }
        catch {
            Write-Warning "Error setting additional permissions"
        }
    } else {
        Write-Warning "Folder not found - $folderPath"
    }

    # Function to start app pool with retry
    function Start-AppPoolWithRetry {
        param([string]$appPoolName)
        
        for ($i = 1; $i -le $script:maxRetries; $i++) {
            try {
                Write-Host "Attempt $i of $script:maxRetries - Starting application pool $appPoolName"
                
                $appPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -eq $appPoolName }
                if ($appPool) {
                    if ($appPool.State -ne "Started") {
                        Start-WebAppPool -Name $appPoolName
                        Start-Sleep -Seconds 3
                        
                        # Verify it started
                        $appPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -eq $appPoolName }
                        if ($appPool.State -eq "Started") {
                            Write-Host "Application pool $appPoolName started successfully on attempt $i"
                            return $true
                        } else {
                            throw "App pool did not start properly"
                        }
                    } else {
                        Write-Host "Application pool $appPoolName is already running"
                        return $true
                    }
                } else {
                    throw "Application pool $appPoolName was not found"
                }
            }
            catch {
                Write-Host "Attempt $i failed"
                if ($i -lt $script:maxRetries) {
                    Write-Host "Waiting $script:retryDelay seconds before retry..."
                    Start-Sleep -Seconds $script:retryDelay
                } else {
                    throw "Failed to start app pool after $script:maxRetries attempts"
                }
            }
        }
    }

    # Function to start website with retry
    function Start-WebsiteWithRetry {
        param([string]$siteName)
        
        for ($i = 1; $i -le $script:maxRetries; $i++) {
            try {
                Write-Host "Attempt $i of $script:maxRetries - Starting website $siteName"
                
                $site = Get-Website | Where-Object { $_.Name -eq $siteName }
                if ($site) {
                    if ($site.State -ne "Started") {
                        Start-Website -Name $siteName
                        Start-Sleep -Seconds 3
                        
                        # Verify it started
                        $site = Get-Website | Where-Object { $_.Name -eq $siteName }
                        if ($site.State -eq "Started") {
                            Write-Host "Website $siteName started successfully on attempt $i"
                            return $true
                        } else {
                            throw "Website did not start properly"
                        }
                    } else {
                        Write-Host "Website $siteName is already running"
                        return $true
                    }
                } else {
                    throw "Website $siteName was not found in IIS"
                }
            }
            catch {
                Write-Host "Attempt $i failed"
                if ($i -lt $script:maxRetries) {
                    Write-Host "Waiting $script:retryDelay seconds before retry..."
                    Start-Sleep -Seconds $script:retryDelay
                } else {
                    throw "Failed to start website after $script:maxRetries attempts"
                }
            }
        }
    }

    # Step 3: Start the application pool with retry
    Write-Host "Step 3 - Starting application pool $appPoolName..."
    Start-AppPoolWithRetry -appPoolName $appPoolName

    # Step 4: Start the website with retry
    Write-Host "Step 4 - Starting website $siteName..."
    Start-WebsiteWithRetry -siteName $siteName

    # Final verification
    Write-Host ""
    Write-Host "Performing final health check..."
    $finalAppPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -eq $appPoolName }
    $finalSite = Get-Website | Where-Object { $_.Name -eq $siteName }
    
    $appPoolState = $finalAppPool.State
    $siteState = $finalSite.State
    
    Write-Host "App Pool $appPoolName State - $appPoolState"
    Write-Host "Website $siteName State - $siteState"

    if ($appPoolState -eq "Started" -and $siteState -eq "Started") {
        Write-Host ""
        Write-Host "IIS started successfully and is healthy"
    } else {
        throw "IIS health check failed"
    }

    Write-Host "---- IIS Permissions and Start Phase Completed Successfully ----"
}
catch {
    $errMsg = $_.Exception.Message
    Write-Host ""
    Write-Host "ERROR - Failed to set permissions and start IIS"
    Write-Host "ERROR - $errMsg"
    exit 1
}