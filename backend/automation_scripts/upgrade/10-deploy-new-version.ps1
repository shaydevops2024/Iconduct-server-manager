# Full path: backend/automation_scripts/upgrade/10-deploy-new-version.ps1

$ErrorActionPreference = "Stop"

$serverType = '{{SERVER_TYPE}}'

# Set paths based on server type
if ($serverType -eq 'backend') {
    $tempPath = "D:\Temp"
    $productionPath = "D:\IConduct"
} else {
    $tempPath = "C:\inetpub\wwwroot\Temp"
    $productionPath = "C:\inetpub\wwwroot"
}

try {
    $deployedCount = 0
    
    Write-Host "Deploying new version..."
    
    # Get all folders in temp
    $tempFolders = Get-ChildItem -Path $tempPath -Directory
    
    foreach ($tempFolder in $tempFolders) {
        $destPath = Join-Path $productionPath $tempFolder.Name
        
        # Move folder to production
        Move-Item -Path $tempFolder.FullName -Destination $destPath -Force
        Write-Host "Moved: $($tempFolder.Name) to $productionPath"
        $deployedCount++
    }
    
    Write-Host "`nDeployed $deployedCount folder(s) to $productionPath"
}
catch {
    Write-Error "Failed to deploy new version: $_"
    exit 1
}
