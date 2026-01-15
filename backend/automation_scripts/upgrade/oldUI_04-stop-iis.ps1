# Full path: backend/automation_scripts/upgrade/oldUI_04-stop-iis.ps1

$ErrorActionPreference = "Stop"

try {
    Write-Host "---- Starting IIS Stop Phase ----"

    # Import WebAdministration module
    Import-Module WebAdministration

    # Define site and app pool names
    $siteName = "IConductUI"
    $appPoolName = "IConductUI"

    # Step 1: Stop the website
    Write-Host "Step 1: Stopping website '$siteName'..."
    $site = Get-Website | Where-Object { $_.Name -eq $siteName }

    if ($site) {
        if ($site.State -ne "Stopped") {
            Stop-Website -Name $siteName
            Write-Host "Website '$siteName' has been stopped"
        } else {
            Write-Host "Website '$siteName' is already stopped"
        }
    } else {
        Write-Warning "Website '$siteName' was not found in IIS"
    }

    # Step 2: Stop the application pool
    Write-Host "Step 2: Stopping application pool '$appPoolName'..."
    $appPool = Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -eq $appPoolName }

    if ($appPool) {
        if ($appPool.State -ne "Stopped") {
            Stop-WebAppPool -Name $appPoolName
            Write-Host "Application pool '$appPoolName' has been stopped"
        } else {
            Write-Host "Application pool '$appPoolName' is already stopped"
        }
    } else {
        Write-Warning "Application pool '$appPoolName' was not found"
    }

    # Step 3: Wait for 10 seconds
    Write-Host "Waiting 10 seconds for IIS to fully stop..."
    Start-Sleep -Seconds 10

    Write-Host "---- IIS Stop Phase Completed Successfully ----"
}
catch {
    Write-Error "Failed to stop IIS: $_"
    exit 1
}
