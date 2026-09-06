#!/usr/bin/env bash
# Host-side dependencies; never run this inside a production service Dockerfile.
set -euo pipefail

if [[ "$(uname -s):$(uname -m)" != Linux:x86_64 ]]; then
  echo 'Verification CI setup requires Linux x64.' >&2
  exit 1
fi

npm ci
npm ci --legacy-peer-deps --prefix client
for service in user-service comms-service history-analytics-service conversation-service media-processing-service developer-api-service; do
  npm ci --prefix "services/$service"
done
python -m pip install -r services/workflow-service/requirements.txt -r services/ai-omni-service/requirements.txt pytest pytest-asyncio

# Pin both the release and its archive digest; never trust an unchecked download.
gitleaks_version=8.30.1
gitleaks_sha256=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
gitleaks_dir=$(mktemp -d)
curl --fail --silent --show-error --location --retry 3 \
  "https://github.com/gitleaks/gitleaks/releases/download/v${gitleaks_version}/gitleaks_${gitleaks_version}_linux_x64.tar.gz" \
  --output "$gitleaks_dir/gitleaks.tar.gz"
printf '%s  %s\n' "$gitleaks_sha256" "$gitleaks_dir/gitleaks.tar.gz" | sha256sum --check --strict
tar -xzf "$gitleaks_dir/gitleaks.tar.gz" -C "$gitleaks_dir" gitleaks
test "$("$gitleaks_dir/gitleaks" version)" = "$gitleaks_version"
# Runner temporary files expire with the job. GITHUB_PATH persists across steps.
printf '%s\n' "$gitleaks_dir" >> "${GITHUB_PATH:?GITHUB_PATH must be set by the CI runner}"
