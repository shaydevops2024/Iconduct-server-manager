# Full path: backend/automation_scripts/upgrade/11-start-services.ps1

$ErrorActionPreference = "Stop"

$serverType = '{{SERVER_TYPE}}'
$serviceNamesJson = '{{SERVICE_NAMES_JSON}}'
$serviceNames = $serviceNamesJson | ConvertFrom-Json

try {
    Write-Host "Starting services in order..."
    
    $startedCount = 0
    
    # Function to start service safely
    function Start-ServiceSafe {
        param($serviceName, $sleepSeconds = 5)
        
        try {
            $service = Get-Service -Name $serviceName -ErrorAction Stop
            if ($service.Status -eq "Stopped") {
                Write-Host "Starting service: $serviceName..."
                Start-Service -Name $serviceName
                Write-Host "Started: $serviceName"
                Write-Host "Waited $sleepSeconds seconds"
                Start-Sleep -Seconds $sleepSeconds
                return $true
            } elseif ($service.Status -eq "Running") {
                Write-Host "$serviceName is already running"
                return $true
            } else {
                Write-Host "$serviceName is in state: $($service.Status). Skipping."
                return $false
            }
        } catch {
            Write-Host "ERROR: Failed to start $serviceName. Reason: $_"
            return $false
        }
    }
    
    # Function to find service by pattern
    function Find-ServiceByPattern {
        param($patterns)
        
        foreach ($serviceName in $serviceNames) {
            $lowerServiceName = $serviceName.ToLower()
            $matchCount = 0
            
            foreach ($pattern in $patterns) {
                if ($lowerServiceName -like "*$($pattern.ToLower())*") {
                    $matchCount++
                }
            }
            
            # All patterns must match
            if ($matchCount -eq $patterns.Count) {
                return $serviceName
            }
        }
        
        return $null
    }
    
    # START ORDER (based on user's script)
    
    # 1. Start NATS STREAMER
    Write-Host "`n=== Starting NATS Streamer ==="
    $natsService = Find-ServiceByPattern @("nats", "new", "embedded")
    if ($natsService) {
        if (Start-ServiceSafe -serviceName $natsService -sleepSeconds 10) {
            $startedCount++
        }
    }
    
    # 2. Start NOTIFICATION
    Write-Host "`n=== Starting Notification ==="
    $notificationService = Find-ServiceByPattern @("noti")
    if ($notificationService) {
        if (Start-ServiceSafe -serviceName $notificationService -sleepSeconds 5) {
            $startedCount++
        }
    }
    
    # 3. Start REPOSITORY
    Write-Host "`n=== Starting Repository ==="
    $repoService = Find-ServiceByPattern @("repository")
    if ($repoService) {
        if (Start-ServiceSafe -serviceName $repoService -sleepSeconds 5) {
            $startedCount++
        }
    }
    
    # 4. Start SCHEDULER STORAGE
    Write-Host "`n=== Starting Scheduler Storage ==="
    $schedulerStorageService = Find-ServiceByPattern @("scheduler", "storage")
    if ($schedulerStorageService) {
        if (Start-ServiceSafe -serviceName $schedulerStorageService -sleepSeconds 5) {
            $startedCount++
        }
    }
    
    # 5. Start SCHEDULERS 1 + 2
    Write-Host "`n=== Starting Schedulers ==="
    $scheduler01 = $serviceNames | Where-Object { $_ -like "*Service*" -and $_ -like "*01*" } | Select-Object -First 1
    $scheduler02 = $serviceNames | Where-Object { $_ -like "*Service*" -and $_ -like "*02*" } | Select-Object -First 1
    
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
    
    # 6. Start DATABUS
    Write-Host "`n=== Starting DataBus ==="
    $databusService = Find-ServiceByPattern @("databus")
    if ($databusService) {
        if (Start-ServiceSafe -serviceName $databusService -sleepSeconds 3) {
            $startedCount++
        }
    }
    
    # 7. Start LICENSE SERVICE
    Write-Host "`n=== Starting License Service ==="
    $licenseService = Find-ServiceByPattern @("license")
    if ($licenseService) {
        if (Start-ServiceSafe -serviceName $licenseService -sleepSeconds 3) {
            $startedCount++
        }
    }
    
    # CRITICAL WAIT BEFORE AGENTS
    Write-Host "`n⏳ WAITING 30 SECONDS BEFORE STARTING AGENTS..."
    Start-Sleep -Seconds 30
    
    # 8. Start AGENTS 1 + 2
    Write-Host "`n=== Starting Cloud Agents ==="
    $agent01 = $serviceNames | Where-Object { 
        $_ -like "*Cloud*" -and $_ -like "*Agent*" -and $_ -like "*01*" 
    } | Select-Object -First 1
    
    $agent02 = $serviceNames | Where-Object { 
        $_ -like "*Cloud*" -and $_ -like "*Agent*" -and $_ -like "*02*" 
    } | Select-Object -First 1
    
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
    
    # 9. Start METADATA API
    Write-Host "`n=== Starting Metadata API ==="
    $metadataService = Find-ServiceByPattern @("metadata")
    if ($metadataService) {
        if (Start-ServiceSafe -serviceName $metadataService -sleepSeconds 5) {
            $startedCount++
        }
    }
    
    # 10. Start GATEWAY
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
