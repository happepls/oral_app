import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n'; // initialize i18next + IP language detection
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
