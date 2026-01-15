# Full path: backend/automation_scripts/upgrade/oldUI_01-download-from-s3.ps1

$ErrorActionPreference = "Stop"

# Template variable (injected at runtime)
$oldUIUrl = '{{OLD_UI_URL}}'

# Old UI download path
$tempPath = "C:\inetpub\wwwroot\temp"
$downloadFile = "oldUI.zip"

try {
    Write-Host "Starting Old UI download from S3"

    # Create temp folder if it doesn't exist
    if (-not (Test-Path $tempPath)) {
        New-Item -ItemType Directory -Path $tempPath -Force | Out-Null
        Write-Host "Created temp folder: $tempPath"
    } else {
        # Clean existing temp folder
        Remove-Item -Path "$tempPath\*" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cleaned temp folder: $tempPath"
    }

    # Validate OLD_UI_URL
    if (-not $oldUIUrl -or $oldUIUrl -eq '' -or $oldUIUrl -eq '{{OLD_UI_URL}}') {
        throw "OLD_UI_URL is empty or not defined"
    }

    if ($oldUIUrl -notmatch '^https?://') {
        throw "OLD_UI_URL must be a full http(s) URL. Actual value: $oldUIUrl"
    }

    Write-Host "Downloading Old UI from S3:"
    Write-Host $oldUIUrl

    $destination = Join-Path $tempPath $downloadFile

    # Download from S3
    $webClient = New-Object System.Net.WebClient
    $webClient.DownloadFile($oldUIUrl, $destination)

    $sizeMB = (Get-Item $destination).Length / 1MB
    Write-Host "Download completed: $downloadFile ($([math]::Round($sizeMB, 2)) MB)"
    Write-Host "File saved to: $destination"

}
catch {
    Write-Error "Failed to download Old UI from S3: $_"
    exit 1
}
