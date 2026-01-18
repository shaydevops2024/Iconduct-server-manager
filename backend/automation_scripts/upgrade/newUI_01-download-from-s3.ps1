# Full path: backend/automation_scripts/upgrade/newUI_01-download-from-s3.ps1

$ErrorActionPreference = "Stop"

# Template variable (injected at runtime)
$newUIUrl = '{{NEW_UI_URL}}'

# New UI download path
$downloadPath = "C:\temp-new-ui"

try {

    Write-Host "Starting New UI artifact download phase 1"

    # Ensure download folder exists
    if (-not (Test-Path $downloadPath)) {
        New-Item -ItemType Directory -Path $downloadPath -Force | Out-Null
        Write-Host "Created download folder: $downloadPath"
    } else {
        Remove-Item -Path "$downloadPath\*" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cleaned download folder: $downloadPath"
    }

    # Validate NEW_UI_URL
    if (-not $newUIUrl -or $newUIUrl -eq '' -or $newUIUrl -eq '{{NEW_UI_URL}}') {
        throw "NEW_UI_URL is empty or not defined"
    }

    if ($newUIUrl -notmatch '^https?://') {
        throw "NEW_UI_URL must be a full http(s) URL. Actual value: $newUIUrl"
    }

    Write-Host "Downloading New UI artifact from S3:"
    Write-Host $newUIUrl

    $destination = Join-Path $downloadPath "new-ui.zip"

    # Download from S3
    $webClient = New-Object System.Net.WebClient
    $webClient.DownloadFile($newUIUrl, $destination)

    $sizeMB = (Get-Item $destination).Length / 1MB
    Write-Host "Download completed: new-ui.zip ($([math]::Round($sizeMB, 2)) MB)"
    Write-Host "File saved to: $destination"

}
catch {
    Write-Error "Failed to download New UI artifact from S3: $_"
    exit 1
}