# Full path: backend/automation_scripts/upgrade/11-start-services.ps1

$ErrorActionPreference = "Stop"

try {
    Write-Host "Discovering backend services..."

    # Dynamically discover all backend services on Windows
    $serviceNames = Get-Service |
        Where-Object {
            $_.Name -match 'IConduct|Gateway|Metadata|DataBus|Scheduler|Repository|Noti|Nats|license'
        } |
        Select-Object -ExpandProperty Name

    if (-not $serviceNames -or $serviceNames.Count -eq 0) {
        Write-Error "No backend services found to start"
        exit 1
    }

    Write-Host "Found $($serviceNames.Count) backend services"
}
catch {
    Write-Error "Failed to discover backend services - $($_.Exception.Message)"
    exit 1
}

# Function to start service safely
function Start-ServiceSafe {
    param(
        [string]$serviceName,
        [int]$sleepSeconds = 5
    )

    try {
        $service = Get-Service -Name $serviceName -ErrorAction Stop
        if ($service.Status -eq "Stopped") {
            Write-Host "Starting service: $serviceName..."
            Start-Service -Name $serviceName
            Start-Sleep -Seconds $sleepSeconds
            $service.Refresh()
            if ($service.Status -eq "Running") {
                Write-Host "Started: $serviceName"
                return $true
            } else {
                Write-Host "WARNING: Service $serviceName did not start properly"
                return $false
            }
        } elseif ($service.Status -eq "Running") {
            Write-Host "$serviceName is already running"
            return $true
        } else {
            Write-Host "$serviceName is in state: $($service.Status). Skipping."
            return $false
        }
    }
    catch {
        Write-Host "ERROR: Failed to start $serviceName. Reason: $_"
        return $false
    }
}

# Function to find service by pattern (all patterns must match, case-insensitive)
function Find-ServiceByPattern {
    param([string[]]$patterns)

    foreach ($serviceName in $serviceNames) {
        $matchCount = 0
        foreach ($pattern in $patterns) {
            if ($serviceName -imatch [regex]::Escape($pattern)) {
                $matchCount++
            }
        }

        if ($matchCount -eq $patterns.Count) {
            return $serviceName
        }
    }

    return $null
}

try {
    Write-Host "Starting services in order..."
    $startedCount = 0

    # -----------------------------
    # 1. Start NATS Services
    # -----------------------------
    Write-Host "`n=== Starting NATS Services ==="
    $natsService = Find-ServiceByPattern @("nats", "new", "embedded")

    if ($natsService) {
        # Start single combined service
        if (Start-ServiceSafe -serviceName $natsService -sleepSeconds 10) {
            $startedCount++
        }
    } else {
        # Start separate services
        $natsServer = Find-ServiceByPattern @("nats", "server")
        $natsStreamer = Find-ServiceByPattern @("nats", "streamer")

        if ($natsServer) {
            if (Start-ServiceSafe -serviceName $natsServer -sleepSeconds 5) {
                $startedCount++
            }
        }

        if ($natsStreamer) {
            if (Start-ServiceSafe -serviceName $natsStreamer -sleepSeconds 5) {
                $startedCount++
            }
        }
    }

    # -----------------------------
    # 2. Notification Service
    # -----------------------------
    Write-Host "`n=== Starting Notification ==="
    $notificationService = Find-ServiceByPattern @("noti")
    if ($notificationService) {
        if (Start-ServiceSafe -serviceName $notificationService -sleepSeconds 5) {
            $startedCount++
        }
    }

    # -----------------------------
    # 3. Repository Service
    # -----------------------------
    Write-Host "`n=== Starting Repository ==="
    $repoService = Find-ServiceByPattern @("repository")
    if ($repoService) {
        if (Start-ServiceSafe -serviceName $repoService -sleepSeconds 5) {
            $startedCount++
        }
    }

    # -----------------------------
    # 4. Scheduler Storage
    # -----------------------------
    Write-Host "`n=== Starting Scheduler Storage ==="
    $schedulerStorageService = Find-ServiceByPattern @("scheduler", "storage")
    if ($schedulerStorageService) {
        if (Start-ServiceSafe -serviceName $schedulerStorageService -sleepSeconds 5) {
            $startedCount++
        }
    }

    # -----------------------------
    # 5. Schedulers 01 & 02
    # -----------------------------
    Write-Host "`n=== Starting Schedulers ==="
    $scheduler01 = $serviceNames | Where-Object { $_ -imatch "Service" -and $_ -imatch "01" } | Select-Object -First 1
    $scheduler02 = $serviceNames | Where-Object { $_ -imatch "Service" -and $_ -imatch "02" } | Select-Object -First 1

    if ($scheduler01) {
        if (Start-ServiceSafe -serviceName $scheduler01 -sleepSeconds 5) {
            $startedCount++
        }
    }

    if ($scheduler02) {
        if (Start-ServiceSafe -serviceName $scheduler02 -sleepSeconds 5) {
            $startedCount++
        }
    }

    # -----------------------------
    # 6. DataBus
    # -----------------------------
    Write-Host "`n=== Starting DataBus ==="
    $databusService = Find-ServiceByPattern @("databus")
    if ($databusService) {
        if (Start-ServiceSafe -serviceName $databusService -sleepSeconds 3) {
            $startedCount++
        }
    }

    # -----------------------------
    # 7. License Service
    # -----------------------------
    Write-Host "`n=== Starting License Service ==="
    $licenseService = Find-ServiceByPattern @("license")
    if ($licenseService) {
        if (Start-ServiceSafe -serviceName $licenseService -sleepSeconds 3) {
            $startedCount++
        }
    }

    # Critical wait before agents
    Write-Host "`n⏳ WAITING 30 SECONDS BEFORE STARTING AGENTS..."
    Start-Sleep -Seconds 30

    # -----------------------------
    # 8. Cloud Agents 01 & 02
    # -----------------------------
    Write-Host "`n=== Starting Cloud Agents ==="
    $agent01 = $serviceNames | Where-Object { $_ -imatch "Cloud" -and $_ -imatch "Agent" -and $_ -imatch "01" } | Select-Object -First 1
    $agent02 = $serviceNames | Where-Object { $_ -imatch "Cloud" -and $_ -imatch "Agent" -and $_ -imatch "02" } | Select-Object -First 1

    if ($agent01) {
        if (Start-ServiceSafe -serviceName $agent01 -sleepSeconds 5) {
            $startedCount++
        }
    }

    if ($agent02) {
        if (Start-ServiceSafe -serviceName $agent02 -sleepSeconds 5) {
            $startedCount++
        }
    }

    # -----------------------------
    # 9. Metadata API
    # -----------------------------
    Write-Host "`n=== Starting Metadata API ==="
    $metadataService = Find-ServiceByPattern @("metadata")
    if ($metadataService) {
        if (Start-ServiceSafe -serviceName $metadataService -sleepSeconds 5) {
            $startedCount++
        }
    }

    # -----------------------------
    # 10. Gateway
    # -----------------------------
    Write-Host "`n=== Starting Gateway ==="
    $gatewayService = Find-ServiceByPattern @("gateway")
    if ($gatewayService) {
        if (Start-ServiceSafe -serviceName $gatewayService -sleepSeconds 5) {
            $startedCount++
        }
    }

    Write-Host "`n=== Service startup completed ==="
    Write-Host "Started $startedCount service(s)"
}
catch {
    Write-Error "Failed to start services: $_"
    exit 1
}
