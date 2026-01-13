# Full path: backend/automation_scripts/upgrade/02-create-temp-folder.ps1

$ErrorActionPreference = "Stop"

$serverType = '{{SERVER_TYPE}}'

# Set paths based on server type
if ($serverType -eq 'backend') {
    $tempPath = "D:\Temp"
} else {
    $tempPath = "C:\inetpub\wwwroot\Temp"
}

try {
    Write-Host "Cleaning temp folder: $tempPath"
    
    # Kill any PowerShell processes that might be holding temp files
    Get-Process -Name "powershell" -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and $_.Path -like "*Temp*"
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    
    Start-Sleep -Seconds 1
    
    # Remove temp folder if exists (aggressive cleanup)
    if (Test-Path $tempPath) {
        Write-Host "Removing existing temp folder..."
        
        # Try normal removal first
        try {
            Remove-Item -Path $tempPath -Recurse -Force -ErrorAction Stop
            Write-Host "Removed existing temp folder (normal method)"
        }
        catch {
            Write-Host "Normal removal failed, trying aggressive cleanup..."
            
            # Method 2: Use robocopy to empty the folder (works with locked files)
            $emptyDir = Join-Path $env:TEMP "empty_$(Get-Random)"
            New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null
            
            # Robocopy with /MIR (mirror) to empty folder = delete everything
            robocopy $emptyDir $tempPath /MIR /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
            Remove-Item -Path $emptyDir -Force
            
            # Now try to remove the folder again
            try {
                Remove-Item -Path $tempPath -Recurse -Force -ErrorAction Stop
                Write-Host "Removed temp folder (aggressive method)"
            }
            catch {
                # If still fails, just empty it and recreate
                Write-Host "Could not remove folder, emptying contents..."
                Get-ChildItem -Path $tempPath -Recurse -Force -ErrorAction SilentlyContinue | 
                    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
    
    # Create fresh temp folder
    New-Item -ItemType Directory -Path $tempPath -Force | Out-Null
    Write-Host "Created temp folder: $tempPath"
    
    Write-Host $tempPath
}
catch {
    Write-Error "Failed to create temp folder: $_"
    exit 1
}