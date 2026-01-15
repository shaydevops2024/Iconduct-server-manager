# Full path: backend/automation_scripts/upgrade/oldUI_03-copy-config-files.ps1

$ErrorActionPreference = "Stop"

# Define paths
$tempPath = "C:\inetpub\wwwroot\temp"
$wwwrootPath = "C:\inetpub\wwwroot"
$sourceUIPath = Join-Path $wwwrootPath "IConductUI"
$targetUIPath = Join-Path $tempPath "IConductUI"

try {
    Write-Host "---- Starting Config Files Copy Phase ----"

    # Verify source and target exist
    if (-not (Test-Path $sourceUIPath)) {
        throw "Source IConductUI folder not found at $sourceUIPath"
    }

    if (-not (Test-Path $targetUIPath)) {
        throw "Target IConductUI folder not found at $targetUIPath"
    }

    # Step 1: Copy Web.config
    Write-Host "Step 1: Copying Web.config..."
    $webConfigSource = Join-Path $sourceUIPath "Web.config"
    $webConfigTarget = Join-Path $targetUIPath "Web.config"

    if (Test-Path $webConfigSource) {
        Copy-Item -Path $webConfigSource -Destination $webConfigTarget -Force
        Write-Host "Copied Web.config successfully"
    } else {
        Write-Warning "Web.config not found at $webConfigSource"
    }

    # Step 2: Copy ConnectorAssemblyCache folder
    Write-Host "Step 2: Copying ConnectorAssemblyCache folder..."
    $cacheSource = Join-Path $sourceUIPath "ConnectorAssemblyCache"
    $cacheTarget = Join-Path $targetUIPath "ConnectorAssemblyCache"

    if (Test-Path $cacheSource) {
        Copy-Item -Path $cacheSource -Destination $cacheTarget -Recurse -Force
        Write-Host "Copied ConnectorAssemblyCache successfully"
    } else {
        Write-Warning "ConnectorAssemblyCache not found at $cacheSource"
    }

    # Step 3: Copy ComponentArt.UIFramework.lic
    Write-Host "Step 3: Copying ComponentArt.UIFramework.lic..."
    $binSourcePath = Join-Path $sourceUIPath "bin"
    $binTargetPath = Join-Path $targetUIPath "bin"
    $componentArtSource = Join-Path $binSourcePath "ComponentArt.UIFramework.lic"
    $componentArtTarget = Join-Path $binTargetPath "ComponentArt.UIFramework.lic"

    if (Test-Path $componentArtSource) {
        Copy-Item -Path $componentArtSource -Destination $componentArtTarget -Force
        Write-Host "Copied ComponentArt.UIFramework.lic successfully"
    } else {
        Write-Warning "ComponentArt.UIFramework.lic not found at $componentArtSource"
    }

    # Step 4: Move System.IdentityModel.Tokens.Jwt.4.0.dll to LegacyAssemblies
    Write-Host "Step 4: Moving System.IdentityModel.Tokens.Jwt.4.0.dll to LegacyAssemblies..."
    $jwtSource = Join-Path $binTargetPath "System.IdentityModel.Tokens.Jwt.4.0.dll"
    $legacyTargetPath = Join-Path $binTargetPath "LegacyAssemblies\IdentityModel"
    $jwtTarget = Join-Path $legacyTargetPath "System.IdentityModel.Tokens.Jwt.4.0.dll"

    # Create LegacyAssemblies directory if it doesn't exist
    if (-not (Test-Path $legacyTargetPath)) {
        New-Item -Path $legacyTargetPath -ItemType Directory -Force | Out-Null
        Write-Host "Created directory: $legacyTargetPath"
    }

    if (Test-Path $jwtSource) {
        Move-Item -Path $jwtSource -Destination $jwtTarget -Force
        Write-Host "Moved System.IdentityModel.Tokens.Jwt.4.0.dll to LegacyAssemblies"
    } else {
        Write-Warning "System.IdentityModel.Tokens.Jwt.4.0.dll not found at $jwtSource"
    }

    Write-Host "---- Config Files Copy Phase Completed Successfully ----"
}
catch {
    Write-Error "Failed to copy config files: $_"
    exit 1
}
