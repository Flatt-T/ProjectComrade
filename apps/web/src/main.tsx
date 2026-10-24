import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './helpdot.css';
import { installDiagnostics } from './diagnostics';

installDiagnostics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
