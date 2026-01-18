// Full path: frontend/src/pages/AutomatedUpgrade.js

import React, { useState, useEffect, useRef } from 'react';
import { FaUpload, FaRocket, FaServer, FaCheckCircle, FaExclamationTriangle, FaSpinner, FaTimesCircle, FaFileArchive, FaClock, FaCloudUploadAlt, FaFileAlt, FaHistory, FaTrash, FaCircle } from 'react-icons/fa';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL !== undefined
  ? (process.env.REACT_APP_API_URL || '')
  : '';

const AutomatedUpgrade = () => {
  const [files, setFiles] = useState({
    backend: null,
    oldUI: null,
    newUI: null,
  });
  
  const [s3Keys, setS3Keys] = useState({
    backend: null,
    oldUI: null,
    newUI: null,
  });
  
  const [uploadProgress, setUploadProgress] = useState({
    backend: 0,
    oldUI: 0,
    newUI: 0,
  });
  
  const [uploading, setUploading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(null);
  
  // Server group selection
  const [serverGroups, setServerGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(true);
  
  // Server selection (which servers are selected)
  const [selectedServers, setSelectedServers] = useState({
    backend: false,
    fe1: false,
    fe2: false,
  });

  // FE1 UI type selection (only relevant if fe1 is selected)
  const [fe1UITypes, setFe1UITypes] = useState({
    oldUI: false,
    newUI: false,
  });
  
  const [servers, setServers] = useState({
    backend: null,
    fe1: null,
    fe2: null,
  });
  
  const [upgrading, setUpgrading] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(null);
  const [phaseProgress, setPhaseProgress] = useState([]);
  const [allPhases, setAllPhases] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionData, setCompletionData] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [upgradeLogs, setUpgradeLogs] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  
  // Logs history
  const [showLogsHistory, setShowLogsHistory] = useState(false);
  const [logsHistory, setLogsHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedLogFile, setSelectedLogFile] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [logToDelete, setLogToDelete] = useState(null);

  const pollingIntervalRef = useRef(null);
  const fileUploadRef = useRef(null);
  const spinnerRef = useRef(null);

  // Auto-scroll to file upload section when servers are selected
  useEffect(() => {
    const hasSelection = selectedServers.backend || selectedServers.fe1 || selectedServers.fe2;
    if (hasSelection && fileUploadRef.current && selectedGroup) {
      setTimeout(() => {
        fileUploadRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [selectedServers, selectedGroup]);

  // Auto-scroll to spinner when upgrade starts
  useEffect(() => {
    if (upgrading && spinnerRef.current) {
      setTimeout(() => {
        spinnerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [upgrading]);

  // Update phase statuses as backend reports progress
  useEffect(() => {
    if (phaseProgress.length > 0) {
      setAllPhases(phaseProgress);
    }
  }, [phaseProgress]);

  // Start/stop polling for live updates
  useEffect(() => {
    if (upgrading) {
      const upgradeKey = getUpgradeKey();
      
      pollingIntervalRef.current = setInterval(() => {
        pollUpgradeStatus(upgradeKey);
      }, 3000);
      
      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      };
    }
  }, [upgrading, selectedGroup, selectedServers, fe1UITypes]);

  const getUpgradeKey = () => {
    const parts = [selectedGroup];
    if (selectedServers.backend) parts.push('backend');
    if (selectedServers.fe1 && fe1UITypes.oldUI) parts.push('fe1');
    if (selectedServers.fe2) parts.push('fe2');
    if (selectedServers.fe1 && fe1UITypes.newUI) parts.push('newUI');
    return parts.join('_');
  };

  const pollUpgradeStatus = async (upgradeKey) => {
    try {
      const response = await axios.get(`${API_URL}/api/upgrade/status/${upgradeKey}`);
      
      if (response.data.success && response.data.status === 'running') {
        if (response.data.phases && response.data.phases.length > 0) {
          setPhaseProgress(response.data.phases);
        }
        
        if (response.data.currentPhase) {
          setCurrentPhase(response.data.currentPhase);
        }
      }
    } catch (err) {
      console.error('Error polling upgrade status:', err);
    }
  };

  useEffect(() => {
    loadServerGroups();
  }, []);

  const loadServerGroups = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/upgrade/server-groups`);
      if (response.data && response.data.success && Array.isArray(response.data.groups)) {
        setServerGroups(response.data.groups);
      }
      setLoadingGroups(false);
    } catch (err) {
      console.error('Error loading server groups:', err);
      setError('Failed to load server groups');
      setLoadingGroups(false);
    }
  };

  const handleGroupSelect = async (groupName) => {
    setSelectedGroup(groupName);
    setSelectedServers({ backend: false, fe1: false, fe2: false });
    setFe1UITypes({ oldUI: false, newUI: false });
    setServers({ backend: null, fe1: null, fe2: null });
    
    if (!groupName) return;

    try {
      const backendResponse = await axios.get(`${API_URL}/api/upgrade/servers/${groupName}`);
      if (backendResponse.data && backendResponse.data.success) {
        setServers(prev => ({ ...prev, backend: backendResponse.data.server }));
      }
      
      const frontendResponse = await axios.get(`${API_URL}/api/upgrade/frontend-servers/${groupName}`);
      if (frontendResponse.data && frontendResponse.data.success && Array.isArray(frontendResponse.data.servers)) {
        const feServers = frontendResponse.data.servers;
        if (feServers.length >= 1) {
          setServers(prev => ({ ...prev, fe1: feServers[0] }));
        }
        if (feServers.length >= 2) {
          setServers(prev => ({ ...prev, fe2: feServers[1] }));
        }
      }
    } catch (err) {
      console.error('Error loading servers for group:', err);
      setError('Failed to load servers for selected group');
    }
  };

  const handleServerToggle = (serverType) => {
    setSelectedServers(prev => ({
      ...prev,
      [serverType]: !prev[serverType]
    }));

    if (serverType === 'fe1' && selectedServers.fe1) {
      setFe1UITypes({ oldUI: false, newUI: false });
    }
  };

  const handleFE1UITypeToggle = (uiType) => {
    setFe1UITypes(prev => ({
      ...prev,
      [uiType]: !prev[uiType]
    }));
  };

  const handleFileSelect = async (type, event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      setError('Please select a valid ZIP file');
      return;
    }

    setFiles(prev => ({ ...prev, [type]: file }));
    setError(null);

    await uploadToS3(type, file);
  };

  const uploadToS3 = async (type, file) => {
    try {
      setUploading(true);
      setUploadingFile(type);
      setUploadProgress(prev => ({ ...prev, [type]: 0 }));

      const urlResponse = await axios.post(`${API_URL}/api/upgrade/get-upload-url`, {
        fileName: file.name,
        fileType: file.type || 'application/zip',
        componentType: type
      });

      const { uploadUrl, s3Key } = urlResponse.data;

      await axios.put(uploadUrl, file, {
        headers: {
          'Content-Type': file.type || 'application/zip'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(prev => ({ ...prev, [type]: percentCompleted }));
        }
      });

      setS3Keys(prev => ({ ...prev, [type]: s3Key }));
      setUploadProgress(prev => ({ ...prev, [type]: 100 }));
      setUploading(false);
      setUploadingFile(null);

    } catch (err) {
      console.error('Upload error:', err);
      setError(`Failed to upload ${type} file`);
      setUploading(false);
      setUploadingFile(null);
      setFiles(prev => ({ ...prev, [type]: null }));
      setUploadProgress(prev => ({ ...prev, [type]: 0 }));
    }
  };

  const handleRemoveFile = async (type) => {
    if (s3Keys[type]) {
      try {
        await axios.post(`${API_URL}/api/upgrade/delete-upload`, {
          s3Key: s3Keys[type]
        });
      } catch (err) {
        console.error('Error deleting file from S3:', err);
      }
    }

    setFiles(prev => ({ ...prev, [type]: null }));
    setS3Keys(prev => ({ ...prev, [type]: null }));
    setUploadProgress(prev => ({ ...prev, [type]: 0 }));
  };

  const handleStartUpgrade = () => {
    if (!selectedGroup) {
      setError('Please select a server group first');
      return;
    }

    const hasBackend = selectedServers.backend;
    const hasFE1OldUI = selectedServers.fe1 && fe1UITypes.oldUI;
    const hasFE1NewUI = selectedServers.fe1 && fe1UITypes.newUI;
    const hasFE2 = selectedServers.fe2;

    if (!hasBackend && !hasFE1OldUI && !hasFE1NewUI && !hasFE2) {
      setError('Please select at least one server and UI type to upgrade');
      return;
    }

    if (hasBackend && !s3Keys.backend) {
      setError('Please upload Backend ZIP file');
      return;
    }

    if ((hasFE1OldUI || hasFE2) && !s3Keys.oldUI) {
      setError('Please upload Old UI ZIP file');
      return;
    }

    if (hasFE1NewUI && !s3Keys.newUI) {
      setError('Please upload New UI ZIP file');
      return;
    }

    setShowConfirmModal(true);
  };

  const executeUpgrade = async () => {
    setShowConfirmModal(false);
    setUpgrading(true);
    setError(null);
    setSuccess(false);
    setPhaseProgress([]);
    setAllPhases([]);

    try {
      const backendSelectedServers = {
        backend: selectedServers.backend,
        fe1: selectedServers.fe1 && fe1UITypes.oldUI,
        fe2: selectedServers.fe2,
        newUI: selectedServers.fe1 && fe1UITypes.newUI,
      };

      const response = await axios.post(`${API_URL}/api/upgrade/execute-multi`, {
        serverGroup: selectedGroup,
        selectedServers: backendSelectedServers,
        s3Keys: s3Keys
      }, {
        timeout: 1200000
      });

      if (response.data.success) {
        setSuccess(true);
        setCompletionData(response.data.result);
        setShowCompletionModal(true);
      }
    } catch (err) {
      console.error('Upgrade error:', err);
      setError(err.response?.data?.error || err.message || 'Upgrade failed');
      setCompletionData({
        success: false,
        message: err.response?.data?.error || err.message || 'Upgrade failed',
        phases: err.response?.data?.phases || []
      });
      setShowCompletionModal(true);
    } finally {
      setUpgrading(false);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    }
  };

  const handleShowLogs = async () => {
    setShowLogs(true);
    setLoadingLogs(true);

    try {
      const upgradeKey = getUpgradeKey();
      const response = await axios.get(`${API_URL}/api/upgrade/logs/${upgradeKey}`);
      setUpgradeLogs(response.data.logs);
    } catch (err) {
      console.error('Error fetching logs:', err);
      setUpgradeLogs('Error loading logs: ' + err.message);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleShowLogsHistory = async () => {
    setShowLogsHistory(true);
    setLoadingHistory(true);

    try {
      const response = await axios.get(`${API_URL}/api/upgrade/logs`);
      setLogsHistory(response.data.logs || []);
    } catch (err) {
      console.error('Error fetching logs history:', err);
      setError('Failed to load logs history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const viewLogFile = async (filename) => {
    setLoadingLogs(true);
    setSelectedLogFile(filename);

    try {
      const response = await axios.get(`${API_URL}/api/upgrade/logs/file/${filename}`);
      setUpgradeLogs(response.data.logs);
      setShowLogs(true);
      setShowLogsHistory(false);
    } catch (err) {
      console.error('Error fetching log file:', err);
      setUpgradeLogs('Error loading log file: ' + err.message);
    } finally {
      setLoadingLogs(false);
    }
  };

  const confirmDeleteLog = (filename) => {
    setLogToDelete(filename);
    setShowDeleteConfirm(true);
  };

  const deleteLogFile = async () => {
    if (!logToDelete) return;

    try {
      await axios.delete(`${API_URL}/api/upgrade/logs/${logToDelete}`);
      
      const response = await axios.get(`${API_URL}/api/upgrade/logs`);
      setLogsHistory(response.data.logs || []);
      
      setShowDeleteConfirm(false);
      setLogToDelete(null);
    } catch (err) {
      console.error('Error deleting log file:', err);
      setError('Failed to delete log file');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    else return (bytes / 1048576).toFixed(2) + ' MB';
  };

  const getSelectedServersCount = () => {
    let count = 0;
    if (selectedServers.backend) count++;
    if (selectedServers.fe1) count++;
    if (selectedServers.fe2) count++;
    return count;
  };

  const getSelectedServersNames = () => {
    const names = [];
    if (selectedServers.backend && servers.backend) {
      names.push(servers.backend.name);
    }
    if (selectedServers.fe1 && servers.fe1) {
      const uiTypes = [];
      if (fe1UITypes.oldUI) uiTypes.push('Old UI');
      if (fe1UITypes.newUI) uiTypes.push('New UI');
      names.push(`${servers.fe1.name} (${uiTypes.join(' + ')})`);
    }
    if (selectedServers.fe2 && servers.fe2) {
      names.push(`${servers.fe2.name} (Old UI)`);
    }
    return names.join(', ');
  };

  // Server Card Component
  const ServerCard = ({ server, isSelected, onToggle, showUIOptions, uiTypes, onUITypeToggle }) => {
    const colorClasses = {
      blue: { 
        border: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20', 
        icon: 'text-blue-500', 
        hover: 'hover:border-blue-300' 
      },
      green: { 
        border: 'border-green-500 bg-green-50 dark:bg-green-900/20', 
        icon: 'text-green-500', 
        hover: 'hover:border-green-300' 
      },
      purple: { 
        border: 'border-purple-500 bg-purple-50 dark:bg-purple-900/20', 
        icon: 'text-purple-500', 
        hover: 'hover:border-purple-300' 
      },
    };
    
    const colors = colorClasses[server.color];
    
    return (
      <div className="space-y-3">
        <div
          onClick={() => onToggle(server.type)}
          className={`relative cursor-pointer rounded-xl border-2 transition-all p-4 ${
            isSelected 
              ? `${colors.border} shadow-lg` 
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          } ${colors.hover}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 flex-1">
              <FaServer className={`text-2xl ${isSelected ? colors.icon : 'text-gray-400'}`} />
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{server.label}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{server.config.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500">{server.config.host}</p>
              </div>
            </div>
            <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
              isSelected 
                ? `${colors.border} bg-white dark:bg-gray-800` 
                : 'border-gray-300 dark:border-gray-600'
            }`}>
              {isSelected && <FaCheckCircle className={colors.icon} />}
            </div>
          </div>
        </div>

        {showUIOptions && isSelected && (
          <div className="ml-8 space-y-2 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Select UI Type(s):</p>
            
            <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 p-2 rounded">
              <input
                type="checkbox"
                checked={uiTypes.oldUI}
                onChange={() => onUITypeToggle('oldUI')}
                className="w-5 h-5 text-green-500 border-gray-300 rounded focus:ring-green-500"
              />
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-gray-900 dark:text-white font-medium">Old UI</span>
              </div>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 p-2 rounded">
              <input
                type="checkbox"
                checked={uiTypes.newUI}
                onChange={() => onUITypeToggle('newUI')}
                className="w-5 h-5 text-orange-500 border-gray-300 rounded focus:ring-orange-500"
              />
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                <span className="text-gray-900 dark:text-white font-medium">New UI</span>
              </div>
            </label>
          </div>
        )}
      </div>
    );
  };

  // File Upload Box Component
  const FileUploadBox = ({ type, label, color, file, progress, uploading, onSelect, onRemove, className = '' }) => {
    const colorClasses = {
      blue: { 
        gradient: 'from-blue-500 to-blue-600', 
        border: 'hover:border-blue-500 dark:hover:border-blue-400', 
        progress: 'bg-blue-500',
        borderColor: 'border-blue-200 dark:border-blue-800'
      },
      green: { 
        gradient: 'from-green-500 to-green-600', 
        border: 'hover:border-green-500 dark:hover:border-green-400', 
        progress: 'bg-green-500',
        borderColor: 'border-green-200 dark:border-green-800'
      },
      orange: { 
        gradient: 'from-orange-500 to-orange-600', 
        border: 'hover:border-orange-500 dark:hover:border-orange-400', 
        progress: 'bg-orange-500',
        borderColor: 'border-orange-200 dark:border-orange-800'
      },
    };
    
    const colors = colorClasses[color];
    
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border-2 ${colors.borderColor} ${className}`}>
        <div className={`bg-gradient-to-r ${colors.gradient} p-4`}>
          <div className="flex items-center space-x-3">
            <FaFileArchive className="text-white text-2xl" />
            <div>
              <h3 className="text-xl font-bold text-white">{label}</h3>
              {type === 'oldUI' && (
                <p className="text-white text-opacity-90 text-sm mt-1">
                  Will be deployed to selected Old UI servers
                </p>
              )}
              {type === 'newUI' && (
                <p className="text-white text-opacity-90 text-sm mt-1">
                  Will be deployed to FE1 (New UI)
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="p-6">
          {!file ? (
            <label className={`flex flex-col items-center justify-center h-40 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl transition-colors ${
              uploading ? 'cursor-wait opacity-50' : `cursor-pointer ${colors.border}`
            }`}>
              <FaUpload className="text-gray-400 text-3xl mb-2" />
              <span className="text-gray-600 dark:text-gray-400">
                {uploading ? 'Uploading...' : 'Click to upload ZIP'}
              </span>
              <input type="file" accept=".zip" onChange={onSelect} className="hidden" disabled={uploading} />
            </label>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex items-center space-x-3">
                  <FaCheckCircle className="text-green-500 text-xl" />
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{file.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Size: {(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <button onClick={onRemove} disabled={uploading} className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <FaTimesCircle />
                </button>
              </div>
              {progress < 100 && progress > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className={`${colors.progress} h-2 rounded-full transition-all duration-300`} style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-full p-4 shadow-lg">
              <FaRocket className="text-white text-3xl" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Automated Upgrade</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">Multi-server upgrade orchestration</p>
            </div>
          </div>
          {Object.values(s3Keys).some(key => key !== null) && (
            <div className="flex items-center space-x-2 bg-green-100 dark:bg-green-900 px-4 py-2 rounded-lg">
              <FaCloudUploadAlt className="text-green-600 dark:text-green-400" />
              <span className="text-green-700 dark:text-green-300 font-semibold">Files uploaded to S3</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Select Server Group</h2>
          
          {loadingGroups ? (
            <div className="flex items-center justify-center py-8">
              <FaSpinner className="animate-spin text-blue-500 text-3xl mr-3" />
              <span className="text-gray-600 dark:text-gray-400">Loading server groups...</span>
            </div>
          ) : (
            <select
              value={selectedGroup}
              onChange={(e) => handleGroupSelect(e.target.value)}
              disabled={upgrading}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">-- Select Server Group --</option>
              {serverGroups.map(group => (
                <option key={group} value={group}>{group.toUpperCase()}</option>
              ))}
            </select>
          )}
        </div>

        {selectedGroup && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Select Servers in {selectedGroup.toUpperCase()}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {servers.backend && (
                <ServerCard 
                  server={{ type: 'backend', config: servers.backend, label: 'Backend', color: 'blue' }}
                  isSelected={selectedServers.backend} 
                  onToggle={handleServerToggle}
                  showUIOptions={false}
                  uiTypes={{}}
                  onUITypeToggle={() => {}}
                />
              )}
              {servers.fe1 && (
                <ServerCard 
                  server={{ type: 'fe1', config: servers.fe1, label: 'Frontend 1', color: 'green' }}
                  isSelected={selectedServers.fe1} 
                  onToggle={handleServerToggle}
                  showUIOptions={true}
                  uiTypes={fe1UITypes}
                  onUITypeToggle={handleFE1UITypeToggle}
                />
              )}
              {servers.fe2 && (
                <ServerCard 
                  server={{ type: 'fe2', config: servers.fe2, label: 'Frontend 2', color: 'purple' }}
                  isSelected={selectedServers.fe2} 
                  onToggle={handleServerToggle}
                  showUIOptions={false}
                  uiTypes={{}}
                  onUITypeToggle={() => {}}
                />
              )}
            </div>

            {getSelectedServersCount() > 0 && (
              <div className="mt-4 p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <p className="text-blue-800 dark:text-blue-300">
                  <strong>{getSelectedServersCount()}</strong> server(s) selected: {getSelectedServersNames()}
                </p>
              </div>
            )}
          </div>
        )}

        {selectedGroup && getSelectedServersCount() > 0 && (
          <div ref={fileUploadRef} className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Upload Files</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {selectedServers.backend && (
                <FileUploadBox 
                  type="backend"
                  label="Backend"
                  color="blue"
                  file={files.backend}
                  progress={uploadProgress.backend}
                  uploading={uploadingFile === 'backend'}
                  onSelect={(e) => handleFileSelect('backend', e)}
                  onRemove={() => handleRemoveFile('backend')}
                />
              )}
              
              {((selectedServers.fe1 && fe1UITypes.oldUI) || selectedServers.fe2) && (
                <FileUploadBox 
                  type="oldUI"
                  label={`Old UI (${[
                    selectedServers.fe1 && fe1UITypes.oldUI ? 'FE1' : null,
                    selectedServers.fe2 ? 'FE2' : null
                  ].filter(Boolean).join(' + ')})`}
                  color="green"
                  file={files.oldUI}
                  progress={uploadProgress.oldUI}
                  uploading={uploadingFile === 'oldUI'}
                  onSelect={(e) => handleFileSelect('oldUI', e)}
                  onRemove={() => handleRemoveFile('oldUI')}
                />
              )}
              
              {selectedServers.fe1 && fe1UITypes.newUI && (
                <FileUploadBox 
                  type="newUI"
                  label="New UI (FE1)"
                  color="orange"
                  file={files.newUI}
                  progress={uploadProgress.newUI}
                  uploading={uploadingFile === 'newUI'}
                  onSelect={(e) => handleFileSelect('newUI', e)}
                  onRemove={() => handleRemoveFile('newUI')}
                />
              )}
            </div>
          </div>
        )}

        {selectedGroup && getSelectedServersCount() > 0 && (
          <div className="flex justify-end space-x-4">
            <button
              onClick={handleShowLogsHistory}
              disabled={upgrading}
              className="flex items-center space-x-2 px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaHistory />
              <span>Logs History</span>
            </button>

            {completionData && (
              <button
                onClick={handleShowLogs}
                disabled={upgrading}
                className="flex items-center space-x-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FaFileAlt />
                <span>Show Logs</span>
              </button>
            )}

            <button
              onClick={handleStartUpgrade}
              disabled={upgrading || uploadingFile !== null || getSelectedServersCount() === 0}
              className="flex items-center space-x-2 px-8 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl font-semibold transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
            >
              <FaRocket />
              <span>Start Upgrade</span>
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <FaExclamationTriangle className="text-red-500 text-xl flex-shrink-0" />
              <p className="text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}

        {upgrading && (
          <div ref={spinnerRef} className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl shadow-2xl p-8">
            <div className="flex items-center justify-center space-x-8 mb-6">
              <div className="relative w-32 h-20">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M 20,25 C 20,15 30,15 35,20 C 40,25 45,30 50,25 C 55,20 60,15 65,20 C 70,25 80,25 80,25 C 80,35 70,35 65,30 C 60,25 55,20 50,25 C 45,30 40,35 35,30 C 30,25 20,25 20,25 Z"
                    fill="none"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="3"
                  />
                  <circle r="4" fill="white">
                    <animateMotion
                      dur="3s"
                      repeatCount="indefinite"
                      path="M 20,25 C 20,15 30,15 35,20 C 40,25 45,30 50,25 C 55,20 60,15 65,20 C 70,25 80,25 80,25 C 80,35 70,35 65,30 C 60,25 55,20 50,25 C 45,30 40,35 35,30 C 30,25 20,25 20,25 Z"
                    />
                  </circle>
                </svg>
              </div>

              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white mb-2">Upgrade in Progress</h3>
                <p className="text-white text-opacity-90">
                  {currentPhase ? `Phase ${currentPhase.phase}: ${currentPhase.name}` : 'Initializing...'}
                </p>
                {allPhases.length > 0 && (
                  <div className="mt-2">
                    <span className="text-sm text-white text-opacity-90">
                      {allPhases.filter(p => p.status === 'completed').length} of {allPhases.length} phases completed
                    </span>
                  </div>
                )}
              </div>
            </div>

            {allPhases.length > 0 && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {allPhases.map((phase, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 bg-white bg-opacity-10 rounded-lg">
                    <div className="flex-shrink-0">
                      {phase.status === 'completed' && <FaCheckCircle className="text-green-400 text-xl" />}
                      {phase.status === 'running' && <FaSpinner className="text-yellow-400 text-xl animate-spin" />}
                      {phase.status === 'error' && <FaTimesCircle className="text-red-400 text-xl" />}
                      {phase.status === 'pending' && <FaClock className="text-gray-400 text-xl" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-semibold">
                          Phase {phase.phase}: {phase.name}
                        </span>
                        {phase.duration && (
                          <span className="text-white text-opacity-75 text-sm">{phase.duration}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <FaExclamationTriangle className="text-orange-500 text-3xl" />
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Confirm Upgrade</h3>
            </div>
            
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Are you sure you want to upgrade the following?
            </p>
            
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
              <p className="font-semibold text-gray-900 dark:text-white mb-2">
                Server Group: {selectedGroup.toUpperCase()}
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                {getSelectedServersNames()}
              </p>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeUpgrade}
                className="px-6 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-colors"
              >
                Yes, Start Upgrade
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompletionModal && completionData && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className={`${completionData.success ? 'bg-gradient-to-r from-green-500 to-green-600' : 'bg-gradient-to-r from-red-500 to-red-600'} p-6`}>
              <div className="flex items-center space-x-4">
                <div className="bg-white rounded-full p-3">
                  {completionData.success ? (
                    <FaCheckCircle className="text-green-500 text-3xl" />
                  ) : (
                    <FaTimesCircle className="text-red-500 text-3xl" />
                  )}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {completionData.success ? 'Upgrade Completed!' : 'Upgrade Failed'}
                  </h2>
                  <p className="text-white text-opacity-90 mt-1">{completionData.message}</p>
                </div>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {completionData.duration && (
                <div className="mb-4 p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <p className="text-blue-800 dark:text-blue-300">
                    <strong>Total Duration:</strong> {completionData.duration}
                  </p>
                </div>
              )}

              {completionData.phases && completionData.phases.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Phases:</h3>
                  {completionData.phases.map((phase, index) => (
                    <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="flex-shrink-0 mt-1">
                        {phase.status === 'completed' && <FaCheckCircle className="text-green-500" />}
                        {phase.status === 'error' && <FaTimesCircle className="text-red-500" />}
                        {phase.status === 'pending' && <FaClock className="text-gray-400" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-900 dark:text-white">
                            Phase {phase.phase}: {phase.name}
                          </span>
                          {phase.duration && (
                            <span className="text-gray-600 dark:text-gray-400 text-sm">{phase.duration}</span>
                          )}
                        </div>
                        {phase.error && (
                          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{phase.error}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 flex justify-end space-x-3">
              {completionData.success && (
                <button
                  onClick={handleShowLogs}
                  className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors"
                >
                  Show Logs
                </button>
              )}
              <button
                onClick={() => setShowCompletionModal(false)}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showLogs && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="bg-white rounded-full p-3">
                    <FaFileAlt className="text-blue-500 text-3xl" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Upgrade Logs</h2>
                    <p className="text-white text-opacity-90 mt-1">
                      {selectedLogFile || `${selectedGroup.toUpperCase()}: ${getSelectedServersNames()}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowLogs(false);
                    setSelectedLogFile(null);
                  }}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {loadingLogs ? (
                <div className="flex items-center justify-center py-12">
                  <FaSpinner className="animate-spin text-blue-500 text-3xl mr-3" />
                  <span className="text-gray-600 dark:text-gray-400">Loading logs...</span>
                </div>
              ) : (
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400 overflow-x-auto">
                  <pre className="whitespace-pre-wrap">{upgradeLogs}</pre>
                </div>
              )}
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 flex justify-end">
              <button
                onClick={() => {
                  setShowLogs(false);
                  setSelectedLogFile(null);
                }}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showLogsHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="bg-white rounded-full p-3">
                    <FaHistory className="text-purple-500 text-3xl" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Logs History</h2>
                    <p className="text-white text-opacity-90 mt-1">All upgrade logs</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowLogsHistory(false)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <FaSpinner className="animate-spin text-purple-500 text-3xl mr-3" />
                  <span className="text-gray-600 dark:text-gray-400">Loading logs history...</span>
                </div>
              ) : logsHistory.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  No logs found
                </div>
              ) : (
                <div className="space-y-2">
                  {logsHistory.map((log, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <FaServer className="text-purple-500" />
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {log.serverName} {log.upgradeType && `(${log.upgradeType})`}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {new Date(log.timestamp).toLocaleString()} · {formatFileSize(log.size)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => viewLogFile(log.filename)}
                          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center space-x-2"
                        >
                          <FaFileAlt />
                          <span>View</span>
                        </button>
                        <button
                          onClick={() => confirmDeleteLog(log.filename)}
                          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center space-x-2"
                        >
                          <FaTrash />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 flex justify-end">
              <button
                onClick={() => setShowLogsHistory(false)}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <FaExclamationTriangle className="text-red-500 text-3xl" />
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Delete Log?</h3>
            </div>
            
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to delete this log file? This action cannot be undone.
            </p>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setLogToDelete(null);
                }}
                className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteLogFile}
                className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomatedUpgrade;