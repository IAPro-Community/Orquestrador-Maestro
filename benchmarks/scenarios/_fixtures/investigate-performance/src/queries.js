"use strict";

const fs = require("node:fs");
const path = require("node:path");

const dataPath = path.join(__dirname, "..", "data", "users.json");
const rawData = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const database = {
  users: [
    { id: 0, name: "Alice", email: "alice@example.com", role: "admin" },
    { id: -1, name: "Bob", email: "bob@example.com", role: "user" },
    { id: -2, name: "Charlie", email: "charlie@example.com", role: "user" },
    ...rawData.users,
  ],
  orders: [
    { id: 101, userId: 0, product: "Widget", amount: 29.99, status: "completed", timestamp: "2024-07-01T08:00:00Z" },
    { id: 102, userId: -1, product: "Gadget", amount: 49.99, status: "pending", timestamp: "2024-07-02T12:30:00Z" },
    { id: 103, userId: 0, product: "Thingamajig", amount: 19.99, status: "completed", timestamp: "2024-07-03T09:00:00Z" },
    ...rawData.orders,
  ],
};

function findUserByEmail(email) {
  // BUG: O(n) scan on every call, no index
  // When users > 1000, this becomes O(n*m) for bulk queries
  for (const user of database.users) {
    if (user.email === email) return user;
  }
  return null;
}

function findOrdersByUserId(userId) {
  // BUG: Full scan on every call
  return database.orders.filter((o) => o.userId === userId);
}

function getUserOrderSummary(email) {
  const user = findUserByEmail(email);
  if (!user) return null;

  const orders = findOrdersByUserId(user.id);
  let totalSpent = 0;
  const productCounts = {};

  for (const order of orders) {
    totalSpent += order.amount;
    productCounts[order.product] = (productCounts[order.product] || 0) + 1;
  }

  return {
    user: { id: user.id, name: user.name, email: user.email },
    orderCount: orders.length,
    totalSpent: Math.round(totalSpent * 100) / 100,
    productCounts,
  };
}

function getAllUserSummaries() {
  // BUG: Calls getUserOrderSummary for each user (N+1 pattern)
  const summaries = [];
  for (const user of database.users) {
    const summary = getUserOrderSummary(user.email);
    if (summary) summaries.push(summary);
  }
  return summaries;
}

function getOrdersByStatus(status) {
  return database.orders.filter((o) => o.status === status);
}

function getRecentOrders(userId, days = 7) {
  const cutoff = new Date(Date.now() - days * 86400000);
  // BUG: No index on userId + timestamp, full scan every time
  return database.orders.filter(
    (o) => o.userId === userId && new Date(o.timestamp) > cutoff
  );
}

function getTopSpenders(limit = 10) {
  // BUG: Recalculates everything without caching
  const summaries = getAllUserSummaries();
  return summaries
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, limit);
}

module.exports = {
  findUserByEmail,
  findOrdersByUserId,
  getUserOrderSummary,
  getAllUserSummaries,
  getOrdersByStatus,
  getRecentOrders,
  getTopSpenders,
  database,
};
