// Full path: frontend/src/services/api.js

import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const servicesAPI = {
  getAll: () => api.get('/services'),
  getByGroup: (group) => api.get(`/services/${group}`),
  getByServer: (serverName) => api.get(`/services/server/${serverName}`),
  getGroups: () => api.get('/services/groups'),
};

export const configAPI = {
  mergeJSON: (files) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    return api.post('/configs/merge/json', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  mergeXML: (files) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    return api.post('/configs/merge/xml', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  resolve: (mergedConfig, resolutions, format) =>
    api.post('/configs/resolve', { mergedConfig, resolutions, format }),
  export: (config, format) =>
    api.post('/configs/export', { config, format }, {
      responseType: 'blob',
    }),
};

export const dllAPI = {
  getAll: () => api.get('/dlls'),
  getSummary: () => api.get('/dlls/summary'),
  getByServer: (serverName) => api.get(`/dlls/server/${serverName}`),
  getDetails: (dllName) => api.get(`/dlls/details/${dllName}`),
  compare: (dllName) => api.get(`/dlls/compare/${dllName}`),
  update: (sourceServer, targetServer, dllName, version) => 
    api.post('/dlls/update', { sourceServer, targetServer, dllName, version }),
};

export const healthCheck = () => api.get('/health');

export default api;