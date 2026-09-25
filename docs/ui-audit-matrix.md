# UI audit matrix

PR and push CI use four representative Playwright projects. The required
`ui-audit` job name, assertions, screenshot thresholds, accessibility checks and
retry policy remain unchanged.

| Project | Coverage |
| --- | --- |
| chromium-320 | Narrowest supported screen, Chinese/light; all cases |
| chromium-desktop | Desktop layout and desktop-only recorder controls; all cases |
| chromium-390-dark-en | Mobile, English/dark; all cases |
| webkit-mobile | Safari engine; existing `@critical` cases |

The current test inventory has **47 distinct cases**. Representative CI collects
**166 executions** versus **495** for the full matrix (about 66% fewer), with no
distinct case removed. This is a reduction in repeated combinations, not a
measured runtime guarantee. Tablet, 375px and the additional locale/theme
cross-products are covered by the full run rather than every PR.

The full 11-project matrix runs each Monday at 02:23 Asia/Shanghai
(`23 18 * * 0` UTC). GitHub schedules use the default branch and may start late.
See the [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
It can also be run through **Actions → CI Pipeline → Run workflow**, leaving
`full_ui_matrix` enabled. Disable that input to run the representative set.
Scheduled runs only execute UI audit; PR/push and manual runs retain the normal
lint, unit, Python and build jobs. A new commit cancels older CI runs for the
same PR; pushes and scheduled/manual runs are not automatically canceled.

Local commands:

```sh
# Same representative coverage as PR CI
npm --prefix client run test:e2e -- \
  --project=chromium-320 \
  --project=chromium-desktop \
  --project=chromium-390-dark-en \
  --project=webkit-mobile

# Full matrix (existing local default)
npm --prefix client run test:e2e

# Inspect either command's inventory without opening browsers
npm --prefix client run test:e2e -- --list
```

All CI runs continue uploading the Playwright report, JSON result and UI
candidate images. Do not update screenshot baselines or remove assertions to
make a failing representative run pass. Before merging layout changes aimed
specifically at an omitted width, also run that project or request the full
matrix. Rollback consists of reverting the CI project selection; existing
Playwright projects and baselines were never deleted.
