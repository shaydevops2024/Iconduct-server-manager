// Full path: frontend/src/App.js

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ConfigMerger from './pages/ConfigMerger';
import DLLManager from './pages/DLLManager';
import CreatePFX from './pages/CreatePFX';
import DeploySSL from './pages/DeploySSL';
import { ThemeProvider } from './context/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/config-merger" element={<ConfigMerger />} />
            <Route path="/dll-manager" element={<DLLManager />} />
            <Route path="/create-pfx" element={<CreatePFX />} />
            <Route path="/deploy-ssl" element={<DeploySSL />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
}

export default App;