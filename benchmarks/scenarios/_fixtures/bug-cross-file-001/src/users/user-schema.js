"use strict";

const schemaV1 = {
  fields: ["id", "name", "email", "token"],
  primaryKey: "id",
};

const schemaV2 = {
  fields: ["id", "name", "email", "authToken", "migratedAt"],
  primaryKey: "id",
};

function getSchema(version) {
  if (version === 1) return schemaV1;
  if (version === 2) return schemaV2;
  throw new Error(`Unknown schema version: ${version}`);
}

function migrateRecord(record) {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    authToken: record.token,
    migratedAt: new Date().toISOString(),
  };
}

function isMigrated(record) {
  return record.authToken !== undefined && record.migratedAt !== undefined;
}

module.exports = { schemaV1, schemaV2, getSchema, migrateRecord, isMigrated };
