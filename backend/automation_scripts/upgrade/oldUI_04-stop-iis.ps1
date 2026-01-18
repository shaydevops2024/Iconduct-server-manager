# Full path: backend/automation_scripts/upgrade/oldUI_04-stop-iis.ps1

$ErrorActionPreference = "Stop"

try {
    Write-Host "---- Stopping IIS Phase ----"

    # Import WebAdministration module
    Import-Module WebAdministration

    # Define paths and names
    $siteName = "IConductUI"
    $appPoolName = "IConductUI"

    $maxRetries = 3
    $retryDelay = 5

    # Function to stop website with retry
    function Stop-WebsiteWithRetry {
        param([string]$siteName)
        
        for ($i = 1; $i -le $script:maxRetries; $i++) {
            try {
                Write-Host "Attempt $i of $script:maxRetries - Stopping website $siteName"
                
                $site = Get-Website | Where-Object { $_.Name -eq $siteName }
                if ($site) {
                    if ($site.State -ne "Stopped") {
                        Stop-Website -Name $siteName
                        Start-Sleep -Seconds 2
                        
                        # Verify it stopped
                        $site = Get-Website | Where-Object { $_.Name -eq $siteName }
                        if ($site.State -eq "Stopped") {
                            Write-Host "Website $siteName stopped successfully on attempt $i"
                            return $true
                        } else {
                            throw "Website did not stop properly"
                        }
                    } else {
                        Write-Host "Website $siteName is already stopped"
                        return $true
                    }
                } else {
                    Write-Warning "Website $siteName was not found in IIS"
                    return $true
                }
            }
            catch {
                Write-Host "Attempt $i failed"
                if ($i -lt $script:maxRetries) {
                    Write-Host "Waiting $script:retryDelay seconds before retry..."
                    Start-Sleep -Seconds $script:retryDelay
                } else {
                    throw "Failed to stop website after $script:maxRetries attempts"
                }
            }
        }
    }

    # Function to stop app pool with retry
    function Stop-AppPoolWithRetry {
        param([string]$appPoolName)
        
        for ($i = 1; $i -le $script:maxRetries; $i++) {
            try {
                Write-Host "Attempt $i of $script:maxRetries - Stopping application pool $appPoolName"
                
                $appPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -eq $appPoolName }
                if ($appPool) {
                    if ($appPool.State -ne "Stopped") {
                        Stop-WebAppPool -Name $appPoolName
                        Start-Sleep -Seconds 2
                        
                        # Verify it stopped
                        $appPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -eq $appPoolName }
                        if ($appPool.State -eq "Stopped") {
                            Write-Host "Application pool $appPoolName stopped successfully on attempt $i"
                            return $true
                        } else {
                            throw "App pool did not stop properly"
                        }
                    } else {
                        Write-Host "Application pool $appPoolName is already stopped"
                        return $true
                    }
                } else {
                    Write-Warning "Application pool $appPoolName was not found"
                    return $true
                }
            }
            catch {
                Write-Host "Attempt $i failed"
                if ($i -lt $script:maxRetries) {
                    Write-Host "Waiting $script:retryDelay seconds before retry..."
                    Start-Sleep -Seconds $script:retryDelay
                } else {
                    throw "Failed to stop app pool after $script:maxRetries attempts"
                }
            }
        }
    }

    # Step 1: Stop the website
    Write-Host "Step 1 - Stopping website $siteName..."
    Stop-WebsiteWithRetry -siteName $siteName

    # Step 2: Stop the application pool
    Write-Host "Step 2 - Stopping application pool $appPoolName..."
    Stop-AppPoolWithRetry -appPoolName $appPoolName

    Write-Host "---- IIS Stop Phase Completed Successfully ----"
}
catch {
    $errMsg = $_.Exception.Message
    Write-Host ""
    Write-Host "ERROR - Failed to stop IIS"
    Write-Host "ERROR - $errMsg"
    exit 1
}