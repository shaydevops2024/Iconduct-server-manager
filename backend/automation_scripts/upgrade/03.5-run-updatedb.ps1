# Full path: backend/automation_scripts/upgrade/03.5-run-updatedb.ps1

$ErrorActionPreference = "Stop"

$serverType = '{{SERVER_TYPE}}'

# Set paths based on server type
if ($serverType -eq 'backend') {
    $tempPath = "D:\Temp"
} else {
    # This script only runs on backend
    Write-Host "Skipping UpdateDB - frontend server"
    exit 0
}

try {
    $updateDBPath = Join-Path $tempPath "UpdateDB"
    $updateDBExe = Join-Path $updateDBPath "UpdateDB.exe"
    
    Write-Host "Checking for UpdateDB folder..."
    
    # Check if UpdateDB folder exists
    if (-not (Test-Path $updateDBPath)) {
        Write-Host "UpdateDB folder not found - skipping database update"
        Write-Host "No database update required"
        exit 0
    }
    
    Write-Host "Found UpdateDB folder: $updateDBPath"
    
    # Check if UpdateDB.exe exists
    if (-not (Test-Path $updateDBExe)) {
        Write-Error "UpdateDB.exe not found at: $updateDBExe"
        exit 1
    }
    
    Write-Host "Found UpdateDB.exe at: $updateDBExe"
    Write-Host "`nRunning UpdateDB.exe as administrator..."
    
    # Run UpdateDB.exe and wait for completion
    $process = Start-Process -FilePath $updateDBExe `
                            -WorkingDirectory $updateDBPath `
                            -Verb RunAs `
                            -PassThru `
                            -Wait
    
    Write-Host "UpdateDB.exe started (PID: $($process.Id))"
    Write-Host "Waiting for UpdateDB.exe to complete..."
    
    # Process already waited due to -Wait, check exit code
    $exitCode = $process.ExitCode
    
    if ($exitCode -eq 0) {
        Write-Host "UpdateDB.exe completed successfully (exit code: 0)"
        Write-Host "Database update completed"
    } else {
        Write-Error "UpdateDB.exe failed with exit code: $exitCode"
        exit 1
    }
}
catch {
    Write-Error "Failed to run UpdateDB: $_"
    exit 1
}
