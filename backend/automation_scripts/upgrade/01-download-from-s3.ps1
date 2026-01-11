# Full path: backend/automation_scripts/upgrade/01-download-from-s3.ps1

$ErrorActionPreference = "Stop"

$serverType = '{{SERVER_TYPE}}'
$backendUrl = '{{BACKEND_URL}}'
$oldUIUrl = '{{OLD_UI_URL}}'
$newUIUrl = '{{NEW_UI_URL}}'
$apiMgmtUrl = '{{API_MGMT_URL}}'

# Set paths based on server type
if ($serverType -eq 'backend') {
    $downloadPath = "D:\IConduct-Upload"
} else {
    $downloadPath = "C:\inetpub\wwwroot\IConduct-Upload"
}

try {
    # Create download folder
    if (-not (Test-Path $downloadPath)) {
        New-Item -ItemType Directory -Path $downloadPath -Force | Out-Null
        Write-Host "Created download folder: $downloadPath"
    } else {
        # Clean existing files
        Remove-Item -Path "$downloadPath\*" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cleaned download folder: $downloadPath"
    }
    
    $downloadedCount = 0
    
    # Function to download with progress
    function Download-FileWithProgress {
        param($Url, $OutFile, $Name)
        
        Write-Host "Downloading $Name from S3..."
        
        # Use .NET WebClient for download
        $webClient = New-Object System.Net.WebClient
        
        # Download synchronously
        $webClient.DownloadFile($Url, $OutFile)
        
        $size = (Get-Item $OutFile).Length / 1MB
        Write-Host "Downloaded $Name ($([math]::Round($size, 2)) MB)"
    }
    
    # Download based on server type
    if ($serverType -eq 'backend') {
        # Backend server - only download backend.zip
        if ($backendUrl -and $backendUrl -ne '') {
            $backendPath = Join-Path $downloadPath "backend.zip"
            Download-FileWithProgress -Url $backendUrl -OutFile $backendPath -Name "backend.zip"
            $downloadedCount++
        }
    } else {
        # Frontend server - download UI files
        if ($oldUIUrl -and $oldUIUrl -ne '') {
            $oldUIPath = Join-Path $downloadPath "oldUI.zip"
            Download-FileWithProgress -Url $oldUIUrl -OutFile $oldUIPath -Name "oldUI.zip"
            $downloadedCount++
        }
        
        if ($newUIUrl -and $newUIUrl -ne '') {
            $newUIPath = Join-Path $downloadPath "newUI.zip"
            Download-FileWithProgress -Url $newUIUrl -OutFile $newUIPath -Name "newUI.zip"
            $downloadedCount++
        }
        
        if ($apiMgmtUrl -and $apiMgmtUrl -ne '') {
            $apiMgmtPath = Join-Path $downloadPath "apiManagement.zip"
            Download-FileWithProgress -Url $apiMgmtUrl -OutFile $apiMgmtPath -Name "apiManagement.zip"
            $downloadedCount++
        }
    }
    
    Write-Host "Downloaded $downloadedCount file(s) from S3 to $downloadPath"
}
catch {
    Write-Error "Failed to download files from S3: $_"
    exit 1
}
