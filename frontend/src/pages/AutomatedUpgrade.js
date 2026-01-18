// Full path: frontend/src/pages/AutomatedUpgrade.js

import React, { useState, useEffect, useRef } from 'react';
import { FaUpload, FaRocket, FaServer, FaCheckCircle, FaExclamationTriangle, FaSpinner, FaTimesCircle, FaFileArchive, FaClock, FaCloudUploadAlt, FaFileAlt, FaHistory, FaTrash } from 'react-icons/fa';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL !== undefined
  ? (process.env.REACT_APP_API_URL || '')
  : '';

// Backend phases (13 phases)
const BACKEND_PHASES = [
  { phase: 1, name: 'Download Files from S3' },
  { phase: 2, name: 'Create Temp Folder' },
  { phase: 3, name: 'Unzip Files & Extract Nested ZIPs' },
  { phase: 3.5, name: 'Run Database Update' },
  { phase: 4, name: 'Smart Rename Using Service Paths' },
  { phase: 5, name: 'Copy vault.json Files' },
  { phase: 6, name: 'Copy .config Files' },
  { phase: 7, name: 'Copy Special Folders' },
  { phase: 8, name: 'Stop Services' },
  { phase: 9, name: 'Backup & Move to Backup Folder' },
  { phase: 10, name: 'Deploy New Version' },
  { phase: 11, name: 'Start Services' },
  { phase: 12, name: 'Cleanup Temp Folders' },
  { phase: 13, name: 'Cleanup S3 Files' },
];

// Old UI phases (8 phases)
const OLDUI_PHASES = [
  { phase: 1, name: 'Download Old UI from S3' },
  { phase: 2, name: 'Unzip Files' },
  { phase: 3, name: 'Copy Config Files' },
  { phase: 4, name: 'Stop IIS' },
  { phase: 5, name: 'Backup Old Version' },
  { phase: 6, name: 'Deploy New Version' },
  { phase: 7, name: 'Start IIS' },
  { phase: 8, name: 'Cleanup Temp Folders' },
];

