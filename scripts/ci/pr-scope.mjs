import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Only expensive auxiliary suites are conditional. Unit tests, lint and the
// production build remain mandatory for every PR, regardless of these flags.
export function scopeForPaths(paths) {
  const policy = paths.some(path => /^(\.github\/|scripts\/ci\/|quality\/tests\/ci-scope\.test\.mjs$)/.test(path));
  return {
    seo: policy || paths.some(path => /^(client\/|api-gateway\/|docker-compose[^/]*\.ya?ml$|package(?:-lock)?\.json$|scripts\/verify-geo-build\.mjs$)/.test(path)),
    integration: policy || paths.some(path => /^(integration_tests\/|scripts\/(run-integration-tests|ci-test-suite)\.sh$)/.test(path)),
  };
}

export function determineScope(env = process.env) {
  if (env.GITHUB_EVENT_NAME !== 'pull_request') return { seo: true, integration: true };
  if (!env.BASE_SHA || !env.HEAD_SHA) throw new Error('PR diff endpoints are required; refusing to skip checks');
  // No rename detection: both old and new paths must count when moving files.
  // A missing commit or failed diff fails the job instead of silently skipping.
  const paths = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', `${env.BASE_SHA}...${env.HEAD_SHA}`], { encoding: 'utf8' })
    .split('\0').filter(Boolean);
  return scopeForPaths(paths);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = determineScope();
  const output = Object.entries(scope).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  process.stdout.write(output);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
}
