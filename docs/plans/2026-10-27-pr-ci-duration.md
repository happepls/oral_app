# Shorter required PR checks

## Request and measured baseline

User requested on 2026-10-27: “PR merge时 优化缩减必须检查的test项，当前test检查耗时过长”.
Scope is the required CI workflow and its selection rules, delivered through a
new PR. Branch protection, production deployments and automatic merging are
outside this change.

GitHub run `40293198229` on PR #94 provides the baseline:

- `test`: 11m18s. Unit tests took 17s, build 24s, Python install/tests 17s.
- The production SEO step took 9m18s, including 8m45s to download 22.8 MB
  of browser system dependencies through the Ubuntu mirror. Reinstalling Chrome
  dependencies was the dominant delay, not the unit suites.
- `ui-audit`: 8m46s; browser cases took 7m30s, with 210 passed / 4 skipped.

## Implementation

1. Keep required job names `test` and `ui-audit`. All PRs retain root/client/Node
   and Python unit suites, lint, production build and static GEO verification.
2. The SEO job reuses the hosted runner's Chrome, installing it only if absent.
   The UI job uses the official Playwright `v1.61.1-noble` image, which contains
   Chromium, WebKit and OS dependencies; no apt/browser install runs in that job.
   A policy test enforces image/lockfile version equality. UI CI uses bundled
   Chromium; local runs and production SEO keep the Chrome channel by default.
   Install nginx only when absent; use pip's download cache keyed by requirements.
   Image guidance: https://playwright.dev/docs/docker
3. Run production SEO on PRs touching client, gateway, Compose, root dependency
   manifests, GEO validation or CI policy. Run the integration harness startup
   validation when the harness, its launcher or CI policy changes. These were
   auxiliary checks; no unit suite becomes conditional.
4. The PR UI matrix runs all desktop cases and critical mobile WebKit cases
   (96 executions at implementation time). Push retains the previous four-project
   matrix. Weekly and default manual runs retain the full viewport/theme matrix.
5. CI policy changes exercise both auxiliary suites. Push/manual events also
   exercise both. Missing PR SHAs or an unsuccessful Git diff fail the job.
   Deleted paths count; renames include their old and new locations.

## Verification

- `node --test quality/tests/ci-scope.test.mjs`: 8 tests, including a real Git
  rename/deletion fixture, unavailable commit rejection, scope mapping and
  preservation of unconditional core checks and required job names, plus browser
  image/lockfile alignment and local/CI channel selection.
- `npx eslint scripts/ci/pr-scope.mjs quality/tests/ci-scope.test.mjs`: passed
  (existing React-version configuration warning).
- `GITHUB_EVENT_NAME=pull_request BASE_SHA=af780f4 HEAD_SHA=8882d75 node scripts/ci/pr-scope.mjs`:
  PR #94 selects SEO and skips only unrelated integration-harness startup.
- `QUALITY_PYTHON=/tmp/oral-recording-venv/bin/python SCENE_ACCESS_TEST_REDIS_URL=redis://127.0.0.1:6379/15 npm run verify`:
  pass, score 100.
- `python3 scripts/sdlc.py validate`: passed.
- First GitHub follow-up run `40462995387`: `test` passed in 2m57s; SEO ran in
  24s. This is about 74% less than the PR #94 `test` baseline. The UI job remained
  in OS dependency installation for several minutes, motivating the preinstalled
  image follow-up. Final required checks must be reviewed on the PR.
- Local combined UI run stalled after desktop cases during project transition
  and was stopped; it is not counted as a complete pass. A separate WebKit run
  passed all 37 cases in 43.3s. Final container CI validates both projects together.

## Review and rollback

The tradeoff is reduced per-PR viewport/theme duplication, not reduced desktop
test coverage. Theme/locale combinations remain on push and the full scheduled
matrix. The UI job changes from system Chrome to version-matched bundled Chromium;
production SEO retains system Chrome. A missing or broken browser still fails the
real browser tests. No `continue-on-error`, retry
increase, timeout increase, required-check removal or protection bypass is added.
Revert this CI-only change to restore the previous execution policy. Human PR
approval remains required.
