// Full path: frontend/src/pages/DeploySSL.js

import React, { useState, useEffect } from 'react';
import { FaRocket, FaServer, FaCheckCircle, FaExclamationTriangle, FaSpinner, FaLock, FaCheckSquare, FaSquare } from 'react-icons/fa';
import axios from 'axios';
import { useLocation, useSearchParams } from 'react-router-dom';

// Use empty string for production (relies on nginx proxy), falls back to localhost for dev
const API_URL = process.env.REACT_APP_API_URL !== undefined
  ? (process.env.REACT_APP_API_URL || '')  // Empty string for relative URLs
  : 'http://localhost:5000';  // Development fallback

const DeploySSL = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  const [pfxFiles, setPfxFiles] = useState([]);
  const [selectedPfx, setSelectedPfx] = useState('');
  const [pfxPassword, setPfxPassword] = useState('');
  const [servers, setServers] = useState({ backend: [], frontend: [] });
  const [selectedBackendServers, setSelectedBackendServers] = useState([]);
  const [selectedFrontendServers, setSelectedFrontendServers] = useState([]);
  const [selectAllBackend, setSelectAllBackend] = useState(false);
  const [selectAllFrontend, setSelectAllFrontend] = useState(false);
  const [selectedPorts, setSelectedPorts] = useState({
    '8443': true,  // TEST port - on by default
    '443': false,
    '4433': false,
    '4434': false,
    '4455': false
  });
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deploymentResults, setDeploymentResults] = useState(null);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('success'); // 'success' or 'error'
  const [modalMessage, setModalMessage] = useState('');

  // Check if PFX filename was passed from URL or Create PFX page
  useEffect(() => {
    const pfxFromUrl = searchParams.get('pfx');
    if (pfxFromUrl) {
      setSelectedPfx(pfxFromUrl);
    } else if (location.state?.pfxFilename) {
      setSelectedPfx(location.state.pfxFilename);
    }
  }, [location.state, searchParams]);

  useEffect(() => {
    loadPfxFiles();
    loadServers();
  }, []);

  const loadPfxFiles = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/ssl-deploy/pfx-list`);
      setPfxFiles(response.data.data);
    } catch (err) {
      console.error('Error loading PFX files:', err);
    }
  };

  const loadServers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/ssl-deploy/servers`);
      setServers(response.data.data);
      console.log('Loaded servers:', response.data.data);
    } catch (err) {
      console.error('Error loading servers:', err);
      setError('Failed to load servers. Please check backend connection.');
    }
  };

  const handleBackendServerToggle = (serverName) => {
    setSelectedBackendServers(prev =>
      prev.includes(serverName)
        ? prev.filter(s => s !== serverName)
        : [...prev, serverName]
    );
  };

  const handleFrontendServerToggle = (serverName) => {
    setSelectedFrontendServers(prev =>
      prev.includes(serverName)
        ? prev.filter(s => s !== serverName)
        : [...prev, serverName]
    );
  };

  const handleSelectAllBackend = () => {
    if (selectAllBackend) {
      // Deselect all
      setSelectedBackendServers([]);
      setSelectAllBackend(false);
    } else {
      // Select all
      setSelectedBackendServers(servers.backend.map(s => s.name));
      setSelectAllBackend(true);
    }
  };

  const handleSelectAllFrontend = () => {
    if (selectAllFrontend) {
      // Deselect all
      setSelectedFrontendServers([]);
      setSelectAllFrontend(false);
    } else {
      // Select all
      setSelectedFrontendServers(servers.frontend.map(s => s.name));
      setSelectAllFrontend(true);
    }
  };

  const handlePortToggle = (port) => {
    setSelectedPorts(prev => ({
      ...prev,
      [port]: !prev[port]
    }));
  };

  // Update select all checkbox states when individual checkboxes change
  useEffect(() => {
    if (servers.backend.length > 0) {
      setSelectAllBackend(selectedBackendServers.length === servers.backend.length);
    }
  }, [selectedBackendServers, servers.backend]);

  useEffect(() => {
    if (servers.frontend.length > 0) {
      setSelectAllFrontend(selectedFrontendServers.length === servers.frontend.length);
    }
  }, [selectedFrontendServers, servers.frontend]);

  const handleDeploy = async () => {
    // Validation
    if (!selectedPfx) {
      setError('Please select a PFX file');
      return;
    }
    if (!pfxPassword) {
      setError('Please enter the PFX password');
      return;
    }
    if (selectedBackendServers.length === 0) {
      setError('Please select at least one backend server');
      return;
    }

    // Check if at least one port is selected
    const enabledPorts = Object.entries(selectedPorts)
      .filter(([_, enabled]) => enabled)
      .map(([port, _]) => port);
    
    if (enabledPorts.length === 0) {
      setError('Please select at least one port');
      return;
    }

    setDeploying(true);
    setError(null);
    setDeploymentResults(null);

    try {
      const response = await axios.post(`${API_URL}/api/ssl-deploy/deploy`, {
        pfxFilename: selectedPfx,
        pfxPassword,
        backendServers: selectedBackendServers,
        frontendServers: selectedFrontendServers,
        ports: enabledPorts
      });

      if (response.data.success) {
        setDeploymentResults(response.data.data);
        
        // Show error if deployment had issues
        if (!response.data.data.success || response.data.data.errors.length > 0) {
          setError('Deployment completed with errors. See details below.');
          setModalType('error');
          setModalMessage('Issues found during deployment. Please review the logs for details.');
          setShowModal(true);
        } else {
          setModalType('success');
          setModalMessage('All certificates deployed successfully to all selected servers and ports!');
          setShowModal(true);
        }
      } else {
        setError(response.data.error || 'Deployment failed');
        setModalType('error');
        setModalMessage(response.data.error || 'Deployment failed. Please check the error details.');
        setShowModal(true);
      }
    } catch (err) {
      console.error('Deployment error:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Deployment failed. Please check the logs.';
      setError(errorMsg);
      setModalType('error');
      setModalMessage(errorMsg);
      setShowModal(true);
    } finally {
      setDeploying(false);
    }
  };

  const scrollToLogs = () => {
    setShowModal(false);
    // Scroll to deployment results section
    setTimeout(() => {
      const resultsElement = document.getElementById('deployment-results');
      if (resultsElement) {
        resultsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const goToDashboard = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <FaRocket className="text-3xl text-orange-600 dark:text-orange-400" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Deploy SSL Certificate
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Deploy SSL certificates to backend and frontend servers
              </p>
            </div>
          </div>

          {/* Port Selection Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <FaExclamationTriangle className="text-blue-600 dark:text-blue-400 text-xl mt-0.5" />
              <div>
                <p className="font-semibold text-blue-800 dark:text-blue-300">Port Selection Available</p>
                <p className="text-blue-700 dark:text-blue-400 text-sm">
                  You can select which ports to deploy to. Port 8443 is for testing. Enable other ports for production deployment.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* PFX Selection */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            1. Select PFX Certificate
          </h2>

          {pfxFiles.length === 0 ? (
            <div className="text-center py-8">
              <FaLock className="text-5xl text-gray-400 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 mb-4">No PFX files available</p>
              <a
                href="/create-pfx"
                className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Create PFX First
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {pfxFiles.map((file) => (
                <label
                  key={file.filename}
                  className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    selectedPfx === file.filename
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="pfxFile"
                    value={file.filename}
                    checked={selectedPfx === file.filename}
                    onChange={(e) => setSelectedPfx(e.target.value)}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white">{file.filename}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Size: {file.sizeKB} KB • Created: {new Date(file.created).toLocaleString()}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {selectedPfx && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                PFX Password
              </label>
              <input
                type="password"
                value={pfxPassword}
                onChange={(e) => setPfxPassword(e.target.value)}
                placeholder="Enter PFX password"
                disabled={deploying}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}
        </div>

        {/* Server Selection */}
        {selectedPfx && pfxPassword && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              2. Select Servers
            </h2>

            {/* Backend Servers */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <FaServer className="text-blue-600 dark:text-blue-400" />
                  Backend Servers (Required)
                </h3>
                {servers.backend.length > 0 && (
                  <button
                    onClick={handleSelectAllBackend}
                    className="flex items-center gap-2 px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded transition-colors"
                  >
                    {selectAllBackend ? <FaCheckSquare /> : <FaSquare />}
                    Select All
                  </button>
                )}
              </div>
              {servers.backend.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">No backend servers available</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {servers.backend.map((server) => (
                    <label
                      key={server.name}
                      className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                        selectedBackendServers.includes(server.name)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedBackendServers.includes(server.name)}
                        onChange={() => handleBackendServerToggle(server.name)}
                        className="w-4 h-4"
                      />
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{server.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{server.host}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Frontend Servers */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <FaServer className="text-green-600 dark:text-green-400" />
                  Frontend Servers (Optional)
                </h3>
                {servers.frontend.length > 0 && (
                  <button
                    onClick={handleSelectAllFrontend}
                    className="flex items-center gap-2 px-3 py-1 text-sm bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 rounded transition-colors"
                  >
                    {selectAllFrontend ? <FaCheckSquare /> : <FaSquare />}
                    Select All
                  </button>
                )}
              </div>
              {servers.frontend.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">No frontend servers available</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {servers.frontend.map((server) => (
                    <label
                      key={server.name}
                      className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                        selectedFrontendServers.includes(server.name)
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-300 dark:border-gray-600 hover:border-green-300 dark:hover:border-green-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFrontendServers.includes(server.name)}
                        onChange={() => handleFrontendServerToggle(server.name)}
                        className="w-4 h-4"
                      />
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{server.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{server.host}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Port Selection */}
        {selectedPfx && pfxPassword && selectedBackendServers.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              3. Select Ports
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
              Enable the ports you want to deploy to. At least one port must be selected.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {/* Port 8443 - TEST */}
              <button
                onClick={() => handlePortToggle('8443')}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                  selectedPorts['8443']
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 shadow-md'
                    : 'border-gray-300 dark:border-gray-600 hover:border-orange-300 dark:hover:border-orange-700'
                }`}
              >
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">8443</div>
                <div className={`text-xs font-semibold px-2 py-1 rounded ${
                  selectedPorts['8443']
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  TEST
                </div>
                <div className={`mt-2 text-sm font-medium ${
                  selectedPorts['8443'] ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-500'
                }`}>
                  {selectedPorts['8443'] ? 'ON' : 'OFF'}
                </div>
              </button>

              {/* Port 443 */}
              <button
                onClick={() => handlePortToggle('443')}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                  selectedPorts['443']
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 shadow-md'
                    : 'border-gray-300 dark:border-gray-600 hover:border-green-300 dark:hover:border-green-700'
                }`}
              >
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">443</div>
                <div className={`text-xs font-semibold px-2 py-1 rounded ${
                  selectedPorts['443']
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  HTTPS
                </div>
                <div className={`mt-2 text-sm font-medium ${
                  selectedPorts['443'] ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-500'
                }`}>
                  {selectedPorts['443'] ? 'ON' : 'OFF'}
                </div>
              </button>

              {/* Port 4433 */}
              <button
                onClick={() => handlePortToggle('4433')}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                  selectedPorts['4433']
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-700'
                }`}
              >
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">4433</div>
                <div className={`text-xs font-semibold px-2 py-1 rounded ${
                  selectedPorts['4433']
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  CUSTOM
                </div>
                <div className={`mt-2 text-sm font-medium ${
                  selectedPorts['4433'] ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-500'
                }`}>
                  {selectedPorts['4433'] ? 'ON' : 'OFF'}
                </div>
              </button>

              {/* Port 4434 */}
              <button
                onClick={() => handlePortToggle('4434')}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                  selectedPorts['4434']
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-md'
                    : 'border-gray-300 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-700'
                }`}
              >
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">4434</div>
                <div className={`text-xs font-semibold px-2 py-1 rounded ${
                  selectedPorts['4434']
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  CUSTOM
                </div>
                <div className={`mt-2 text-sm font-medium ${
                  selectedPorts['4434'] ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-500'
                }`}>
                  {selectedPorts['4434'] ? 'ON' : 'OFF'}
                </div>
              </button>

              {/* Port 4455 */}
              <button
                onClick={() => handlePortToggle('4455')}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                  selectedPorts['4455']
                    ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20 shadow-md'
                    : 'border-gray-300 dark:border-gray-600 hover:border-pink-300 dark:hover:border-pink-700'
                }`}
              >
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">4455</div>
                <div className={`text-xs font-semibold px-2 py-1 rounded ${
                  selectedPorts['4455']
                    ? 'bg-pink-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  CUSTOM
                </div>
                <div className={`mt-2 text-sm font-medium ${
                  selectedPorts['4455'] ? 'text-pink-600 dark:text-pink-400' : 'text-gray-500 dark:text-gray-500'
                }`}>
                  {selectedPorts['4455'] ? 'ON' : 'OFF'}
                </div>
              </button>
            </div>

            {/* Selected ports summary */}
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>Selected ports:</strong> {
                  Object.entries(selectedPorts)
                    .filter(([_, enabled]) => enabled)
                    .map(([port, _]) => port)
                    .join(', ') || 'None'
                }
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <FaExclamationTriangle className="text-red-600 dark:text-red-400 text-xl mt-0.5" />
              <div>
                <p className="font-semibold text-red-800 dark:text-red-300">Error</p>
                <p className="text-red-700 dark:text-red-400 text-sm whitespace-pre-line">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Deploy Button */}
        {selectedPfx && pfxPassword && selectedBackendServers.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <button
              onClick={handleDeploy}
              disabled={deploying}
              className={`w-full py-4 px-6 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 text-lg ${
                deploying
                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-700 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              {deploying ? (
                <>
                  <FaSpinner className="animate-spin text-xl" />
                  <span>Deploying SSL Certificate...</span>
                </>
              ) : (
                <>
                  <FaRocket />
                  <span>Deploy SSL Certificate</span>
                </>
              )}
            </button>

            <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-3">
              Selected: {selectedBackendServers.length} backend server(s)
              {selectedFrontendServers.length > 0 && `, ${selectedFrontendServers.length} frontend server(s)`}
            </p>
          </div>
        )}

        {/* Deployment Results */}
        {deploymentResults && (
          <div id="deployment-results" className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              {deploymentResults.success ? (
                <FaCheckCircle className="text-green-600 dark:text-green-400" />
              ) : (
                <FaExclamationTriangle className="text-yellow-600 dark:text-yellow-400" />
              )}
              Deployment Results
            </h2>

            {/* Backend Results */}
            {deploymentResults.backend.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
                  Backend Servers
                </h3>
                <div className="space-y-4">
                  {deploymentResults.backend.map((result, idx) => (
                    <div
                      key={idx}
                      className={`border-2 rounded-lg p-4 ${
                        result.success
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        {result.success ? (
                          <FaCheckCircle className="text-green-600 dark:text-green-400" />
                        ) : (
                          <FaExclamationTriangle className="text-red-600 dark:text-red-400" />
                        )}
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {result.server}
                        </span>
                        {result.thumbprint && (
                          <span className="text-xs bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded font-mono">
                            {result.thumbprint.substring(0, 16)}...
                          </span>
                        )}
                      </div>

                      {/* Deployment Steps */}
                      <div className="space-y-1 text-sm">
                        {result.steps.map((step, stepIdx) => (
                          <div
                            key={stepIdx}
                            className={`flex items-center gap-2 ${
                              step.status === 'success'
                                ? 'text-green-700 dark:text-green-400'
                                : 'text-red-700 dark:text-red-400'
                            }`}
                          >
                            {step.status === 'success' ? '✓' : '✗'}
                            <span>{step.step}</span>
                            {step.path && <span className="text-gray-500 dark:text-gray-400">({step.path})</span>}
                          </div>
                        ))}
                      </div>

                      {result.error && (
                        <div className="mt-2 text-sm text-red-700 dark:text-red-400">
                          Error: {result.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Frontend Results */}
            {deploymentResults.frontend.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
                  Frontend Servers
                </h3>
                <div className="space-y-4">
                  {deploymentResults.frontend.map((result, idx) => (
                    <div
                      key={idx}
                      className={`border-2 rounded-lg p-4 ${
                        result.success
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        {result.success ? (
                          <FaCheckCircle className="text-green-600 dark:text-green-400" />
                        ) : (
                          <FaExclamationTriangle className="text-red-600 dark:text-red-400" />
                        )}
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {result.server}
                        </span>
                        {result.thumbprint && (
                          <span className="text-xs bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded font-mono">
                            {result.thumbprint.substring(0, 16)}...
                          </span>
                        )}
                      </div>

                      {/* Deployment Steps */}
                      <div className="space-y-1 text-sm">
                        {result.steps.map((step, stepIdx) => (
                          <div
                            key={stepIdx}
                            className={`flex items-center gap-2 ${
                              step.status === 'success'
                                ? 'text-green-700 dark:text-green-400'
                                : 'text-red-700 dark:text-red-400'
                            }`}
                          >
                            {step.status === 'success' ? '✓' : '✗'}
                            <span>{step.step}</span>
                          </div>
                        ))}
                      </div>

                      {result.error && (
                        <div className="mt-2 text-sm text-red-700 dark:text-red-400">
                          Error: {result.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors Summary */}
            {deploymentResults.errors.length > 0 && (
              <div className="mt-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="font-semibold text-red-800 dark:text-red-300 mb-2">Errors:</p>
                <ul className="list-disc list-inside space-y-1">
                  {deploymentResults.errors.map((error, idx) => (
                    <li key={idx} className="text-sm text-red-700 dark:text-red-400">
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Back to Dashboard Button */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={goToDashboard}
                className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <FaCheckCircle />
                <span>Back to Dashboard</span>
              </button>
            </div>
          </div>
        )}

        {/* Success/Error Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 transform transition-all">
              {/* Icon */}
              <div className="flex justify-center mb-4">
                {modalType === 'success' ? (
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                    <FaCheckCircle className="text-4xl text-green-600 dark:text-green-400" />
                  </div>
                ) : (
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                    <FaExclamationTriangle className="text-4xl text-red-600 dark:text-red-400" />
                  </div>
                )}
              </div>

              {/* Title */}
              <h3 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-3">
                {modalType === 'success' ? 'All Done Successfully!' : 'Issues Found'}
              </h3>

              {/* Message */}
              <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
                {modalMessage}
              </p>

              {/* Buttons */}
              <div className="space-y-3">
                <button
                  onClick={scrollToLogs}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <FaCheckCircle />
                  <span>View Deployment Logs</span>
                </button>
                <button
                  onClick={goToDashboard}
                  className="w-full py-3 px-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg font-semibold transition-colors"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeploySSL;
