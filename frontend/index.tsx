
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import './i18n';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { QueryProvider } from '@/providers/QueryProvider';
import { QueryLoadingBar } from '@/providers/QueryLoadingBar';
import { UIPreferencesProvider } from '@/providers/UIPreferencesProvider';
import { AuthProvider } from '@/modules/auth/AuthContext';
import AppRoutes from '@/routes/AppRoutes';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <UIPreferencesProvider>
      <QueryProvider>
        <QueryLoadingBar />
        <ErrorBoundary>
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </AuthProvider>
        </ErrorBoundary>
      </QueryProvider>
    </UIPreferencesProvider>
  </React.StrictMode>
);
