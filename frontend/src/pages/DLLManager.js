// Full path: frontend/src/pages/DLLManager.js

import React, { useState, useEffect } from 'react';
import { dllAPI } from '../services/api';
import { FaFolder, FaSync, FaChevronDown, FaChevronUp, FaServer, FaBalanceScale, FaTimes } from 'react-icons/fa';
import LoadingSpinner from '../components/LoadingSpinner';

const DLLManager = () => {
  const [allDLLs, setAllDLLs] = useState([]);
  const [expandedServer, setExpandedServer] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);
  
  // Comparison modal state
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareSourceServer, setCompareSourceServer] = useState('');
  const [compareFolderName, setCompareFolderName] = useState('');
  const [compareTargetServer, setCompareTargetServer] = useState('');
  const [comparisonResult, setComparisonResult] = useState(null);

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
    if (expandedServer === serverName) {
      setExpandedServer(null);
    } else {
      setExpandedServer(serverName);
    }
  };

  const toggleFolderExpansion = (serverName, folderName) => {
    const key = `${serverName}-${folderName}`;
    setExpandedFolders(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const openCompareModal = (serverName, folderName) => {
    setCompareSourceServer(serverName);
    setCompareFolderName(folderName);
    setCompareTargetServer('');
    setComparisonResult(null);
    setShowCompareModal(true);
  };

  const closeCompareModal = () => {
    setShowCompareModal(false);
    setCompareSourceServer('');
    setCompareFolderName('');
    setCompareTargetServer('');
    setComparisonResult(null);
  };

  const performComparison = () => {
    if (!compareTargetServer) {
      return;
    }

    const sourceServer = allDLLs.find(s => s.serverName === compareSourceServer);
    const targetServer = allDLLs.find(s => s.serverName === compareTargetServer);

    if (!sourceServer || !targetServer) {
      setComparisonResult({
        error: 'Server data not found'
      });
      return;
    }

    const sourceFolders = getServerFolders(sourceServer);
    const targetFolders = getServerFolders(targetServer);

    const sourceFolder = sourceFolders.find(f => f.folderName === compareFolderName);
    const targetFolder = targetFolders.find(f => f.folderName === compareFolderName);

    if (!sourceFolder) {
      setComparisonResult({
        error: `Folder "${compareFolderName}" not found on ${compareSourceServer}`
      });
      return;
    }

    if (!targetFolder) {
      setComparisonResult({
        match: false,
        sourceVersion: sourceFolder.latestVersion,
        targetVersion: 'Not Found',
        folderNotFound: true
      });
      return;
    }

    const match = sourceFolder.latestVersion === targetFolder.latestVersion;

    setComparisonResult({
      match,
      sourceVersion: sourceFolder.latestVersion,
      targetVersion: targetFolder.latestVersion
    });
  };

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

  // NEW: Filter servers based on DLL folder names, not server names
  const filteredServers = allDLLs.map(server => {
    const folders = getServerFolders(server);
    
    // If no search term, return server with all folders
    if (!searchTerm.trim()) {
      return { ...server, folders };
    }
    
    // Filter folders by search term
    const matchingFolders = folders.filter(folder =>
      folder.folderName.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Only include server if it has matching folders
    if (matchingFolders.length > 0) {
      return { ...server, folders: matchingFolders };
    }
    
    return null;
  }).filter(server => server !== null);

  const availableServers = allDLLs.filter(s => s.serverName !== compareSourceServer);

  if (loading) {
    return <LoadingSpinner message="Loading DLL information..." />;
  }

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

      {/* Search - NOW searches DLL folder names */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200">
        <input
          type="text"
          placeholder="Search DLL folders by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white px-4 py-3 rounded-lg 
                   border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-orange-500 
                   focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-800 transition-all"
        />
        {searchTerm && (
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">
            Showing servers with DLL folders matching "{searchTerm}"
          </p>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Server Sections (Accordion) */}
      <div className="space-y-3">
        {filteredServers.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 border border-gray-200 dark:border-gray-700 shadow-sm text-center transition-colors duration-200">
            <p className="text-gray-600 dark:text-gray-400">
              {searchTerm ? `No DLL folders found matching "${searchTerm}"` : 'No servers found'}
            </p>
          </div>
        ) : (
          filteredServers.map((serverData) => {
            const isExpanded = expandedServer === serverData.serverName;

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
                        {serverData.serverName} • {serverData.folders.length} folders{searchTerm && ' (filtered)'}
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
                    {serverData.folders.length === 0 ? (
                      <p className="text-gray-600 dark:text-gray-400 text-center py-4">No DLL folders found</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {serverData.folders.map((folder) => {
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

                                {/* Compare Button */}
                                <button
                                  onClick={() => openCompareModal(serverData.serverName, folder.folderName)}
                                  className="w-full flex items-center justify-center space-x-2 bg-blue-500 hover:bg-blue-600 
                                           text-white px-3 py-2 rounded-lg transition-all mb-3"
                                >
                                  <FaBalanceScale className="text-sm" />
                                  <span className="text-sm font-medium">Compare DLL</span>
                                </button>

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

      {/* Compare Modal */}
      {showCompareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <FaBalanceScale className="text-orange-500 text-2xl" />
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Compare DLL Versions</h3>
              </div>
              <button
                onClick={closeCompareModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <FaTimes className="text-2xl" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Comparing from:</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{compareSourceServer}</p>
                <p className="text-md text-orange-600 dark:text-orange-400 font-semibold mt-1">
                  Folder: {compareFolderName}
                </p>
              </div>

              {!comparisonResult && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Compare with:
                  </label>
                  <select
                    value={compareTargetServer}
                    onChange={(e) => setCompareTargetServer(e.target.value)}
                    className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3
                             text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Select a server...</option>
                    {availableServers.map(server => (
                      <option key={server.serverName} value={server.serverName}>
                        {server.serverGroup} ({server.serverName})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {comparisonResult && (
                <div className={`rounded-lg p-6 border-2 ${
                  comparisonResult.error 
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                    : comparisonResult.match 
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                      : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700'
                }`}>
                  {comparisonResult.error ? (
                    <p className="text-red-600 dark:text-red-400 font-medium">{comparisonResult.error}</p>
                  ) : comparisonResult.folderNotFound ? (
                    <div className="space-y-3">
                      <p className="text-yellow-700 dark:text-yellow-300 font-semibold text-lg">
                        Folder not found on target server
                      </p>
                      <div className="bg-white dark:bg-gray-800 rounded p-4 space-y-2">
                        <p className="text-gray-900 dark:text-white">
                          On <span className="font-bold">{compareSourceServer}</span>, the latest version of DLL <span className="font-bold text-orange-600 dark:text-orange-400">{compareFolderName}</span> is: <span className="font-bold text-lg">{comparisonResult.sourceVersion}</span>
                        </p>
                        <p className="text-gray-900 dark:text-white">
                          On <span className="font-bold">{compareTargetServer}</span>, the folder <span className="font-bold text-orange-600 dark:text-orange-400">{compareFolderName}</span> was: <span className="font-bold text-red-600">Not Found</span>
                        </p>
                      </div>
                    </div>
                  ) : comparisonResult.match ? (
                    <div className="space-y-3">
                      <p className="text-green-700 dark:text-green-300 font-semibold text-lg">
                        ✓ Versions Match!
                      </p>
                      <div className="bg-white dark:bg-gray-800 rounded p-4">
                        <p className="text-gray-900 dark:text-white">
                          Both on server <span className="font-bold">{compareSourceServer}</span> and <span className="font-bold">{compareTargetServer}</span>, the latest DLL is:
                        </p>
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
                          {comparisonResult.sourceVersion}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-yellow-700 dark:text-yellow-300 font-semibold text-lg">
                        ⚠ Versions Differ
                      </p>
                      <div className="bg-white dark:bg-gray-800 rounded p-4 space-y-3">
                        <p className="text-gray-900 dark:text-white">
                          On <span className="font-bold">{compareSourceServer}</span>, the latest version of DLL <span className="font-bold text-orange-600 dark:text-orange-400">{compareFolderName}</span> is: <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{comparisonResult.sourceVersion}</span>
                        </p>
                        <div className="h-px bg-gray-300 dark:bg-gray-600"></div>
                        <p className="text-gray-900 dark:text-white">
                          On <span className="font-bold">{compareTargetServer}</span>, the latest version of DLL <span className="font-bold text-orange-600 dark:text-orange-400">{compareFolderName}</span> is: <span className="font-bold text-lg text-purple-600 dark:text-purple-400">{comparisonResult.targetVersion}</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-3">
                {!comparisonResult ? (
                  <>
                    <button
                      onClick={closeCompareModal}
                      className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300
                               hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={performComparison}
                      disabled={!compareTargetServer}
                      className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Compare
                    </button>
                  </>
                ) : (
                  <button
                    onClick={closeCompareModal}
                    className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DLLManager;
