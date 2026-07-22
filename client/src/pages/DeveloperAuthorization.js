import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { developerAPI } from '../services/api';

function DeveloperAuthorization() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const request = useMemo(() => ({
    client_id: searchParams.get('client_id') || '',
    redirect_uri: searchParams.get('redirect_uri') || '',
    scope: searchParams.get('scope') || '',
    state: searchParams.get('state') || '',
  }), [searchParams]);
  const [authorization, setAuthorization] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    developerAPI.getAuthorizationRequest(request)
      .then((value) => { if (active) setAuthorization(value); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [authLoading, request, user]);

  const decide = async (approved) => {
    setSubmitting(true);
    setError('');
    try {
      const result = await developerAPI.decideAuthorization(request, approved);
      window.location.assign(result.redirect_url);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (!authLoading && !user) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    return <main className="page-shell min-h-dvh flex items-center justify-center p-6"><section className="w-full max-w-lg rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-xl text-center"><h1 className="text-2xl font-bold dark:text-white">{t('developer_authorize_title')}</h1><p className="my-5 text-gray-600 dark:text-gray-300">{t('developer_authorize_login')}</p><a className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-6 text-white" href={`/login?return_to=${encodeURIComponent(returnTo)}`}>{t('nav_login')}</a></section></main>;
  }

  return (
    <main className="page-shell min-h-dvh flex items-center justify-center p-6">
      <section className="w-full max-w-lg rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-xl">
        <h1 className="text-2xl font-bold dark:text-white">{t('developer_authorize_title')}</h1>
        {!authorization && !error && <p className="mt-4 text-gray-600 dark:text-gray-300">{t('developer_authorize_loading')}</p>}
        {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
        {authorization && (
          <>
            <p className="mt-4 text-gray-700 dark:text-gray-200">{t('developer_authorize_request', { client: authorization.client.name })}</p>
            <ul className="my-5 list-disc space-y-2 pl-6 text-gray-700 dark:text-gray-200">
              {authorization.scopes.map((scope) => <li key={scope}>{t(`developer_scope_${scope.replace(':', '_')}`)}</li>)}
            </ul>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('developer_authorize_redirect', { host: new URL(authorization.redirect_uri).host })}</p>
            <div className="mt-7 grid grid-cols-2 gap-3">
              <button type="button" disabled={submitting} onClick={() => decide(false)} className="rounded-xl border border-gray-300 px-4 py-3 dark:text-white">{t('developer_authorize_deny')}</button>
              <button type="button" disabled={submitting} onClick={() => decide(true)} className="rounded-xl bg-blue-600 px-4 py-3 text-white">{submitting ? t('developer_authorize_submitting') : t('developer_authorize_allow')}</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default DeveloperAuthorization;
