# Full path: backend/automation_scripts/upgrade/08-stop-services.ps1

$ErrorActionPreference = "Stop"

$serverType = '{{SERVER_TYPE}}'
$serviceNamesJson = '{{SERVICE_NAMES_JSON}}'
$serviceNames = $serviceNamesJson | ConvertFrom-Json

try {
    $stoppedCount = 0
    
    Write-Host "Stopping $($serviceNames.Count) services..."
    
    # STEP 1: Kill all ServIT.IConduct.WinService.exe processes FIRST
    if ($serverType -eq 'backend') {
        Write-Host "`nKilling ServIT.IConduct.WinService.exe processes..."
        $processes = Get-Process -Name "ServIT.IConduct.WinService" -ErrorAction SilentlyContinue
        
        if ($processes) {
            foreach ($process in $processes) {
                try {
                    Stop-Process -Id $process.Id -Force
                    Write-Host "Killed process: ServIT.IConduct.WinService (PID: $($process.Id))"
                } catch {
                    Write-Host "Could not kill process $($process.Id): $_"
                }
            }
            
            # Wait for processes to die
            Start-Sleep -Seconds 3
        } else {
            Write-Host "No ServIT.IConduct.WinService processes found"
        }
    }
    
    # STEP 2: Stop services in REVERSE order (based on user's script)
    Write-Host "`nStopping services..."
    
    # Define reverse order (Gateway first, NATS last)
    $reverseOrder = @(
        "*Gateway*",
        "*MetadataAPI*",
        "*Cloud*Agent*0*",
        "*license-service*",
        "*DataBus*",
        "IConductService01",
        "IConductService02",
        "*Scheduler*Storage*",
        "*Repository*",
        "*Noti*",
        "*Nats*"
    )
    
    foreach ($pattern in $reverseOrder) {
        # Find matching services
        $matchingServices = $serviceNames | Where-Object { $_ -like $pattern }
        
        foreach ($serviceName in $matchingServices) {
            try {
                $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
                
                if ($service) {
                    if ($service.Status -eq 'Running') {
                        Write-Host "Stopping service: $serviceName"
                        
                        # Stop the service
                        Stop-Service -Name $serviceName -Force -ErrorAction Stop
                        
                        # Wait up to 30 seconds for service to stop
                        $timeout = 30
                        $elapsed = 0
                        $service.Refresh()
                        
                        while ($service.Status -ne 'Stopped' -and $elapsed -lt $timeout) {
                            Start-Sleep -Seconds 2
                            $elapsed += 2
                            $service.Refresh()
                        }
                        
                        if ($service.Status -eq 'Stopped') {
                            Write-Host "Stopped service: $serviceName"
                            $stoppedCount++
                        } else {
                            Write-Host "WARNING: Service $serviceName did not stop within timeout, forcing..."
                            
                            # Get the service process and kill it
                            $serviceProcess = Get-WmiObject -Class Win32_Service -Filter "Name='$serviceName'" | 
                                Select-Object -ExpandProperty ProcessId
                            
                            if ($serviceProcess -and $serviceProcess -gt 0) {
                                Stop-Process -Id $serviceProcess -Force -ErrorAction SilentlyContinue
                                Write-Host "Force killed process for service: $serviceName (PID: $serviceProcess)"
                                Start-Sleep -Seconds 2
                            }
                            
                            $stoppedCount++
                        }
                        
                        # Wait 8 seconds after each service (from user's script)
                        Start-Sleep -Seconds 8
                    } else {
                        Write-Host "Service already stopped: $serviceName"
                    }
                } else {
                    Write-Host "Service not found: $serviceName"
                }
            }
            catch {
                Write-Host "Failed to stop service $serviceName : $_"
            }
        }
    }
    
    # STEP 3: Final cleanup - kill any remaining zombie processes
    if ($serverType -eq 'backend') {
        Start-Sleep -Seconds 2
        $remainingProcesses = Get-Process -Name "ServIT.IConduct.WinService" -ErrorAction SilentlyContinue
        
        if ($remainingProcesses) {
            foreach ($process in $remainingProcesses) {
                Stop-Process -Id $process.Id -Force
                Write-Host "Killed remaining zombie process: ServIT.IConduct.WinService (PID: $($process.Id))"
            }
        }
    }
    
    Write-Host "`nStopped $stoppedCount service(s) and killed all zombie processes"
}
catch {
    Write-Error "Failed to stop services: $_"
    exit 1
}
