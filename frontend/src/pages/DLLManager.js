// Full path: frontend/src/pages/DLLManager.js

import React, { useState, useEffect } from 'react';

import { dllAPI } from '../services/api';

import { FaFolder, FaSync, FaChevronDown, FaChevronUp, FaServer, FaBalanceScale, FaTimes, FaUpload, FaSpinner, FaExclamationTriangle } from 'react-icons/fa';

import LoadingSpinner from '../components/LoadingSpinner';



const DLLManager = () => {

  const [allDLLs, setAllDLLs] = useState([]);

  const [expandedServer, setExpandedServer] = useState(null);

  const [expandedFolders, setExpandedFolders] = useState({});

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');

  const [lastUpdate, setLastUpdate] = useState(null);

  const [refreshing, setRefreshing] = useState(false);

  

  const [showCompareModal, setShowCompareModal] = useState(false);

  const [compareSourceServer, setCompareSourceServer] = useState('');

  const [compareFolderName, setCompareFolderName] = useState('');

  const [compareTargetServer, setCompareTargetServer] = useState('');

  const [comparisonResult, setComparisonResult] = useState(null);



  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const [updateSourceServer, setUpdateSourceServer] = useState('');

  const [updateTargetServer, setUpdateTargetServer] = useState('');

  const [updateDllName, setUpdateDllName] = useState('');

  const [updateVersion, setUpdateVersion] = useState('');

  const [updating, setUpdating] = useState(false);

  const [updateResult, setUpdateResult] = useState(null);



  const fetchDLLs = async (forceRefresh = false) => {

    if (forceRefresh) {

      setRefreshing(true);

    } else {

      setLoading(true);

    }

    setError(null);



    try {

      let response;

      if (forceRefresh) {

        console.log('🔄 Force refreshing DLL data from servers...');

        response = await dllAPI.refresh();

      } else {

        console.log('📦 Loading DLL data (from cache if available)...');

        response = await dllAPI.getAll();

      }

      

      setAllDLLs(response.data.data);

      setLastUpdate(response.data.lastRefresh ? new Date(response.data.lastRefresh) : new Date());

      

      if (response.data.cached && !forceRefresh) {

        console.log('✅ Loaded from cache');

      } else {

        console.log('✅ Fresh data loaded');

      }

    } catch (err) {

      setError(err.response?.data?.error || 'Failed to fetch DLL information');

      console.error('Error fetching DLLs:', err);

    } finally {

      setLoading(false);

      setRefreshing(false);

    }

  };



  // Load data once when component mounts - NO AUTO-REFRESH

  useEffect(() => {

    fetchDLLs(false);

  }, []);



  const toggleServerExpansion = (serverName) => {

    setExpandedServer(expandedServer === serverName ? null : serverName);

  };



  const toggleFolderExpansion = (serverName, folderName) => {

    const key = `${serverName}-${folderName}`;

    setExpandedFolders(prev => ({ ...prev, [key]: !prev[key] }));

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



  const openUpdateModal = () => {

    setUpdateSourceServer('');

    setUpdateTargetServer('');

    setUpdateDllName('');

    setUpdateVersion('');

    setUpdateResult(null);

    setShowUpdateModal(true);

  };



  const closeUpdateModal = () => {

    setShowUpdateModal(false);

    setUpdateSourceServer('');

    setUpdateTargetServer('');

    setUpdateDllName('');

    setUpdateVersion('');

    setUpdateResult(null);

  };



  const handleUpdateConfirm = async () => {

    setUpdating(true);

    setUpdateResult(null);



    try {

      const response = await dllAPI.update(

        updateSourceServer,

        updateTargetServer,

        updateDllName,

        updateVersion

      );



      setUpdateResult({

        success: true,

        message: response.data.message,

        data: response.data.data

      });



      setTimeout(() => fetchDLLs(), 1000);

    } catch (err) {

      setUpdateResult({

        success: false,

        message: err.response?.data?.error || 'Failed to update DLL'

      });

      console.error('DLL update error:', err);

    } finally {

      setUpdating(false);

    }

  };



  const getSourceDllNames = () => {

    if (!updateSourceServer) return [];

    const sourceServer = allDLLs.find(s => s.serverName === updateSourceServer);

    if (!sourceServer) return [];

    const folders = getServerFolders(sourceServer);

    return folders.map(f => f.folderName).sort();

  };



  const getAvailableVersions = () => {

    if (!updateSourceServer || !updateDllName) return [];

    const sourceServer = allDLLs.find(s => s.serverName === updateSourceServer);

    if (!sourceServer) return [];

    const folders = getServerFolders(sourceServer);

    const selectedFolder = folders.find(f => f.folderName === updateDllName);

    return selectedFolder ? selectedFolder.allVersions || [] : [];

  };



  const performComparison = () => {

    if (!compareTargetServer) return;



    const sourceServer = allDLLs.find(s => s.serverName === compareSourceServer);

    const targetServer = allDLLs.find(s => s.serverName === compareTargetServer);



    if (!sourceServer || !targetServer) {

      setComparisonResult({ error: 'Server data not found' });

      return;

    }



    const sourceFolders = getServerFolders(sourceServer);

    const targetFolders = getServerFolders(targetServer);

    const sourceFolder = sourceFolders.find(f => f.folderName === compareFolderName);

    const targetFolder = targetFolders.find(f => f.folderName === compareFolderName);



    if (!sourceFolder) {

      setComparisonResult({ error: `Folder "${compareFolderName}" not found on ${compareSourceServer}` });

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



    setComparisonResult({

      match: sourceFolder.latestVersion === targetFolder.latestVersion,

      sourceVersion: sourceFolder.latestVersion,

      targetVersion: targetFolder.latestVersion

    });

  };



  const getServerFolders = (serverData) => {

    const folderMap = new Map();

    

    if (serverData.dlls && serverData.dlls.length > 0) {

      serverData.dlls.forEach(dll => {

        if (!folderMap.has(dll.Folder)) {

          folderMap.set(dll.Folder, { folderName: dll.Folder, dlls: [] });

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



  const filteredServers = allDLLs.map(server => {

    const folders = getServerFolders(server);

    if (!searchTerm.trim()) return { ...server, folders };

    const matchingFolders = folders.filter(folder =>

      folder.folderName.toLowerCase().includes(searchTerm.toLowerCase())

    );

    return matchingFolders.length > 0 ? { ...server, folders: matchingFolders } : null;

  }).filter(server => server !== null);



  const availableServers = allDLLs.filter(s => s.serverName !== compareSourceServer);

  const availableTargetServers = allDLLs.filter(s => s.serverName !== updateSourceServer);



  if (loading) return <LoadingSpinner message="Loading DLL information..." />;



  return (

    <div className="space-y-6">

      <div className="flex items-center justify-between">

        <div>

          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">DLL Manager</h2>

          <p className="text-gray-600 dark:text-gray-400">Manage and compare DLL versions by server</p>

          {lastUpdate && (

            <p className="text-gray-500 text-sm mt-1">
              Last updated: {lastUpdate.toLocaleTimeString()} on {lastUpdate.toLocaleDateString()}
            </p>

          )}

        </div>

        <div className="flex space-x-3">

          <button onClick={openUpdateModal} className="flex items-center space-x-2 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-all shadow-md">

            <FaUpload />

            <span>Update DLL</span>

          </button>

          <button 
            onClick={() => fetchDLLs(true)} 
            disabled={refreshing}
            className="flex items-center space-x-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-all disabled:opacity-50 shadow-md"
          >

            <FaSync className={refreshing ? 'animate-spin' : ''} />

            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>

          </button>

        </div>

      </div>



      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm">

        <input

          type="text"

          placeholder="Search DLL folders by name..."

          value={searchTerm}

          onChange={(e) => setSearchTerm(e.target.value)}

          className="w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-orange-500"

        />

      </div>



      {error && (

        <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-4">

          <p className="text-red-600 dark:text-red-400">{error}</p>

        </div>

      )}



      <div className="space-y-3">

        {filteredServers.length === 0 ? (

          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 border border-gray-200 dark:border-gray-700 shadow-sm text-center">

            <p className="text-gray-600 dark:text-gray-400">

              {searchTerm ? `No DLL folders found matching "${searchTerm}"` : 'No servers found'}

            </p>

          </div>

        ) : (

          filteredServers.map((serverData) => {

            const isExpanded = expandedServer === serverData.serverName;



            return (

              <div key={serverData.serverName} className={`bg-white dark:bg-gray-800 rounded-lg border shadow-sm overflow-hidden ${
                serverData.available === false 
                  ? 'border-red-300 dark:border-red-700 opacity-75' 
                  : 'border-gray-200 dark:border-gray-700'
              }`}>

                <button

                  onClick={() => serverData.available !== false && toggleServerExpansion(serverData.serverName)}

                  disabled={serverData.available === false}

                  className={`w-full p-5 flex items-center justify-between transition-colors ${
                    serverData.available === false
                      ? 'cursor-not-allowed bg-gray-100 dark:bg-gray-900'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}

                >

                  <div className="flex items-center space-x-4">

                    <FaServer className={`text-2xl ${
                      serverData.available === false 
                        ? 'text-red-500' 
                        : 'text-orange-500'
                    }`} />

                    <div className="text-left">

                      <div className="flex items-center space-x-2">

                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{serverData.serverGroup}</h3>

                        {serverData.available === false && (

                          <span className="flex items-center space-x-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-semibold px-2 py-1 rounded">

                            <FaExclamationTriangle className="text-xs" />

                            <span>UNAVAILABLE</span>

                          </span>

                        )}

                      </div>

                      <p className="text-sm text-gray-600 dark:text-gray-400">

                        {serverData.serverName}

                        {serverData.available === false && serverData.errorMessage && (

                          <span className="text-red-500 dark:text-red-400"> • {serverData.errorMessage}</span>

                        )}

                        {serverData.available !== false && (

                          <span> • {serverData.folders.length} folders{searchTerm && ' (filtered)'}</span>

                        )}

                      </p>

                    </div>

                  </div>

                  <div className="flex items-center space-x-3">

                    {serverData.available !== false && (

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



                {isExpanded && serverData.available !== false && (

                  <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-6">

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

                              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-orange-400 dark:hover:border-orange-500 hover:shadow-md transition-all"

                            >

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



                              <div className="p-4">

                                <div className="mb-3">

                                  <p className="text-gray-600 dark:text-gray-400 text-xs mb-1">Latest Version</p>

                                  <p className="text-orange-600 dark:text-orange-400 text-2xl font-bold">

                                    {folder.latestVersion}

                                  </p>

                                </div>



                                <button

                                  onClick={() => openCompareModal(serverData.serverName, folder.folderName)}

                                  className="w-full flex items-center justify-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg transition-all mb-3"

                                >

                                  <FaBalanceScale className="text-sm" />

                                  <span className="text-sm font-medium">Compare DLL</span>

                                </button>



                                {folder.previousVersions.length > 0 && (

                                  <div className="mt-3">

                                    <button

                                      onClick={() => toggleFolderExpansion(serverData.serverName, folder.folderName)}

                                      className="w-full flex items-center justify-between bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-left border border-gray-200 dark:border-gray-700"

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



      {showUpdateModal && (

        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">

              <div className="flex items-center space-x-3">

                <FaUpload className="text-green-500 text-2xl" />

                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Update DLL</h3>

              </div>

              <button

                onClick={closeUpdateModal}

                disabled={updating}

                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"

              >

                <FaTimes className="text-2xl" />

              </button>

            </div>



            <div className="p-6 space-y-5">

              {!updateResult && (

                <>

                  <div>

                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">

                      Source Server *

                    </label>

                    <select

                      value={updateSourceServer}

                      onChange={(e) => {

                        setUpdateSourceServer(e.target.value);

                        setUpdateDllName('');

                        setUpdateVersion('');

                      }}

                      disabled={updating}

                      className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"

                    >

                      <option value="">Select source server...</option>

                      {allDLLs.map(server => (

                        <option key={server.serverName} value={server.serverName}>

                          {server.serverGroup} ({server.serverName})

                        </option>

                      ))}

                    </select>

                  </div>



                  <div>

                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">

                      Target Server *

                    </label>

                    <select

                      value={updateTargetServer}

                      onChange={(e) => setUpdateTargetServer(e.target.value)}

                      disabled={!updateSourceServer || updating}

                      className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"

                    >

                      <option value="">Select target server...</option>

                      {availableTargetServers.map(server => (

                        <option key={server.serverName} value={server.serverName}>

                          {server.serverGroup} ({server.serverName})

                        </option>

                      ))}

                    </select>

                  </div>



                  <div>

                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">

                      DLL Name *

                    </label>

                    <select

                      value={updateDllName}

                      onChange={(e) => {

                        setUpdateDllName(e.target.value);

                        setUpdateVersion('');

                      }}

                      disabled={!updateSourceServer || updating}

                      className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"

                    >

                      <option value="">Select DLL name...</option>

                      {getSourceDllNames().map(name => (

                        <option key={name} value={name}>

                          {name}

                        </option>

                      ))}

                    </select>

                  </div>



                  <div>

                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">

                      Version *

                    </label>

                    <select

                      value={updateVersion}

                      onChange={(e) => setUpdateVersion(e.target.value)}

                      disabled={!updateDllName || updating}

                      className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"

                    >

                      <option value="">Select version...</option>

                      {getAvailableVersions().map(version => (

                        <option key={version} value={version}>

                          {version}

                        </option>

                      ))}

                    </select>

                  </div>



                  {updateSourceServer && updateTargetServer && updateDllName && updateVersion && !updating && (

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">

                      <p className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-2">

                        Ready to update:

                      </p>

                      <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">

                        <li>• <strong>From:</strong> {updateSourceServer}</li>

                        <li>• <strong>To:</strong> {updateTargetServer}</li>

                        <li>• <strong>DLL:</strong> {updateDllName}</li>

                        <li>• <strong>Version:</strong> {updateVersion}</li>

                      </ul>

                    </div>

                  )}



                  {updating && (

                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">

                      <div className="flex items-center space-x-3">

                        <FaSpinner className="animate-spin text-yellow-600 dark:text-yellow-400 text-xl" />

                        <div>

                          <p className="text-sm font-medium text-gray-900 dark:text-white">

                            Updating DLL...

                          </p>

                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">

                            This may take a few minutes. Please wait...

                          </p>

                        </div>

                      </div>

                    </div>

                  )}

                </>

              )}



              {updateResult && (

                <div className={`rounded-lg p-6 border-2 ${

                  updateResult.success

                    ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'

                    : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'

                }`}>

                  <p className={`font-semibold text-lg mb-3 ${

                    updateResult.success

                      ? 'text-green-700 dark:text-green-300'

                      : 'text-red-700 dark:text-red-300'

                  }`}>

                    {updateResult.success ? '✓ Update Successful!' : '✗ Update Failed'}

                  </p>

                  <p className="text-gray-900 dark:text-white mb-4">

                    {updateResult.message}

                  </p>

                  {updateResult.success && updateResult.data && (

                    <div className="bg-white dark:bg-gray-800 rounded p-4 text-sm">

                      <p className="text-gray-600 dark:text-gray-400 mb-2">Details:</p>

                      <ul className="text-gray-900 dark:text-white space-y-1">

                        <li>• Files copied: {updateResult.data.filesCopied}</li>

                        <li>• Source: {updateResult.data.sourcePath}</li>

                        <li>• Target: {updateResult.data.targetPath}</li>

                      </ul>

                    </div>

                  )}

                </div>

              )}



              <div className="flex justify-end space-x-3 pt-4">

                {!updateResult ? (

                  <>

                    <button

                      onClick={closeUpdateModal}

                      disabled={updating}

                      className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

                    >

                      Cancel

                    </button>

                    <button

                      onClick={handleUpdateConfirm}

                      disabled={!updateSourceServer || !updateTargetServer || !updateDllName || !updateVersion || updating}

                      className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"

                    >

                      {updating && <FaSpinner className="animate-spin" />}

                      <span>Confirm</span>

                    </button>

                  </>

                ) : (

                  <button

                    onClick={closeUpdateModal}

                    className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"

                  >

                    Close

                  </button>

                )}

              </div>

            </div>

          </div>

        </div>

      )}



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

                    className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"

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

                      className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"

                    >

                      Cancel

                    </button>

                    <button

                      onClick={performComparison}

                      disabled={!compareTargetServer}

                      className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

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