(
  set -eu

  test_name="lotuz-pg18-verify-$(date +%s)-$$"
  test_id=$(docker run -d --rm \
    --name "$test_name" \
    -e POSTGRES_DB=lotuz_verify \
    -e POSTGRES_USER=lotuz_verify \
    -e POSTGRES_PASSWORD=lotuz_verify_only \
    -p 127.0.0.1::5432 \
    postgres:18)

  trap 'docker stop "$test_id" >/dev/null' EXIT

  until docker exec "$test_id" pg_isready -U lotuz_verify -d lotuz_verify >/dev/null; do
    sleep 1
  done

  version=$(docker exec "$test_id" psql -U lotuz_verify -d lotuz_verify \
    -Atc 'SHOW server_version_num')
  test "$version" -ge 180000 && test "$version" -lt 190000

  port=$(docker port "$test_id" 5432/tcp | sed 's/.*://')
  printf 'Isolated container: %s; PostgreSQL version: %s; port: %s\n' \
    "$test_name" "$version" "$port"

  export TEST_DATABASE_URL="jdbc:postgresql://127.0.0.1:$port/lotuz_verify"
  export TEST_DATABASE_USER=lotuz_verify
  export TEST_DATABASE_PASSWORD=lotuz_verify_only
  export TEST_MIGRATIONS=true
  export TEST_DDL=validate

  cd backend
  ./mvnw -B verify

  docker exec "$test_id" psql -U lotuz_verify -d lotuz_verify \
    -c 'SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank'
)