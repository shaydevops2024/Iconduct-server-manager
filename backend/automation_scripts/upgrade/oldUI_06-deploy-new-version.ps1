# Full path: backend/automation_scripts/upgrade/oldUI_06-deploy-new-version.ps1

$ErrorActionPreference = "Stop"

# Define paths
$tempPath = "C:\inetpub\wwwroot\temp"
$wwwrootPath = "C:\inetpub\wwwroot"
$sourceUIPath = Join-Path $tempPath "IConductUI"
$targetUIPath = Join-Path $wwwrootPath "IConductUI"

try {
    Write-Host "---- Starting Deploy New Version Phase ----"

    # Verify source exists
    if (-not (Test-Path $sourceUIPath)) {
        throw "Source IConductUI not found at $sourceUIPath"
    }

    Write-Host "Moving new IConductUI from temp to wwwroot..."
    Move-Item -Path $sourceUIPath -Destination $targetUIPath -Force
    Write-Host "Successfully deployed new IConductUI to $targetUIPath"

    Write-Host "---- Deploy New Version Phase Completed Successfully ----"
}
catch {
    Write-Error "Failed to deploy new version: $_"
    exit 1
}
