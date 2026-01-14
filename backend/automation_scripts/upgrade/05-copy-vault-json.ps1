# Full path: backend/automation_scripts/upgrade/05-copy-vault-json.ps1

$ErrorActionPreference = "Stop"

# This script only runs on backend servers
$tempPath = "D:\Temp"
$iconductPath = "D:\IConduct"

try {
    $copiedCount = 0
    
    Write-Host "Copying vault.json files..."
    
    # Get all folders in temp
    $tempFolders = Get-ChildItem -Path $tempPath -Directory
    
    foreach ($tempFolder in $tempFolders) {
        # Skip Cloud.Agent and Scheduler folders (they use .config files)
        if ($tempFolder.Name -match "Cloud\.?Agent|Scheduler" -and $tempFolder.Name -notmatch "storage") {
            Write-Host "Skipping $($tempFolder.Name) - uses .config files"
            continue
        }
        
        # Look for matching folder in D:\IConduct (this is the SOURCE)
        $sourcePath = Join-Path $iconductPath $tempFolder.Name
        
        if (Test-Path $sourcePath) {
            $vaultJsonSource = Join-Path $sourcePath "vault.json"
            
            if (Test-Path $vaultJsonSource) {
                # Copy TO the temp folder (DESTINATION)
                $vaultJsonDest = Join-Path $tempFolder.FullName "vault.json"
                Copy-Item -Path $vaultJsonSource -Destination $vaultJsonDest -Force
                Write-Host "Copied vault.json to: $($tempFolder.Name)"
                $copiedCount++
            } else {
                Write-Host "No vault.json found in source: $($tempFolder.Name)"
            }
        } else {
            Write-Host "No existing folder found for: $($tempFolder.Name) (new installation)"
        }
    }
    
    Write-Host "Copied $copiedCount vault.json file(s)"
}
catch {
    Write-Error "Failed to copy vault.json files: $_"
    exit 1
}
