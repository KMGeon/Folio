#!/usr/bin/env bash
set -euo pipefail

service="${1:-worker}"

docker compose exec -T "$service" sh -lc '
set -eu
codex_home="${CODEX_HOME:-}"

printf "HOME:%s\n" "${HOME:-MISSING}"
printf "CODEX_HOME:%s\n" "${codex_home:-MISSING}"

if [ -z "$codex_home" ]; then
  echo "auth_dir:MISSING"
  exit 1
fi

if [ -d "$codex_home" ]; then
  echo "auth_dir:SET"
else
  echo "auth_dir:MISSING"
  exit 1
fi

for file in auth.json config.toml; do
  if [ -f "$codex_home/$file" ]; then
    printf "%s:SET\n" "$file"
  else
    printf "%s:MISSING\n" "$file"
    exit 1
  fi
done

if command -v codex >/dev/null 2>&1; then
  printf "codex_bin:"
  codex --version
else
  echo "codex_bin:MISSING"
  node -e "import(\"@openai/codex-sdk\").then(() => console.log(\"codex_sdk:SET\"), () => process.exit(1))"
fi
'
