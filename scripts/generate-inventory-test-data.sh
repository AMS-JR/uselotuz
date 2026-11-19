#!/usr/bin/env bash
set -euo pipefail
usage() {
  printf '%s\n' 'Usage: bash scripts/generate-inventory-test-data.sh --business UUID --user UUID [--seed INTEGER]' \
    'Populates an existing empty Test business in the local Compose development database.' \
    'The user must have an active Inventory owner or admin grant.'
}
business=''; actor=''; seed=42
while (($#)); do
  case "$1" in
    --business) [[ $# -ge 2 ]] || { usage; exit 2; }; business="$2"; shift 2 ;;
    --user) [[ $# -ge 2 ]] || { usage; exit 2; }; actor="$2"; shift 2 ;;
    --seed) [[ $# -ge 2 ]] || { usage; exit 2; }; seed="$2"; shift 2 ;;
    --help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done
uuid_pattern='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
[[ $business =~ $uuid_pattern && $actor =~ $uuid_pattern && $seed =~ ^-?[0-9]+$ ]] || { usage; exit 2; }
business=${business,,}; actor=${actor,,}
[[ -t 0 ]] || { printf '%s\n' 'Interactive confirmation is required.' >&2; exit 2; }
: "${DATABASE_USER:?Set DATABASE_USER for the local development database}"
: "${DATABASE_PASSWORD:?Set DATABASE_PASSWORD for the local development database}"
case ",${SPRING_PROFILES_ACTIVE:-},${APP_ENV:-},${ENVIRONMENT:-}," in
  *[Pp][Rr][Oo][Dd]*) printf '%s\n' 'Production environments are forbidden.' >&2; exit 1 ;;
esac
if [[ -n ${DATABASE_URL:-} && $DATABASE_URL != jdbc:postgresql://localhost:5433/lotuz && $DATABASE_URL != jdbc:postgresql://127.0.0.1:5433/lotuz ]]; then
  printf '%s\n' 'DATABASE_URL must identify the local development database on port 5433.' >&2; exit 1
fi
command -v docker >/dev/null && command -v python3 >/dev/null || { printf '%s\n' 'Docker Compose and Python 3 are required.' >&2; exit 1; }
if [[ -n ${DOCKER_HOST:-} ]]; then
  [[ $DOCKER_HOST == unix://* ]] || { printf '%s\n' 'Remote Docker hosts are forbidden.' >&2; exit 1; }
else
  docker_endpoint=$(docker context inspect --format '{{.Endpoints.docker.Host}}')
  [[ $docker_endpoint == unix://* ]] || { printf '%s\n' 'Remote Docker contexts are forbidden.' >&2; exit 1; }
fi
python3 -c 'import sys; n=int(sys.argv[1]); sys.exit(not (-(2**63) <= n < 2**63))' "$seed" || { printf '%s\n' 'Seed must fit a signed 64-bit integer.' >&2; exit 2; }
root=$(cd "$(dirname "$0")/.." && pwd)
compose="$root/infra/compose.yaml"
container=$(docker compose -f "$compose" ps -q postgres)
[[ -n $container && $container != *$'\n'* ]] || { printf '%s\n' 'Expected exactly one running development Compose PostgreSQL container.' >&2; exit 1; }
docker inspect "$container" | python3 -c '
import json,os,sys
try:
 c=json.load(sys.stdin)[0]; labels=c["Config"]["Labels"] or {}; files=labels.get("com.docker.compose.project.config_files", "").split(",")
 ports=c["NetworkSettings"]["Ports"].get("5432/tcp") or []
 if not c["State"]["Running"] or c["Config"]["Image"] != "postgres:18": raise ValueError()
 if labels.get("com.docker.compose.service") != "postgres" or os.path.realpath(sys.argv[1]) not in [os.path.realpath(f) for f in files]: raise ValueError()
 if not any(p.get("HostIp")=="127.0.0.1" and p.get("HostPort")=="5433" for p in ports): raise ValueError()
except Exception:
 print("Refusing target: expected this repositorys local PostgreSQL 18 Compose service on 127.0.0.1:5433.",file=sys.stderr); sys.exit(1)
' "$compose"
printf 'This will add 500 products and 2,500 movements to the existing empty Test business %s in the local development database.\n' "$business"
printf 'Type the business UUID exactly to confirm: '
IFS= read -r answer
[[ $answer == "$business" ]] || { printf '%s\n' 'Confirmation did not match; nothing was generated.' >&2; exit 1; }
test_build=$(mktemp -d "${TMPDIR:-/tmp}/lotuz-test-data-build.XXXXXXXX")
trap 'rm -rf -- "$test_build"' EXIT
cd "$root/backend"
env -u SPRING_APPLICATION_JSON -u SPRING_CONFIG_LOCATION -u SPRING_CONFIG_ADDITIONAL_LOCATION \
  -u SPRING_CONFIG_IMPORT -u SPRING_CONFIG_NAME -u JAVA_TOOL_OPTIONS -u JDK_JAVA_OPTIONS -u _JAVA_OPTIONS -u MAVEN_OPTS -u MAVEN_ARGS \
  LOTUZ_TESTDATA_ENABLED=true LOTUZ_TESTDATA_BUSINESS_ID="$business" LOTUZ_TESTDATA_USER_ID="$actor" \
  LOTUZ_TESTDATA_SEED="$seed" LOTUZ_TESTDATA_CONFIRM="$business" \
  OIDC_ENABLED=false \
  TEST_DATABASE_URL=jdbc:postgresql://127.0.0.1:5433/lotuz TEST_DATABASE_USER="$DATABASE_USER" TEST_DATABASE_PASSWORD="$DATABASE_PASSWORD" \
  SPRING_DATASOURCE_URL=jdbc:postgresql://127.0.0.1:5433/lotuz SPRING_DATASOURCE_USERNAME="$DATABASE_USER" SPRING_DATASOURCE_PASSWORD="$DATABASE_PASSWORD" \
  SPRING_FLYWAY_ENABLED=false SPRING_JPA_HIBERNATE_DDL_AUTO=validate \
  ./mvnw -B "-Dlotuz.build.directory=$test_build/target" -Dtest=InventoryTestDataGeneratorTest test
