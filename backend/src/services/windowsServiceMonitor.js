// Full path: backend/src/services/windowsServiceMonitor.js

const sshService = require('./sshService');

class WindowsServiceMonitor {
  /**
   * Get all services matching IConduct names across all servers
   */
  async getAllServices() {
    const servers = sshService.getAllServers();
    
    const results = await Promise.allSettled(
      servers.map(server => this.getServerServices(server))
    );

    // Group by server group
    const groupedServices = {};
    results.forEach((result, index) => {
      const server = servers[index];
      if (result.status === 'fulfilled') {
        if (!groupedServices[server.group]) {
          groupedServices[server.group] = [];
        }
        groupedServices[server.group].push({
          serverName: server.name,
          services: result.value.services,
          systemMetrics: result.value.systemMetrics
        });
      }
    });

    return groupedServices;
  }

  /**
   * Get services for a specific server group
   */
  async getServicesByGroup(group) {
    const servers = sshService.getServersByGroup(group);
    
    const results = await Promise.allSettled(
      servers.map(server => this.getServerServices(server))
    );

    return results
      .filter(result => result.status === 'fulfilled')
      .map((result, index) => ({
        serverName: servers[index].name,
        services: result.value.services,
        systemMetrics: result.value.systemMetrics
      }));
  }

  /**
   * Get system-level CPU and RAM usage percentages
   * Using more reliable WMI queries
   */
  async getSystemMetrics(serverConfig) {
    try {
      console.log(`\n🔍 Fetching system metrics from ${serverConfig.name}...`);
      
      // Get CPU percentage - using WMI (more reliable)
      let cpuPercent = 0;
      try {
        const cpuCommand = `Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select-Object -ExpandProperty Average`;
        const cpuOutput = await sshService.executeCommand(serverConfig, cpuCommand);
        const cpuValue = parseFloat(cpuOutput.trim());
        cpuPercent = Math.round(cpuValue);
        if (isNaN(cpuPercent) || cpuPercent < 0) cpuPercent = 0;
        if (cpuPercent > 100) cpuPercent = 100;
        console.log(`  ✅ CPU Usage: ${cpuPercent}% (raw: ${cpuValue})`);
      } catch (error) {
        console.error(`  ❌ CPU query failed:`, error.message);
        
        // Fallback method: try Get-Counter
        try {
          console.log(`  🔄 Trying fallback CPU method...`);
          const cpuFallbackCommand = `(Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 1).CounterSamples.CookedValue`;
          const cpuFallbackOutput = await sshService.executeCommand(serverConfig, cpuFallbackCommand);
          const cpuFallbackValue = parseFloat(cpuFallbackOutput.trim());
          cpuPercent = Math.round(cpuFallbackValue);
          if (isNaN(cpuPercent) || cpuPercent < 0) cpuPercent = 0;
          if (cpuPercent > 100) cpuPercent = 100;
          console.log(`  ✅ CPU Usage (fallback): ${cpuPercent}%`);
        } catch (fallbackError) {
          console.error(`  ❌ CPU fallback also failed:`, fallbackError.message);
        }
      }
      
      // Get RAM percentage - this is working, keep it
      let ramPercent = 0;
      try {
        const ramCommand = `$os = Get-WmiObject Win32_OperatingSystem; $totalMB = $os.TotalVisibleMemorySize / 1024; $freeMB = $os.FreePhysicalMemory / 1024; $usedMB = $totalMB - $freeMB; $percent = [math]::Round(($usedMB / $totalMB) * 100); Write-Output $percent`;
        const ramOutput = await sshService.executeCommand(serverConfig, ramCommand);
        ramPercent = parseInt(ramOutput.trim());
        if (isNaN(ramPercent) || ramPercent < 0) ramPercent = 0;
        if (ramPercent > 100) ramPercent = 100;
        console.log(`  ✅ RAM Usage: ${ramPercent}%`);
      } catch (error) {
        console.error(`  ❌ RAM query failed:`, error.message);
      }
      
      console.log(`✅ System metrics from ${serverConfig.name}: CPU ${cpuPercent}%, RAM ${ramPercent}%\n`);
      
      return {
        cpuPercent: cpuPercent,
        ramPercent: ramPercent
      };
      
    } catch (error) {
      console.error(`❌ Error getting system metrics from ${serverConfig.name}:`, error.message);
      return {
        cpuPercent: 0,
        ramPercent: 0
      };
    }
  }