const AutomatedUpgrade = () => {
  // Adaptive grid helper functions
  const getAdaptiveGridClass = (itemCount) => {
    if (itemCount === 1) {
      return 'flex justify-center';
    } else if (itemCount === 2) {
      return 'grid grid-cols-1 md:grid-cols-2 gap-4';
    } else {
      return 'grid grid-cols-1 md:grid-cols-3 gap-4';
    }
  };

  const getItemWrapperClass = (index, totalItems) => {
    // 1 item: centered with max width
    if (totalItems === 1) return 'max-w-md';
    
    // 4 items: 4th item spans all 3 columns and centers content
    if (totalItems === 4 && index === 3) return 'md:col-span-3 flex justify-center';
    
    // 5 items: items 3-4 wrapped together in a 2-column grid spanning all 3 columns
    if (totalItems === 5 && index === 3) return 'md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4';
    if (totalItems === 5 && index === 4) return 'hidden'; // Rendered within index 3
    
    return '';
  };

  const shouldRenderItem = (index, totalItems) => {
    // Skip rendering item 5 separately (it's rendered with item 4)
    return !(totalItems === 5 && index === 4);
  };

  const [files, setFiles] = useState({
    backend: null,
    oldUI: null,
  });
  
  const [s3Keys, setS3Keys] = useState({
    backend: null,
    oldUI: null,
  });
  
  const [uploadProgress, setUploadProgress] = useState({
    backend: 0,
    oldUI: 0,
  });
  
  const [uploading, setUploading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(null);
  
  // Server group selection
  const [serverGroups, setServerGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(true);
  
  // Multi-select server selection for the chosen group
  const [selectedServers, setSelectedServers] = useState({
    backend: false,
    fe1: false,
    fe2: false,
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

  // Determine which phases to show based on selected servers
  const getPhaseTemplate = () => {
    const hasBackend = selectedServers.backend;
    const hasFrontend = selectedServers.fe1 || selectedServers.fe2;
    
    if (hasBackend && !hasFrontend) {
      return BACKEND_PHASES;
    } else if (!hasBackend && hasFrontend) {
      return OLDUI_PHASES;
    } else if (hasBackend && hasFrontend) {
      // Combined: backend phases + old UI phases (without S3 cleanup duplicate)
      return [...BACKEND_PHASES];
    }
    return [];
  };

  // Initialize all phases when upgrade starts
  useEffect(() => {
    if (upgrading && allPhases.length === 0) {
      const phaseTemplate = getPhaseTemplate();
      const initialPhases = phaseTemplate.map(p => ({
        ...p,
        status: 'pending',
        duration: null,
        details: null,
        error: null
      }));
      setAllPhases(initialPhases);
    }
  }, [upgrading, allPhases.length, selectedServers]);

  // Update phase statuses as backend reports progress
  useEffect(() => {
    if (phaseProgress.length > 0) {
      const phaseTemplate = getPhaseTemplate();
      const updatedPhases = phaseTemplate.map(templatePhase => {
        const progressPhase = phaseProgress.find(p => p.phase === templatePhase.phase);
        if (progressPhase) {
          return progressPhase;
        }
        return {
          ...templatePhase,
          status: 'pending',
          duration: null,
          details: null,
          error: null
        };
      });
      setAllPhases(updatedPhases);
    }
  }, [phaseProgress, selectedServers]);

  // Start/stop polling for live updates
  useEffect(() => {
    if (upgrading) {
      // Get upgrade key for status polling
      const upgradeKey = getUpgradeKey();
      
      // Start polling
      pollingIntervalRef.current = setInterval(() => {
        pollUpgradeStatus(upgradeKey);
      }, 3000); // Poll every 3 seconds
      
      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      };
    }
  }, [upgrading, selectedGroup, selectedServers]);

  const getUpgradeKey = () => {
    const parts = [selectedGroup];
    if (selectedServers.backend) parts.push('backend');
    if (selectedServers.fe1) parts.push('fe1');
    if (selectedServers.fe2) parts.push('fe2');
    return parts.join('_');
  };

  const pollUpgradeStatus = async (upgradeKey) => {
    try {
      const response = await axios.get(`${API_URL}/api/upgrade/status/${upgradeKey}`);
      
      if (response.data.success && response.data.status === 'running') {
        // Update phases
        if (response.data.phases && response.data.phases.length > 0) {
          setPhaseProgress(response.data.phases);
        }
        
        // Update current phase
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
    setServers({ backend: null, fe1: null, fe2: null });
    
    if (!groupName) return;

    try {
      // Load backend server for this group
      const backendResponse = await axios.get(`${API_URL}/api/upgrade/servers/${groupName}`);
      if (backendResponse.data && backendResponse.data.success) {
        setServers(prev => ({ ...prev, backend: backendResponse.data.server }));
      }
      
      // Load frontend servers for this group
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
    // Validate server group is selected
    if (!selectedGroup) {
      setError('Please select a server group first');
      return;
    }

    // Validate at least one server is selected
    const hasSelection = selectedServers.backend || selectedServers.fe1 || selectedServers.fe2;
    if (!hasSelection) {
      setError('Please select at least one server to upgrade');
      return;
    }

    // Validate required files are uploaded
    const needsBackend = selectedServers.backend;
    const needsFrontend = selectedServers.fe1 || selectedServers.fe2;

    if (needsBackend && !s3Keys.backend) {
      setError('Please upload Backend ZIP file');
      return;
    }

    if (needsFrontend && !s3Keys.oldUI) {
      setError('Please upload Old UI ZIP file');
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
      const response = await axios.post(`${API_URL}/api/upgrade/execute-multi`, {
        serverGroup: selectedGroup,
        selectedServers: selectedServers,
        s3Keys: s3Keys
      }, {
        timeout: 1200000 // 20 minutes (increased for IIS retry logic)
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
      
      // Refresh logs history
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

  const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getSelectedServersCount = () => {
    return Object.values(selectedServers).filter(Boolean).length;
  };

  const getSelectedServersNames = () => {
    const names = [];
    if (selectedServers.backend && servers.backend) names.push(servers.backend.name);
    if (selectedServers.fe1 && servers.fe1) names.push(servers.fe1.name);
    if (selectedServers.fe2 && servers.fe2) names.push(servers.fe2.name);
    return names.join(', ');
  };

  // Server Card Component
  const ServerCard = ({ server, isSelected, onToggle }) => {
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
      <div
        onClick={() => onToggle(server.type)}
        className={`cursor-pointer border-2 rounded-xl p-4 transition-all h-full ${
          isSelected ? colors.border : `border-gray-300 dark:border-gray-600 ${colors.hover}`
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <FaServer className={isSelected ? colors.icon : 'text-gray-400'} />
            <span className="font-semibold text-gray-900 dark:text-white">{server.label}</span>
          </div>
          <input type="checkbox" checked={isSelected} onChange={() => {}} className="w-5 h-5" />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{server.config.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{server.config.host}</p>
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
                  Same file will be deployed to all selected frontend servers
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
      {/* Header */}
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
        {/* Server Group Selection */}
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

        {/* Server Selection with Adaptive Grid */}
        {selectedGroup && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Select Servers in {selectedGroup.toUpperCase()}
            </h2>
            
            {(() => {
              const availableServers = [
                servers.backend ? { type: 'backend', config: servers.backend, label: 'Backend', color: 'blue' } : null,
                servers.fe1 ? { type: 'fe1', config: servers.fe1, label: 'Frontend 1', color: 'green' } : null,
                servers.fe2 ? { type: 'fe2', config: servers.fe2, label: 'Frontend 2', color: 'purple' } : null,
              ].filter(Boolean);
              
              const serverCount = availableServers.length;
              
              return (
                <div className={getAdaptiveGridClass(serverCount)}>
                  {availableServers.map((server, index) => {
                    if (!shouldRenderItem(index, serverCount)) return null;
                    
                    const wrapperClass = getItemWrapperClass(index, serverCount);
                    const isSelected = selectedServers[server.type];
                    
                    // For 5 items: render items 4 and 5 together
                    if (serverCount === 5 && index === 3) {
                      const server4 = availableServers[3];
                      const server5 = availableServers[4];
                      
                      return (
                        <div key="row2" className={wrapperClass}>
                          <ServerCard 
                            server={server4} 
                            isSelected={selectedServers[server4.type]} 
                            onToggle={handleServerToggle} 
                          />
                          <ServerCard 
                            server={server5} 
                            isSelected={selectedServers[server5.type]} 
                            onToggle={handleServerToggle} 
                          />
                        </div>
                      );
                    }
                    
                    // For 4 items: center the 4th item
                    if (serverCount === 4 && index === 3) {
                      return (
                        <div key={server.type} className={wrapperClass}>
                          <div className="max-w-md w-full">
                            <ServerCard 
                              server={server} 
                              isSelected={isSelected} 
                              onToggle={handleServerToggle} 
                            />
                          </div>
                        </div>
                      );
                    }
                    
                    // Normal rendering (1, 2, 3 items or first 3 of 4+ items)
                    return (
                      <div key={server.type} className={wrapperClass}>
                        <ServerCard 
                          server={server} 
                          isSelected={isSelected} 
                          onToggle={handleServerToggle} 
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {getSelectedServersCount() > 0 && (
              <div className="mt-4 p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <p className="text-blue-800 dark:text-blue-300">
                  <strong>{getSelectedServersCount()}</strong> server(s) selected: {getSelectedServersNames()}
                </p>
              </div>
            )}
          </div>
        )}

        {/* File Upload Section with Adaptive Grid */}
        {selectedGroup && getSelectedServersCount() > 0 && (
          <div ref={fileUploadRef} className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Upload Files</h2>
            
            {(() => {
              const uploadBoxes = [
                selectedServers.backend ? { type: 'backend', label: 'Backend', color: 'blue' } : null,
                (selectedServers.fe1 || selectedServers.fe2) ? { 
                  type: 'oldUI', 
                  label: `Old UI (${selectedServers.fe1 && selectedServers.fe2 ? 'FE1+FE2' : selectedServers.fe1 ? 'FE1' : 'FE2'})`,
                  color: 'green'
                } : null,
              ].filter(Boolean);
              
              const boxCount = uploadBoxes.length;
              
              return (
                <div className={boxCount === 1 ? 'flex justify-center' : 'grid grid-cols-1 md:grid-cols-2 gap-6'}>
                  {uploadBoxes.map((box) => (
                    <FileUploadBox 
                      key={box.type}
                      type={box.type}
                      label={box.label}
                      color={box.color}
                      file={files[box.type]}
                      progress={uploadProgress[box.type]}
                      uploading={uploadingFile === box.type}
                      onSelect={(e) => handleFileSelect(box.type, e)}
                      onRemove={() => handleRemoveFile(box.type)}
                      className={boxCount === 1 ? 'max-w-md w-full' : ''}
                    />
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Action Buttons */}
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

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <FaExclamationTriangle className="text-red-500 text-xl flex-shrink-0" />
              <p className="text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}

        {/* DevOps Infinity Loop Status Banner */}
        {upgrading && (
          <div ref={spinnerRef} className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl shadow-2xl p-8">
            <div className="flex items-center justify-center space-x-8">
              {/* Infinity Loop Animation */}
              <div className="relative w-32 h-20">
                {/* SVG Infinity Symbol */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
                  {/* Infinity path */}
                  <path
                    d="M 10,25 C 10,15 15,10 25,10 C 35,10 40,15 50,25 C 60,35 65,40 75,40 C 85,40 90,35 90,25 C 90,15 85,10 75,10 C 65,10 60,15 50,25 C 40,35 35,40 25,40 C 15,40 10,35 10,25 Z"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    opacity="0.6"
                  />
                  {/* Animated dot traveling on the path */}
                  <circle r="4" fill="#FFA500">
                    <animateMotion
                      dur="3s"
                      repeatCount="indefinite"
                      path="M 10,25 C 10,15 15,10 25,10 C 35,10 40,15 50,25 C 60,35 65,40 75,40 C 85,40 90,35 90,25 C 90,15 85,10 75,10 C 65,10 60,15 50,25 C 40,35 35,40 25,40 C 15,40 10,35 10,25 Z"
                    />
                  </circle>
                  {/* Glow effect on the dot */}
                  <circle r="6" fill="#FFA500" opacity="0.3">
                    <animateMotion
                      dur="3s"
                      repeatCount="indefinite"
                      path="M 10,25 C 10,15 15,10 25,10 C 35,10 40,15 50,25 C 60,35 65,40 75,40 C 85,40 90,35 90,25 C 90,15 85,10 75,10 C 65,10 60,15 50,25 C 40,35 35,40 25,40 C 15,40 10,35 10,25 Z"
                    />
                  </circle>
                </svg>
                {/* Rocket icon in center */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <FaRocket className="text-white text-xl opacity-90" />
                </div>
              </div>
              
              <div className="text-center">
                <h3 className="text-3xl font-bold text-white mb-2">Upgrade in Progress</h3>
                <p className="text-white text-opacity-90 text-lg">
                  Deploying to {getSelectedServersNames()}
                </p>
                <p className="text-white text-opacity-75 text-sm mt-2">
                  This may take several minutes. Please do not close this window.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <FaExclamationTriangle className="text-yellow-500 text-3xl" />
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Confirm Upgrade</h3>
            </div>
            
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              You are about to upgrade <strong>{getSelectedServersCount()}</strong> server(s) in <strong>{selectedGroup.toUpperCase()}</strong>:
            </p>
            
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3 mb-6">
              <p className="text-gray-800 dark:text-gray-200 font-semibold">{getSelectedServersNames()}</p>
            </div>

            <p className="text-gray-700 dark:text-gray-300 mb-6">
              This will stop services, deploy new files, and restart services. This process may take several minutes.
            </p>
            
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

      {/* Completion Modal - SIMPLIFIED */}
      {showCompletionModal && completionData && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            {/* Header */}
            <div className={`p-6 ${
              completionData.success
                ? 'bg-gradient-to-r from-green-500 to-green-600'
                : 'bg-gradient-to-r from-red-500 to-red-600'
            }`}>
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

            {/* Body - SIMPLIFIED */}
            <div className="p-6">
              {completionData.duration && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-blue-800 dark:text-blue-300 text-lg">
                    <strong>Duration:</strong> {completionData.duration}
                  </p>
                </div>
              )}

              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-gray-900 dark:text-white font-semibold mb-2">Servers Upgraded:</p>
                <p className="text-gray-700 dark:text-gray-300">{getSelectedServersNames()}</p>
              </div>
            </div>

            {/* Footer with AUTO-REFRESH */}
            <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 flex justify-end space-x-3">
              {completionData.logFile && (
                <button
                  onClick={handleShowLogs}
                  className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors"
                >
                  View Logs
                </button>
              )}
              
              <button
                onClick={() => {
                  setShowCompletionModal(false);
                  window.location.reload(); // AUTO-REFRESH PAGE
                }}
                className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                  completionData.success
                    ? 'bg-green-500 hover:bg-green-600 text-white'
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {showLogs && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Header */}
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

            {/* Content */}
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

            {/* Footer */}
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

      {/* Logs History Modal */}
      {showLogsHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
            {/* Header */}
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

            {/* Content */}
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

            {/* Footer */}
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

      {/* Delete Confirmation Modal */}
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