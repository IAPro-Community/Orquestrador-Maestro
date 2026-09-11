"use strict";

function validateEmail(email) {
  if (!email || typeof email !== "string") return false;

  // BUG: This regex rejects valid international email addresses
  // It doesn't allow unicode characters in local part or domain
  const basicRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return basicRegex.test(email);
}

function validatePassword(password) {
  if (!password || typeof password !== "string") return false;
  return password.length >= 8;
}

function validateUsername(username) {
  if (!username || typeof username !== "string") return false;
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

module.exports = { validateEmail, validatePassword, validateUsername };
