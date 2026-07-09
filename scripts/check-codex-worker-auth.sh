#!/usr/bin/env sh
set -eu

service="${1:-worker}"

docker compose exec -T "$service" sh -lc '
set -eu
codex_home="${CODEX_HOME:-}"
auth_check_scope="visibility_only"
auth_health_verified="NOT_VERIFIED"

printf "auth_check_scope:%s\n" "$auth_check_scope"
printf "auth_health_verified:%s\n" "$auth_health_verified"
printf "HOME:%s\n" "${HOME:-MISSING}"
printf "CODEX_HOME:%s\n" "${codex_home:-MISSING}"

if [ -z "$codex_home" ]; then
  echo "codex_home_visible:MISSING"
  exit 1
fi

if [ -d "$codex_home" ]; then
  echo "codex_home_visible:SET"
else
  echo "codex_home_visible:MISSING"
  exit 1
fi

for file in auth.json config.toml; do
  if [ -f "$codex_home/$file" ]; then
    printf "%s:VISIBLE\n" "$file"
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
