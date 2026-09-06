# Risk-matched verification

Always run `npm run verify` after Build when dependencies are present.

- Frontend: `cd client && npm test -- --watchAll=false --passWithNoTests` and `npm run build`; include `npm run verify:ui` for user-flow or responsive changes.
- Node service: run that service's test command and the relevant root contract suite.
- Python workflow or AI service: run its pytest suite; scoring, learning-mode, or conversation changes also run `python3 test_scenario_batch_and_daily_qa.py --scenario all --mock`.
- Auth: test Bearer and Cookie paths, expired/missing credentials, and cross-service JWT behavior.
- Stripe: test raw webhook body order, signature failure, idempotency, test/live separation, and subscription soft-fail.
- WebSocket/audio: test encoded query parameters, mode forwarding, reconnect/cancel, audio queue ordering, and marker stripping.
- Database/migration: test forward migration, compatibility window, backup evidence, and rollback or compensating migration.
- Docker: build only affected images according to `AGENTS.md`; never hide missing host `node_modules` by installing in a Node service image.

Record unavailable commands as blocked, not passed. Never copy a planned command into the results section without its exit status and concise evidence.
