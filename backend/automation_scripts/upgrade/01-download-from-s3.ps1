# Full path: backend/automation_scripts/upgrade/01-download-from-s3.ps1

$ErrorActionPreference = "Stop"

# Template variable (injected at runtime)
$backendUrl = '{{BACKEND_URL}}'

# Backend-only download path
$downloadPath = "D:\IConduct-Upload"

try {

    Write-Host "Starting backend artifact download phase 1"

    # Ensure download folder exists
    if (-not (Test-Path $downloadPath)) {
        New-Item -ItemType Directory -Path $downloadPath -Force | Out-Null
        Write-Host "Created download folder: $downloadPath"
    } else {
        Remove-Item -Path "$downloadPath\*" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cleaned download folder: $downloadPath"
    }

    # Validate BACKEND_URL
    if (-not $backendUrl -or $backendUrl -eq '') {
        throw "BACKEND_URL is empty or not defined"
    }

    if ($backendUrl -notmatch '^https?://') {
        throw "BACKEND_URL must be a full http(s) URL. Actual value: $backendUrl"
    }

    Write-Host "Downloading backend artifact from S3:"
    Write-Host $backendUrl

    $destination = Join-Path $downloadPath "backend.zip"

    # Download from S3
    $webClient = New-Object System.Net.WebClient
    $webClient.DownloadFile($backendUrl, $destination)

    $sizeMB = (Get-Item $destination).Length / 1MB
    Write-Host "Download completed: backend.zip ($([math]::Round($sizeMB, 2)) MB)"
    Write-Host "File saved to: $destination"

}
catch {
    Write-Error "Failed to download backend artifact from S3: $_"
    exit 1
}
