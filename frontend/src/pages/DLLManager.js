// Full path: frontend/src/pages/DLLManager.js

import React, { useState, useEffect } from 'react';
import { dllAPI } from '../services/api';
import { FaFolder, FaSync, FaChevronDown, FaChevronUp, FaServer } from 'react-icons/fa';
import LoadingSpinner from '../components/LoadingSpinner';

const DLLManager = () => {
  const [allDLLs, setAllDLLs] = useState([]);
  const [expandedServers, setExpandedServers] = useState({});
  const [expandedFolders, setExpandedFolders] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchDLLs = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await dllAPI.getAll();
      setAllDLLs(response.data.data);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch DLL information');
      console.error('Error fetching DLLs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDLLs();
  }, []);

  const toggleServerExpansion = (serverName) => {
    setExpandedServers(prev => ({
      ...prev,
      [serverName]: !prev[serverName]
    }));
  };

  const toggleFolderExpansion = (serverName, folderName) => {
    const key = `${serverName}-${folderName}`;
    setExpandedFolders(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Group DLLs by server and folder
  const getServerFolders = (serverData) => {
    const folderMap = new Map();
    
    if (serverData.dlls && serverData.dlls.length > 0) {
      serverData.dlls.forEach(dll => {
        if (!folderMap.has(dll.Folder)) {
          folderMap.set(dll.Folder, {
            folderName: dll.Folder,
            dlls: []
          });
        }
        folderMap.get(dll.Folder).dlls.push(dll);
      });
    }

    // Convert to array and add version info
    return Array.from(folderMap.values()).map(folder => {
      const versions = folder.dlls
        .map(dll => dll.Version)
        .filter((v, i, arr) => v && v !== 'N/A' && arr.indexOf(v) === i)
        .sort((a, b) => compareVersions(b, a));
      
      return {
        folderName: folder.folderName,
        latestVersion: versions[0] || 'N/A',
        previousVersions: versions.slice(1),
        dllCount: folder.dlls.length,
        allVersions: versions
      };
    }).sort((a, b) => a.folderName.localeCompare(b.folderName));
  };

  const compareVersions = (v1, v2) => {
    if (!v1 || v1 === 'N/A') return -1;
    if (!v2 || v2 === 'N/A') return 1;
    
    const parts1 = v1.split('.').map(n => parseInt(n) || 0);
    const parts2 = v2.split('.').map(n => parseInt(n) || 0);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  };

  const filteredServers = allDLLs.filter(server =>
    server.serverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    server.serverGroup.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <LoadingSpinner message="Loading DLL information..." />;
  }

  const totalFolders = allDLLs.reduce((sum, s) => sum + getServerFolders(s).length, 0);
  const totalDLLs = allDLLs.reduce((sum, s) => sum + (s.dlls?.length || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">DLL Manager</h2>
          <p className="text-gray-600 dark:text-gray-400">Manage and compare DLL versions by server</p>
          {lastUpdate && (
            <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={fetchDLLs}
          className="flex items-center space-x-2 bg-orange-500 text-white px-4 py-2 rounded-lg 
                   hover:bg-orange-600 transition-all shadow-md"
        >
          <FaSync />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Total Servers</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{allDLLs.length}</p>
            </div>
            <FaServer className="text-orange-500 text-4xl" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Total Folders</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalFolders}</p>
            </div>
            <FaFolder className="text-orange-500 text-4xl" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Total DLLs</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalDLLs}</p>
            </div>
            <FaSync className="text-orange-500 text-4xl" />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200">
        <input
          type="text"
          placeholder="Search by server name or group..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white px-4 py-3 rounded-lg 
                   border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-orange-500 
                   focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-800 transition-all"
        />
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Server Sections */}
      <div className="space-y-3">
        {filteredServers.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 border border-gray-200 dark:border-gray-700 shadow-sm text-center transition-colors duration-200">
            <p className="text-gray-600 dark:text-gray-400">No servers found</p>
          </div>
        ) : (
          filteredServers.map((serverData) => {
            const folders = getServerFolders(serverData);
            const isExpanded = expandedServers[serverData.serverName];

            return (
              <div key={serverData.serverName} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden transition-colors duration-200">
                {/* Server Header - Clickable */}
                <button
                  onClick={() => toggleServerExpansion(serverData.serverName)}
                  className="w-full p-5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <FaServer className="text-orange-500 text-2xl" />
                    <div className="text-left">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">{serverData.serverGroup}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {serverData.serverName} • {folders.length} folders • {serverData.dlls?.length || 0} DLLs
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {isExpanded ? (
                      <FaChevronUp className="text-gray-400 dark:text-gray-500 text-xl" />
                    ) : (
                      <FaChevronDown className="text-gray-400 dark:text-gray-500 text-xl" />
                    )}
                  </div>
                </button>

                {/* Folders Grid - Shown when expanded */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-6 transition-colors duration-200">
                    {folders.length === 0 ? (
                      <p className="text-gray-600 dark:text-gray-400 text-center py-4">No DLL folders found</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {folders.map((folder) => {
                          const folderKey = `${serverData.serverName}-${folder.folderName}`;
                          const isFolderExpanded = expandedFolders[folderKey];

                          return (
                            <div 
                              key={folder.folderName} 
                              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden 
                                       hover:border-orange-400 dark:hover:border-orange-500 hover:shadow-md transition-all"
                            >
                              {/* Folder Header */}
                              <div className="p-4 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center space-x-2 mb-2">
                                  <FaFolder className="text-orange-500 text-xl" />
                                  <h4 className="text-gray-900 dark:text-white font-semibold text-base truncate" title={folder.folderName}>
                                    {folder.folderName}
                                  </h4>
                                </div>
                                <p className="text-gray-600 dark:text-gray-400 text-xs">
                                  {folder.dllCount} DLL{folder.dllCount !== 1 ? 's' : ''}
                                </p>
                              </div>

                              {/* Latest Version */}
                              <div className="p-4">
                                <div className="mb-3">
                                  <p className="text-gray-600 dark:text-gray-400 text-xs mb-1">Latest Version</p>
                                  <p className="text-orange-600 dark:text-orange-400 text-2xl font-bold">
                                    {folder.latestVersion}
                                  </p>
                                </div>

                                {/* Previous Versions Dropdown */}
                                {folder.previousVersions.length > 0 && (
                                  <div className="mt-3">
                                    <button
                                      onClick={() => toggleFolderExpansion(serverData.serverName, folder.folderName)}
                                      className="w-full flex items-center justify-between bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-lg
                                               hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-left 
                                               border border-gray-200 dark:border-gray-700"
                                    >
                                      <span className="text-gray-900 dark:text-white text-sm font-medium">
                                        Previous Versions ({folder.previousVersions.length})
                                      </span>
                                      {isFolderExpanded ? (
                                        <FaChevronUp className="text-gray-400 dark:text-gray-500 text-sm" />
                                      ) : (
                                        <FaChevronDown className="text-gray-400 dark:text-gray-500 text-sm" />
                                      )}
                                    </button>

                                    {/* Expanded Previous Versions */}
                                    {isFolderExpanded && (
                                      <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                                        {folder.previousVersions.map((version, idx) => (
                                          <div 
                                            key={idx}
                                            className="bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded border border-gray-200 dark:border-gray-700"
                                          >
                                            <p className="text-gray-900 dark:text-white font-medium text-sm">{version}</p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* No Previous Versions */}
                                {folder.previousVersions.length === 0 && (
                                  <p className="text-gray-500 dark:text-gray-500 text-xs text-center py-2">
                                    No previous versions
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DLLManager;
