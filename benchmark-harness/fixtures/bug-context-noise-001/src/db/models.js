"use strict";

class UserModel {
  constructor() {
    this.users = new Map();
  }

  create(data) {
    const id = `user-${Date.now()}`;
    const user = { id, ...data, createdAt: new Date().toISOString() };
    this.users.set(id, user);
    return user;
  }

  findById(id) {
    return this.users.get(id) || null;
  }

  findByEmail(email) {
    return Array.from(this.users.values()).find((u) => u.email === email) || null;
  }

  findAll() {
    return Array.from(this.users.values());
  }
}

module.exports = { UserModel };
