"use strict";

const { validateEmail } = require("../core/validator");

class UserHandler {
  constructor(userModel) {
    this.userModel = userModel;
  }

  async createUser(userData) {
    if (!validateEmail(userData.email)) {
      return { success: false, error: "Invalid email" };
    }

    const user = this.userModel.create({
      name: userData.name,
      email: userData.email,
    });

    return { success: true, user };
  }

  async getUser(id) {
    const user = this.userModel.findById(id);
    if (!user) return { success: false, error: "Not found" };
    return { success: true, user };
  }
}

module.exports = { UserHandler };
