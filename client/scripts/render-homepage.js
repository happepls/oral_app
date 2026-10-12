import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import AuthContext from '../src/contexts/AuthContext';
import Landing from '../src/pages/Landing';
import zh from '../src/i18n/locales/zh.json';

export default async function renderHomepage() {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({
    resources: { zh: { translation: zh } },
    lng: 'zh',
    fallbackLng: 'zh',
    interpolation: { escapeValue: false },
  });
  // A public, anonymous render. React effects do not run on the server:
  // no auth restoration, pricing fetch, analytics or user data enter the HTML.
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/']}>
      <I18nextProvider i18n={i18n}>
        <AuthContext.Provider value={{ user: null }}>
          <Landing />
        </AuthContext.Provider>
      </I18nextProvider>
    </MemoryRouter>
  );
}
