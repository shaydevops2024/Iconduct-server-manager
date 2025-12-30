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
          services: result.value
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
        services: result.value
      }));
  }

  /**
   * Get services from a single server - ONLY shows services in serviceNames array
   */
  async getServerServices(serverConfig) {
    try {
      console.log(`Fetching services from ${serverConfig.name}...`);
      
      // Get service names from server config (per-server)
      const configuredServiceNames = serverConfig.serviceNames || [];
      
      if (configuredServiceNames.length === 0) {
        console.log(`No service names configured for ${serverConfig.name}`);
        return [];
      }
      
      console.log(`Looking for ${configuredServiceNames.length} configured services on ${serverConfig.name}`);
      
      // Get ALL IConduct services and convert Status to string
      const command = `Get-Service | Where-Object {$_.Name -like '*IConduct*' -or $_.DisplayName -like '*IConduct*'} | ForEach-Object {[PSCustomObject]@{Name=$_.Name;DisplayName=$_.DisplayName;Status=$_.Status.ToString()}} | ConvertTo-Json`;

      const output = await sshService.executeCommand(serverConfig, command);
      
      console.log(`Raw output from ${serverConfig.name} (length: ${output.length})`);
      
      // Parse JSON output
      let allServices = [];
      if (output && output.trim().length > 0) {
        try {
          const cleanOutput = output.trim();
          
          // Handle empty array
          if (cleanOutput === '[]' || cleanOutput === '') {
            console.log(`No services found on ${serverConfig.name}`);
            return [];
          }
          
          const parsed = JSON.parse(cleanOutput);
          allServices = Array.isArray(parsed) ? parsed : [parsed];
          
          console.log(`Found ${allServices.length} total IConduct services on ${serverConfig.name}`);
        } catch (e) {
          console.error(`Error parsing JSON from ${serverConfig.name}:`, e.message);
          return [];
        }
      } else {
        console.log(`Empty output from ${serverConfig.name}`);
        return [];
      }

      // FILTER: Only include services that are in the configured serviceNames list
      const filteredServices = allServices.filter(service => {
        // Check if service Name or DisplayName matches any configured service name
        const nameMatch = configuredServiceNames.some(configName => 
          service.Name.toLowerCase() === configName.toLowerCase() ||
          service.DisplayName.toLowerCase() === configName.toLowerCase()
        );
        return nameMatch;
      });

      console.log(`Filtered to ${filteredServices.length} configured services (from ${allServices.length} total)`);
      
      // Add CPU and RAM as 0 for now (can be enhanced later)
      const services = filteredServices.map(svc => ({
        Name: svc.Name,
        DisplayName: svc.DisplayName,
        Status: svc.Status,
        CPU: 0,
        RAM: 0
      }));

      // Log which services were found vs not found
      const foundNames = services.map(s => s.DisplayName);
      const notFound = configuredServiceNames.filter(name => 
        !foundNames.some(found => found.toLowerCase() === name.toLowerCase())
      );
      
      if (notFound.length > 0) {
        console.log(`⚠️  Services not found on ${serverConfig.name}: ${notFound.join(', ')}`);
      }

      return services;
    } catch (error) {
      console.error(`Error getting services from ${serverConfig.name}:`, error.message);
      return [];
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