import assert from "node:assert/strict";
import test from "node:test";

import {
  developmentDatabaseName,
} from "../scripts/dev-postgres.mjs";

test("standalone local development uses a fresh database name", () => {
  assert.equal(developmentDatabaseName({}), "new_yokosuka_server");
  assert.equal(
    developmentDatabaseName({ DEV_POSTGRES_DATABASE: "ny_dev_2" }),
    "ny_dev_2",
  );
});

test("development database names cannot inject SQL or command arguments", () => {
  for (const value of [
    "new-yokosuka",
    "NY_DEV",
    "dev'; DROP DATABASE postgres; --",
    "../postgres",
    "",
  ]) {
    assert.throws(
      () => developmentDatabaseName({ DEV_POSTGRES_DATABASE: value }),
      /lowercase PostgreSQL identifier/,
      value,
    );
  }
});
