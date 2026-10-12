#!/bin/sh
# Creates the integration-test database inside the Docker Postgres container.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-SQL
  CREATE DATABASE examprep_test;
  CREATE DATABASE examprep_e2e;
SQL
