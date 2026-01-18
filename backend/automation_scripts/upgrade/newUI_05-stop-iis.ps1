# Full path: backend/automation_scripts/upgrade/newUI_05-stop-iis.ps1

$ErrorActionPreference = "Stop"

try {
    Write-Host "Starting New UI stop IIS phase 5"

    # Import IIS module
    Import-Module WebAdministration -ErrorAction SilentlyContinue

    # Find the New UI website and app pool
    # Common names: IConductUINew, IConductUI_NEW, etc.
    $possibleSiteNames = @("IConductUINew", "IConductUI_NEW", "IConduct UI New")
    $possibleAppPoolNames = @("IConductUINew", "IConductUI_NEW", "IConduct UI New")

    $siteName = $null
    $appPoolName = $null

    # Find the website
    Write-Host "Searching for New UI website..."
    foreach ($name in $possibleSiteNames) {
        $site = Get-Website | Where-Object { $_.Name -eq $name }
        if ($site) {
            $siteName = $name
            Write-Host "Found website: $siteName"
            break
        }
    }

    # If not found by exact match, try pattern matching
    if (-not $siteName) {
        $site = Get-Website | Where-Object { $_.Name -match 'IConductUI.*New' }
        if ($site) {
            $siteName = $site.Name
            Write-Host "Found website by pattern: $siteName"
        }
    }

    # Find the application pool
    Write-Host "Searching for New UI application pool..."
    foreach ($name in $possibleAppPoolNames) {
        $appPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -eq $name }
        if ($appPool) {
            $appPoolName = $name
            Write-Host "Found application pool: $appPoolName"
            break
        }
    }

    # If not found by exact match, try pattern matching
    if (-not $appPoolName) {
        $appPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -match 'IConductUI.*New' }
        if ($appPool) {
            $appPoolName = $appPool.Name
            Write-Host "Found application pool by pattern: $appPoolName"
        }
    }

    # Stop the website
    if ($siteName) {
        $site = Get-Website -Name $siteName
        if ($site.State -ne "Stopped") {
            Write-Host "Stopping website '$siteName'..."
            Stop-Website -Name $siteName
            
            # Wait for website to stop
            $timeout = 30
            $elapsed = 0
            while ($elapsed -lt $timeout) {
                $site = Get-Website -Name $siteName
                if ($site.State -eq "Stopped") {
                    break
                }
                Start-Sleep -Seconds 2
                $elapsed += 2
            }
            
            if ($site.State -eq "Stopped") {
                Write-Host "Website '$siteName' stopped successfully"
            } else {
                Write-Host "Warning: Website '$siteName' did not stop within $timeout seconds"
            }
        } else {
            Write-Host "Website '$siteName' is already stopped"
        }
    } else {
        Write-Host "Warning: New UI website not found - skipping website stop"
    }

    # Stop the application pool
    if ($appPoolName) {
        $appPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -eq $appPoolName }
        if ($appPool.State -ne "Stopped") {
            Write-Host "Stopping application pool '$appPoolName'..."
            Stop-WebAppPool -Name $appPoolName
            
            # Wait for app pool to stop
            $timeout = 30
            $elapsed = 0
            while ($elapsed -lt $timeout) {
                $appPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -eq $appPoolName }
                if ($appPool.State -eq "Stopped") {
                    break
                }
                Start-Sleep -Seconds 2
                $elapsed += 2
            }
            
            if ($appPool.State -eq "Stopped") {
                Write-Host "Application pool '$appPoolName' stopped successfully"
            } else {
                Write-Host "Warning: Application pool '$appPoolName' did not stop within $timeout seconds"
            }
        } else {
            Write-Host "Application pool '$appPoolName' is already stopped"
        }
    } else {
        Write-Host "Warning: New UI application pool not found - skipping app pool stop"
    }

    # Wait for resources to be released
    Write-Host "Waiting 10 seconds for resources to be released..."
    Start-Sleep -Seconds 10

    Write-Host "New UI stop IIS phase completed successfully"
}
catch {
    Write-Error "Failed to stop New UI IIS: $_"
    exit 1
}