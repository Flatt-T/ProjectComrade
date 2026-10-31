import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { configureAds } from './adsense';
import './helpdot.css';
import { installDiagnostics } from './diagnostics';

installDiagnostics();
configureAds();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
