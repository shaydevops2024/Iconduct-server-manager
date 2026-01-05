// Full path: frontend/src/pages/Dashboard.js

import React, { useState, useEffect, useRef } from 'react';
import { servicesAPI } from '../services/api';
import { FaServer, FaCircle, FaSync, FaChevronDown, FaChevronUp, FaMicrochip, FaMemory, FaExclamationTriangle, FaCheckCircle } from 'react-icons/fa';
import ServiceCard from '../components/ServiceCard';

const Dashboard = () => {
  const [services, setServices] = useState({});
  const [groups, setGroups] = useState([]);
  const [loadingServers, setLoadingServers] = useState({}); // Track which servers are loading
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalServers, setTotalServers] = useState(0);
  const [expandedServer, setExpandedServer] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  // Load from cache immediately for instant display
  useEffect(() => {
    const cached = localStorage.getItem('iconduct-services-data');
    const cachedGroups = localStorage.getItem('iconduct-services-groups');
    
    if (cached && cachedGroups) {
      try {
        const parsedData = JSON.parse(cached);
        const parsedGroups = JSON.parse(cachedGroups);
        
        if (Date.now() - parsedData.timestamp < 60000) {
          setServices(parsedData.data);
          setGroups(parsedGroups.data);
          setInitialLoading(false);
          
          // Count total servers from cache
          let count = 0;
          Object.values(parsedData.data).forEach(group => {
            count += group.length;
          });
          setTotalServers(count);
          setLoadedCount(count);
        }
      } catch (e) {
        console.error('Failed to parse cached data:', e);
      }
    }
  }, []);

  const fetchServicesProgressive = async () => {
    try {
      setRefreshing(true);
      setError(null);
      
      // Fetch all services data
      const response = await servicesAPI.getAll();
      const newData = response.data.data;
      const newGroups = response.data.groups;
      
      if (!mountedRef.current) return;
      
      // Count total servers
      let serverCount = 0;
      Object.values(newData).forEach(group => {
        serverCount += group.length;
      });
      setTotalServers(serverCount);
      
      // Display servers progressively with animation
      let currentLoaded = 0;
      const allServersData = {};
      const serverLoadingState = {};
      
      // Initialize loading state for all servers
      Object.keys(newData).forEach(group => {
        newData[group].forEach(server => {
          const serverKey = `${group}-${server.serverName}`;
          serverLoadingState[serverKey] = true;
        });
      });
      
      setLoadingServers(serverLoadingState);
      setServices({}); // Clear current display
      setLoadedCount(0);
      
      // Display servers one by one with delay for visual effect
      for (const group of Object.keys(newData)) {
        if (!allServersData[group]) {
          allServersData[group] = [];
        }
        
        for (const server of newData[group]) {
          if (!mountedRef.current) break;
          
          // Add server to display
          allServersData[group].push(server);
          currentLoaded++;
          
          // Update states
          setServices({ ...allServersData });
          setLoadedCount(currentLoaded);
          
          const serverKey = `${group}-${server.serverName}`;
          setLoadingServers(prev => ({
            ...prev,
            [serverKey]: false
          }));
          
          // Small delay for visual effect (faster for available servers)
          await new Promise(resolve => setTimeout(resolve, server.available === false ? 100 : 150));
        }
      }
      
      setGroups(newGroups);
      setLastUpdate(new Date());
      
      // Cache the data
      localStorage.setItem('iconduct-services-data', JSON.stringify({
        data: newData,
        timestamp: Date.now()
      }));
      
      localStorage.setItem('iconduct-services-groups', JSON.stringify({
        data: newGroups,
        timestamp: Date.now()
      }));
      
      console.log(response.data.cached ? '📦 Served from backend cache' : '🔄 Fresh data from servers');
      
    } catch (err) {
      if (mountedRef.current) {
        setError(err.response?.data?.error || 'Failed to fetch services');
        console.error('Error fetching services:', err);
      }
    } finally {
      if (mountedRef.current) {
        setInitialLoading(false);
        setRefreshing(false);
        setLoadingServers({});
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    
    // Initial fetch
    fetchServicesProgressive();
    
    // Handle visibility change
    const handleVisibilityChange = () => {
      if (!document.hidden && mountedRef.current) {
        console.log('👀 Tab visible - refreshing data');
        fetchServicesProgressive();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Auto-refresh every 30 seconds if tab is visible
    const interval = setInterval(() => {
      if (!document.hidden && mountedRef.current) {
        fetchServicesProgressive();
      } else {
        console.log('🙈 Tab hidden - skipping refresh');
      }
    }, 30000);
    
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const toggleServerExpansion = (serverKey) => {
    setExpandedServer(expandedServer === serverKey ? null : serverKey);
  };

  // Calculate statistics
  const getStats = () => {
    let totalServerCount = 0;
    let onlineServers = 0;
    let offlineServers = 0;
    let runningServices = 0;
    let stoppedServices = 0;
    let totalServiceCount = 0;
    const highResourceServers = [];

    Object.values(services).forEach(group => {
      group.forEach(server => {
        totalServerCount++;
        
        const isAvailable = server.available !== false;
        if (isAvailable) {
          onlineServers++;
        } else {
          offlineServers++;
        }

        // Count services
        if (server.services) {
          server.services.forEach(service => {
            totalServiceCount++;
            if (service.Status === 'Running') {
              runningServices++;
            } else {
              stoppedServices++;
            }
          });
        }

        // Check for high resource usage
        if (isAvailable && server.systemMetrics) {
          const alerts = [];
          if (server.systemMetrics.cpuPercent > 80) {
            alerts.push('CPU');
          }
          if (server.systemMetrics.ramPercent > 80) {
            alerts.push('RAM');
          }
          
          if (alerts.length > 0) {
            highResourceServers.push({
              name: server.serverName,
              alerts: alerts
            });
          }
        }
      });
    });

    const serverAvailability = totalServerCount > 0 
      ? Math.round((onlineServers / totalServerCount) * 100) 
      : 0;
    
    const serviceHealth = totalServiceCount > 0 
      ? Math.round((runningServices / totalServiceCount) * 100) 
      : 0;

    return {
      totalServerCount,
      onlineServers,
      offlineServers,
      serverAvailability,
      runningServices,
      stoppedServices,
      totalServiceCount,
      serviceHealth,
      highResourceServers
    };
  };

  const stats = getStats();

  // Skeleton loader component
  const ServerSkeleton = () => (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden animate-pulse">
      <div className="p-5 flex items-center justify-between">
        <div className="flex items-center space-x-4 flex-1">
          <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded"></div>
          <div className="flex-1">
            <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="h-16 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="flex space-x-2">
            <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  );

  if (initialLoading && Object.keys(services).length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Services Dashboard</h2>
        </div>
        
        {/* Loading skeletons */}
        <div className="space-y-3">
          <ServerSkeleton />
          <ServerSkeleton />
          <ServerSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Refresh Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Services Dashboard</h2>
          {lastUpdate && (
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={fetchServicesProgressive}
          disabled={refreshing}
          className="flex items-center space-x-2 bg-orange-500 text-white px-4 py-2 rounded-lg 
                   hover:bg-orange-600 transition-all disabled:opacity-50 shadow-md"
        >
          <FaSync className={refreshing ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Progress Bar (shown during refresh) */}
      {refreshing && totalServers > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Loading servers...
            </span>
            <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
              {loadedCount} of {totalServers}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-orange-500 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${totalServers > 0 ? (loadedCount / totalServers) * 100 : 0}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* New Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Server Status Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200">
          <div className="flex items-center space-x-3 mb-4">
            <FaServer className="text-orange-500 text-2xl" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Server Status</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Online</span>
              <span className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.onlineServers}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Offline</span>
              <span className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.offlineServers}</span>
            </div>
            <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Availability</span>
                <span className="text-xl font-bold text-orange-600 dark:text-orange-400">{stats.serverAvailability}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
                <div 
                  className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${stats.serverAvailability}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Service Health Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200">
          <div className="flex items-center space-x-3 mb-4">
            <div className="text-2xl">⚙️</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Service Health</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Running</span>
              <span className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.runningServices}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Stopped</span>
              <span className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.stoppedServices}</span>
            </div>
            <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Health Score</span>
                <span className="text-xl font-bold text-orange-600 dark:text-orange-400">{stats.serviceHealth}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${
                    stats.serviceHealth >= 95 ? 'bg-green-500' :
                    stats.serviceHealth >= 80 ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${stats.serviceHealth}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* System Health Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200">
          <div className="flex items-center space-x-3 mb-4">
            <div className="text-2xl">📊</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">System Health</h3>
          </div>
          
          {stats.highResourceServers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4">
              <FaCheckCircle className="text-green-500 text-4xl mb-2" />
              <span className="text-lg font-medium text-green-600 dark:text-green-400">All servers healthy</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center space-x-2 mb-3">
                <FaExclamationTriangle className="text-yellow-500 text-xl" />
                <span className="text-lg font-semibold text-gray-900 dark:text-white">
                  {stats.highResourceServers.length} Alert{stats.highResourceServers.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {stats.highResourceServers.map((server, idx) => (
                  <div 
                    key={idx} 
                    className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded px-3 py-2"
                  >
                    <div className="font-medium text-gray-900 dark:text-white text-sm">{server.name}</div>
                    <div className="text-xs text-yellow-700 dark:text-yellow-400">
                      {server.alerts.map((alert, i) => (
                        <span key={i}>
                          {alert} &gt;80%{i < server.alerts.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Services by Group - Accordion */}
      <div className="space-y-3">
        {groups.map(group => (
          <div key={group}>
            {services[group] && services[group].length > 0 ? (
              services[group].map(server => {
                const sortedServices = server.services ? [...server.services].sort((a, b) => {
                  if (a.Status === 'Running' && b.Status !== 'Running') return -1;
                  if (a.Status !== 'Running' && b.Status === 'Running') return 1;
                  return a.DisplayName.localeCompare(b.DisplayName);
                }) : [];

                const serverKey = `${group}-${server.serverName}`;
                const isExpanded = expandedServer === serverKey;
                const isLoading = loadingServers[serverKey];
                const runningCount = sortedServices.filter(s => s.Status === 'Running').length;
                const isAvailable = server.available !== false;
                
                const systemMetrics = server.systemMetrics || {
                  cpuPercent: 0,
                  ramPercent: 0
                };

                if (isLoading) {
                  return <ServerSkeleton key={serverKey} />;
                }

                return (
                  <div 
                    key={serverKey} 
                    className={`bg-white dark:bg-gray-800 rounded-lg border shadow-sm overflow-hidden transition-all duration-300 ease-in-out animate-fadeIn ${
                      !isAvailable 
                        ? 'border-red-300 dark:border-red-700 opacity-75' 
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                    style={{
                      animation: 'fadeIn 0.3s ease-in-out'
                    }}
                  >
                    {/* Server Header - Clickable */}
                    <button
                      onClick={() => isAvailable && toggleServerExpansion(serverKey)}
                      disabled={!isAvailable}
                      className={`w-full p-5 flex items-center justify-between transition-colors ${
                        !isAvailable
                          ? 'cursor-not-allowed bg-gray-100 dark:bg-gray-900'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center space-x-4">
                        <FaServer className={`text-2xl ${
                          !isAvailable 
                            ? 'text-red-500' 
                            : 'text-orange-500'
                        }`} />
                        <div className="text-left">
                          <div className="flex items-center space-x-2">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{group}</h3>
                            {!isAvailable && (
                              <span className="flex items-center space-x-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-semibold px-2 py-1 rounded">
                                <FaCircle className="text-xs" />
                                <span>UNAVAILABLE</span>
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {server.serverName}
                            {!isAvailable && server.errorMessage && (
                              <span className="text-red-500 dark:text-red-400"> • {server.errorMessage}</span>
                            )}
                            {isAvailable && (
                              <span> • {runningCount} running / {sortedServices.length} total</span>
                            )}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-6">
                        {isAvailable && (
                          <>
                            {/* System Metrics Box */}
                            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-2 border border-gray-200 dark:border-gray-700">
                              <div className="flex items-center space-x-4">
                                {/* CPU Percentage */}
                                <div className="flex items-center space-x-2">
                                  <FaMicrochip className="text-blue-500 text-sm" />
                                  <div className="text-left">
                                    <p className="text-xs text-gray-500 dark:text-gray-400">CPU</p>
                                    <p className={`text-sm font-bold ${
                                      systemMetrics.cpuPercent > 80 
                                        ? 'text-red-600 dark:text-red-400' 
                                        : 'text-gray-900 dark:text-white'
                                    }`}>
                                      {systemMetrics.cpuPercent}%
                                    </p>
                                  </div>
                                </div>
                                
                                {/* RAM Percentage */}
                                <div className="flex items-center space-x-2">
                                  <FaMemory className="text-purple-500 text-sm" />
                                  <div className="text-left">
                                    <p className="text-xs text-gray-500 dark:text-gray-400">RAM</p>
                                    <p className={`text-sm font-bold ${
                                      systemMetrics.ramPercent > 80 
                                        ? 'text-red-600 dark:text-red-400' 
                                        : 'text-gray-900 dark:text-white'
                                    }`}>
                                      {systemMetrics.ramPercent}%
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Running/Stopped indicators */}
                            <div className="flex items-center space-x-4">
                              <div className="flex items-center space-x-1">
                                <FaCircle className="text-green-500 text-xs" />
                                <span className="text-green-600 dark:text-green-400 font-medium text-sm">{runningCount}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <FaCircle className="text-red-500 text-xs" />
                                <span className="text-red-600 dark:text-red-400 font-medium text-sm">{sortedServices.length - runningCount}</span>
                              </div>
                            </div>
                            
                            {/* Chevron */}
                            {isExpanded ? (
                              <FaChevronUp className="text-gray-400 dark:text-gray-500 text-xl" />
                            ) : (
                              <FaChevronDown className="text-gray-400 dark:text-gray-500 text-xl" />
                            )}
                          </>
                        )}
                      </div>
                    </button>

                    {/* Services Grid - Shown when expanded and server is available */}
                    {isExpanded && isAvailable && (
                      <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-6 transition-colors duration-200">
                        {sortedServices.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {sortedServices.map((service, idx) => (
                              <ServiceCard key={idx} service={service} />
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-600 dark:text-gray-400 text-center py-4">No services found</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : null}
          </div>
        ))}
      </div>

      {/* Add fadeIn animation */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default Dashboard;