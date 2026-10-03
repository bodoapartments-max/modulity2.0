import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App.jsx';
import { AuthProvider } from './app/providers/AuthProvider.jsx';
import { WorkspaceProvider } from './app/providers/WorkspaceProvider.jsx';
import services, { bootstrapServices } from './infrastructure/services.js';
import './index.css';

bootstrapServices(services);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <WorkspaceProvider>
          <App />
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
