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
2. Reuse the hosted runner's Chrome. Only install Chrome and its dependencies
   when it is absent. WebKit installation remains mandatory for the UI job.
   Install nginx only when absent; use pip's download cache keyed by requirements.
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

- `node --test quality/tests/ci-scope.test.mjs`: 7 passed. Includes a real Git
  rename/deletion fixture, unavailable commit rejection, scope mapping and
  preservation of unconditional core checks and required job names.
- `npx eslint scripts/ci/pr-scope.mjs quality/tests/ci-scope.test.mjs`: passed
  (existing React-version configuration warning).
- `GITHUB_EVENT_NAME=pull_request BASE_SHA=af780f4 HEAD_SHA=8882d75 node scripts/ci/pr-scope.mjs`:
  PR #94 selects SEO and skips only unrelated integration-harness startup.
- `QUALITY_PYTHON=/tmp/oral-recording-venv/bin/python SCENE_ACCESS_TEST_REDIS_URL=redis://127.0.0.1:6379/15 npm run verify`:
  pass, score 100.
- `python3 scripts/sdlc.py validate`: passed.
- Local full PR UI matrix and GitHub required checks are running; their final
  results must be reviewed on the PR. No projected timing is represented as an
  observed speedup.

## Review and rollback

The tradeoff is reduced per-PR viewport/theme duplication, not reduced desktop
test coverage. Theme/locale combinations remain on push and the full scheduled
matrix. Hosted Chrome version follows the existing runner image; a missing or
broken browser still fails the real browser tests. No `continue-on-error`, retry
increase, timeout increase, required-check removal or protection bypass is added.
Revert this CI-only change to restore the previous execution policy. Human PR
approval remains required.
