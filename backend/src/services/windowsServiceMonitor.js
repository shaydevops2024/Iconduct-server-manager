// Full path: backend/src/services/windowsServiceMonitor.js

const sshService = require('./sshService');

class WindowsServiceMonitor {
  /**
   * Get all services matching IConduct names across all servers
   */
  async getAllServices() {
    const servers = sshService.getAllServers();
    const serviceNames = sshService.getServiceNames();
    
    const results = await Promise.allSettled(
      servers.map(server => this.getServerServices(server, serviceNames))
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
    const serviceNames = sshService.getServiceNames();
    
    const results = await Promise.allSettled(
      servers.map(server => this.getServerServices(server, serviceNames))
    );

    return results
      .filter(result => result.status === 'fulfilled')
      .map((result, index) => ({
        serverName: servers[index].name,
        services: result.value
      }));
  }

  /**
   * Get services from a single server - SUPER SIMPLIFIED
   */
  async getServerServices(serverConfig, serviceNames) {
    try {
      console.log(`Fetching services from ${serverConfig.name}...`);
      
      // Get IConduct services and convert Status to string
      const command = `Get-Service | Where-Object {$_.Name -like '*IConduct*' -or $_.DisplayName -like '*IConduct*'} | ForEach-Object {[PSCustomObject]@{Name=$_.Name;DisplayName=$_.DisplayName;Status=$_.Status.ToString()}} | ConvertTo-Json`;

      const output = await sshService.executeCommand(serverConfig, command);
      
      console.log(`Raw output from ${serverConfig.name} (length: ${output.length}):`);
      console.log(output.substring(0, 500));
      
      // Parse JSON output
      let services = [];
      if (output && output.trim().length > 0) {
        try {
          const cleanOutput = output.trim();
          
          // Handle empty results
          if (cleanOutput === '[]' || cleanOutput === '') {
            console.log(`No services found on ${serverConfig.name}`);
            return [];
          }
          
          const parsed = JSON.parse(cleanOutput);
          const rawServices = Array.isArray(parsed) ? parsed : [parsed];
          
          // Add CPU and RAM as 0 for now (we'll enhance this later)
          services = rawServices.map(svc => ({
            Name: svc.Name,
            DisplayName: svc.DisplayName,
            Status: svc.Status,
            CPU: 0,
            RAM: 0
          }));
          
          console.log(`Successfully parsed ${services.length} services from ${serverConfig.name}`);
        } catch (e) {
          console.error(`Error parsing JSON from ${serverConfig.name}:`, e.message);
          console.error(`Output was: ${output.substring(0, 1000)}`);
        }
      } else {
        console.log(`Empty output from ${serverConfig.name}`);
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