"use strict";

const { randomBytes } = require("node:crypto");
const { migrateRecord, isMigrated } = require("./user-schema");

class MigrationService {
  constructor(userStore) {
    this.userStore = userStore;
    this.migratedUsers = new Set();
  }

  migrateUser(userId) {
    const user = this.userStore.get(userId);
    if (!user) return { success: false, error: "User not found" };
    if (isMigrated(user)) return { success: false, error: "Already migrated" };

    const migrated = migrateRecord(user);
    this.userStore.set(userId, migrated);
    this.migratedUsers.add(userId);
    return { success: true, migratedUser: migrated };
  }

  getMigrationStatus(userId) {
    return {
      migrated: this.migratedUsers.has(userId),
      hasToken: isMigrated(this.userStore.get(userId) || {}),
    };
  }
}

module.exports = { MigrationService };
