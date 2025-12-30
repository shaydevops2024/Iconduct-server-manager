// Full path: frontend/src/pages/Dashboard.js

import React, { useState, useEffect } from 'react';
import { servicesAPI } from '../services/api';
import { FaServer, FaCircle, FaSync, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import ServiceCard from '../components/ServiceCard';
import LoadingSpinner from '../components/LoadingSpinner';

const Dashboard = () => {
  const [services, setServices] = useState({});
  const [groups, setGroups] = useState([]);
  const [expandedServers, setExpandedServers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchServices = async () => {
    try {
      setRefreshing(true);
      const response = await servicesAPI.getAll();
      setServices(response.data.data);
      setGroups(response.data.groups);
      setLastUpdate(new Date());
      setError(null);
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
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchServices, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleServerExpansion = (serverKey) => {
    setExpandedServers(prev => ({
      ...prev,
      [serverKey]: !prev[serverKey]
    }));
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

      {/* Services by Group - Collapsible Server Sections */}
      <div className="space-y-3">
        {groups.map(group => (
          <div key={group}>
            {services[group] && services[group].length > 0 ? (
              services[group].map(server => {
                // Sort services: Running first, then Stopped
                const sortedServices = server.services ? [...server.services].sort((a, b) => {
                  if (a.Status === 'Running' && b.Status !== 'Running') return -1;
                  if (a.Status !== 'Running' && b.Status === 'Running') return 1;
                  return a.DisplayName.localeCompare(b.DisplayName);
                }) : [];

                const serverKey = `${group}-${server.serverName}`;
                const isExpanded = expandedServers[serverKey];
                const runningCount = sortedServices.filter(s => s.Status === 'Running').length;

                return (
                  <div key={serverKey} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden transition-colors duration-200">
                    {/* Server Header - Clickable */}
                    <button
                      onClick={() => toggleServerExpansion(serverKey)}
                      className="w-full p-5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <FaServer className="text-orange-500 text-2xl" />
                        <div className="text-left">
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white">{group}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {server.serverName} • {runningCount} running / {sortedServices.length} total
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {/* Running/Stopped indicators */}
                        <div className="flex items-center space-x-4 mr-4">
                          <div className="flex items-center space-x-1">
                            <FaCircle className="text-green-500 text-xs" />
                            <span className="text-green-600 dark:text-green-400 font-medium text-sm">{runningCount}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <FaCircle className="text-red-500 text-xs" />
                            <span className="text-red-600 dark:text-red-400 font-medium text-sm">{sortedServices.length - runningCount}</span>
                          </div>
                        </div>
                        {isExpanded ? (
                          <FaChevronUp className="text-gray-400 dark:text-gray-500 text-xl" />
                        ) : (
                          <FaChevronDown className="text-gray-400 dark:text-gray-500 text-xl" />
                        )}
                      </div>
                    </button>

                    {/* Services Grid - Shown when expanded */}
                    {isExpanded && (
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