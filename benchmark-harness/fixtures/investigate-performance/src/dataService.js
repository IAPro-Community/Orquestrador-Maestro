"use strict";

const database = {
  users: [
    { id: 1, name: "Alice", email: "alice@example.com", role: "admin" },
    { id: 2, name: "Bob", email: "bob@example.com", role: "user" },
    { id: 3, name: "Charlie", email: "charlie@example.com", role: "user" },
  ],
  orders: [
    { id: 101, userId: 1, product: "Widget", amount: 29.99, status: "completed" },
    { id: 102, userId: 2, product: "Gadget", amount: 49.99, status: "pending" },
    { id: 103, userId: 1, product: "Thingamajig", amount: 19.99, status: "completed" },
    { id: 104, userId: 3, product: "Widget", amount: 29.99, status: "completed" },
  ],
};

function findUserByEmail(email) {
  return database.users.find((u) => u.email === email);
}

function findOrdersByUserId(userId) {
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

function getTotalRevenue() {
  return database.orders
    .filter((o) => o.status === "completed")
    .reduce((sum, o) => sum + o.amount, 0);
}

module.exports = {
  findUserByEmail,
  findOrdersByUserId,
  getUserOrderSummary,
  getAllUserSummaries,
  getOrdersByStatus,
  getTotalRevenue,
  database,
};