  /**
   * Get services from a single server
   */
  async getServerServices(serverConfig) {
    try {
      console.log(`\n📡 Fetching services from ${serverConfig.name}...`);
      
      const configuredServiceNames = serverConfig.serviceNames || [];
      
      if (configuredServiceNames.length === 0) {
        console.log(`⚠️  No service names configured for ${serverConfig.name}`);
        return {
          services: [],
          systemMetrics: await this.getSystemMetrics(serverConfig)
        };
      }
      
      console.log(`Looking for ${configuredServiceNames.length} configured services on ${serverConfig.name}`);
      
      // Get basic service info
      const serviceCommand = `Get-Service | Where-Object {$_.Name -like '*IConduct*' -or $_.DisplayName -like '*IConduct*'} | ForEach-Object {[PSCustomObject]@{Name=$_.Name;DisplayName=$_.DisplayName;Status=$_.Status.ToString()}} | ConvertTo-Json`;

      const serviceOutput = await sshService.executeCommand(serverConfig, serviceCommand);
      
      let allServices = [];
      if (serviceOutput && serviceOutput.trim().length > 0) {
        try {
          const cleanOutput = serviceOutput.trim();
          
          if (cleanOutput === '[]' || cleanOutput === '') {
            console.log(`⚠️  No services found on ${serverConfig.name}`);
            return {
              services: [],
              systemMetrics: await this.getSystemMetrics(serverConfig)
            };
          }
          
          const parsed = JSON.parse(cleanOutput);
          allServices = Array.isArray(parsed) ? parsed : [parsed];
          
          console.log(`Found ${allServices.length} total IConduct services on ${serverConfig.name}`);
        } catch (e) {
          console.error(`❌ Error parsing JSON from ${serverConfig.name}:`, e.message);
          return {
            services: [],
            systemMetrics: await this.getSystemMetrics(serverConfig)
          };
        }
      } else {
        console.log(`⚠️  Empty service output from ${serverConfig.name}`);
        return {
          services: [],
          systemMetrics: await this.getSystemMetrics(serverConfig)
        };
      }

      // Filter to configured services
      const filteredServices = allServices.filter(service => {
        const nameMatch = configuredServiceNames.some(configName => 
          service.Name.toLowerCase() === configName.toLowerCase() ||
          service.DisplayName.toLowerCase() === configName.toLowerCase()
        );
        return nameMatch;
      });

      console.log(`Filtered to ${filteredServices.length} configured services (from ${allServices.length} total)`);

      // Get RAM for running services
      const servicesWithMetrics = await Promise.all(
        filteredServices.map(async (service) => {
          let ram = 0;
          
          if (service.Status === 'Running') {
            try {
              const ramCommand = `try { $svc = Get-WmiObject Win32_Service | Where-Object {$_.Name -eq '${service.Name}'}; if($svc -and $svc.ProcessId -gt 0) { $proc = Get-Process -Id $svc.ProcessId -ErrorAction SilentlyContinue; if($proc) { [math]::Round($proc.WorkingSet64 / 1MB, 2) } else { 0 } } else { 0 } } catch { 0 }`;
              
              const ramOutput = await sshService.executeCommand(serverConfig, ramCommand);
              const ramValue = parseFloat(ramOutput.trim());
              ram = isNaN(ramValue) ? 0 : ramValue;
              
              console.log(`  ${service.Name}: ${ram} MB`);
            } catch (error) {
              console.error(`  ❌ Error getting RAM for ${service.Name}:`, error.message);
              ram = 0;
            }
          }
          
          return {
            Name: service.Name,
            DisplayName: service.DisplayName,
            Status: service.Status,
            CPU: 0,
            RAM: ram
          };
        })
      );

      // Get system-level metrics
      const systemMetrics = await this.getSystemMetrics(serverConfig);

      const foundNames = servicesWithMetrics.map(s => s.DisplayName);
      const notFound = configuredServiceNames.filter(name => 
        !foundNames.some(found => found.toLowerCase() === name.toLowerCase())
      );
      
      if (notFound.length > 0) {
        console.log(`⚠️  Services not found on ${serverConfig.name}: ${notFound.join(', ')}`);
      }

      console.log(`✅ Returning ${servicesWithMetrics.length} services with metrics from ${serverConfig.name}\n`);
      
      return {
        services: servicesWithMetrics,
        systemMetrics: systemMetrics
      };
      
    } catch (error) {
      console.error(`❌ Error getting services from ${serverConfig.name}:`, error.message);
      return {
        services: [],
        systemMetrics: {
          cpuPercent: 0,
          ramPercent: 0
        }
      };
    }
  }

  /**
   * Get specific service details
   */
  async getServiceDetails(serverConfig, serviceName) {
    try {
      const command = `Get-Service -Name '${serviceName}' | Select-Object Name,DisplayName,Status | ConvertTo-Json`;

      const output = await sshService.executeCommand(serverConfig, command);
      return JSON.parse(output);
    } catch (error) {
      throw new Error(`Failed to get service details: ${error.message}`);
    }
  }
}

module.exports = new WindowsServiceMonitor();