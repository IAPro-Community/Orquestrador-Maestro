"use strict";

const users = new Map();
const activityLog = new Map();

function initializeUsers() {
  const defaultUsers = [
    { id: "1", name: "Alice", email: "alice@example.com", role: "admin", createdAt: "2024-01-15T10:00:00Z" },
    { id: "2", name: "Bob", email: "bob@example.com", role: "user", createdAt: "2024-03-20T14:30:00Z" },
    { id: "3", name: "Charlie", email: "charlie@example.com", role: "user", createdAt: "2024-06-01T09:15:00Z" },
  ];
  for (const u of defaultUsers) {
    users.set(u.id, u);
    activityLog.set(u.id, [
      { action: "login", timestamp: "2024-07-01T08:00:00Z", details: "Successful login" },
      { action: "update_profile", timestamp: "2024-07-02T12:30:00Z", details: "Changed display name" },
      { action: "login", timestamp: "2024-07-03T09:00:00Z", details: "Successful login" },
    ]);
  }
}

initializeUsers();

function findUserById(id) {
  return users.get(id) || null;
}

function getUserActivity(userId) {
  return activityLog.get(userId) || [];
}

function getAllUsers() {
  return Array.from(users.values());
}

module.exports = { findUserById, getUserActivity, getAllUsers, users, activityLog };
