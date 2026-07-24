import React from 'react';
import ReactDOM from 'react-dom/client';
import './guaji-design.css';
import './index.css';
import './i18n'; // initialize i18next + IP language detection
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
// @react-oauth/google@0.12.x calls google.accounts.id.initialize() from a
// component effect. React StrictMode intentionally re-runs effects in
// development, which makes GSI initialize twice and causes the SDK to discard
// the first instance. The OAuth provider wraps the whole app, so StrictMode
// cannot be scoped around it without also re-running the Google button effect.
root.render(<App />);
