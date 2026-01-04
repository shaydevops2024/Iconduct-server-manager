// Full path: frontend/src/pages/Dashboard.js

import React, { useState, useEffect } from 'react';
import { servicesAPI } from '../services/api';
import { FaServer, FaCircle, FaSync, FaChevronDown, FaChevronUp, FaMicrochip, FaMemory } from 'react-icons/fa';
import ServiceCard from '../components/ServiceCard';
import LoadingSpinner from '../components/LoadingSpinner';

const Dashboard = () => {
  // Initialize state with localStorage cache
  const [services, setServices] = useState(() => {
    const cached = localStorage.getItem('iconduct-services-data');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Only use cache if less than 1 minute old
        if (Date.now() - parsed.timestamp < 60000) {
          return parsed.data;
        }
      } catch (e) {
        console.error('Failed to parse cached services:', e);
      }
    }
    return {};
  });

  const [groups, setGroups] = useState(() => {
    const cached = localStorage.getItem('iconduct-services-groups');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < 60000) {
          return parsed.data;
        }
      } catch (e) {
        console.error('Failed to parse cached groups:', e);
      }
    }
    return [];
  });

  const [expandedServer, setExpandedServer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchServices = async () => {
    try {
      setRefreshing(true);
      const response = await servicesAPI.getAll();
      const newData = response.data.data;
      const newGroups = response.data.groups;
      
      setServices(newData);
      setGroups(newGroups);
      setLastUpdate(new Date());
      setError(null);
      
      // Cache in localStorage
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
      setError(err.response?.data?.error || 'Failed to fetch services');
      console.error('Error fetching services:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchServices();
    
    // Only refresh when tab is visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('👀 Tab visible - refreshing data');
        fetchServices();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Auto-refresh every 30 seconds, but only if tab is visible
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchServices();
      } else {
        console.log('🙈 Tab hidden - skipping refresh');
      }
    }, 30000);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const toggleServerExpansion = (serverKey) => {
    if (expandedServer === serverKey) {
      setExpandedServer(null);
    } else {
      setExpandedServer(serverKey);
    }
  };

  const getServiceStats = () => {
    let running = 0;
    let stopped = 0;
    let total = 0;

    Object.values(services).forEach(group => {
      group.forEach(server => {
        server.services.forEach(service => {
          total++;
          if (service.Status === 'Running') {
            running++;
          } else {
            stopped++;
          }
        });
      });
    });

    return { running, stopped, total };
  };

  const stats = getServiceStats();

  if (loading) {
    return <LoadingSpinner message="Loading services..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
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
          onClick={fetchServices}
          disabled={refreshing}
          className="flex items-center space-x-2 bg-orange-500 text-white px-4 py-2 rounded-lg 
                   hover:bg-orange-600 transition-all disabled:opacity-50 shadow-md"
        >
          <FaSync className={refreshing ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Total Services</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            </div>
            <FaServer className="text-orange-500 text-4xl" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Running</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.running}</p>
            </div>
            <FaCircle className="text-green-500 text-4xl" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Stopped</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.stopped}</p>
            </div>
            <FaCircle className="text-red-500 text-4xl" />
          </div>
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
                const runningCount = sortedServices.filter(s => s.Status === 'Running').length;
                const isAvailable = server.available !== false;
                
                // Get system metrics - now with percentages
                const systemMetrics = server.systemMetrics || {
                  cpuPercent: 0,
                  ramPercent: 0
                };

                return (
                  <div key={serverKey} className={`bg-white dark:bg-gray-800 rounded-lg border shadow-sm overflow-hidden transition-colors duration-200 ${
                    !isAvailable 
                      ? 'border-red-300 dark:border-red-700 opacity-75' 
                      : 'border-gray-200 dark:border-gray-700'
                  }`}>
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
                        {/* System Metrics Box - Only show for available servers */}
                        {isAvailable && (
                          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-2 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center space-x-4">
                              {/* CPU Percentage */}
                              <div className="flex items-center space-x-2">
                                <FaMicrochip className="text-blue-500 text-sm" />
                                <div className="text-left">
                                  <p className="text-xs text-gray-500 dark:text-gray-400">CPU</p>
                                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                                    {systemMetrics.cpuPercent}%
                                  </p>
                                </div>
                              </div>
                              
                              {/* RAM Percentage */}
                              <div className="flex items-center space-x-2">
                                <FaMemory className="text-purple-500 text-sm" />
                                <div className="text-left">
                                  <p className="text-xs text-gray-500 dark:text-gray-400">RAM</p>
                                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                                    {systemMetrics.ramPercent}%
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Running/Stopped indicators - Only for available servers */}
                        {isAvailable && (
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
                        )}
                        
                        {/* Chevron - Only for available servers */}
                        {isAvailable && (
                          <>
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
    </div>
  );
};

export default Dashboard;