"use strict";

function formatDate(date, format) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");

  if (format === "YYYY-MM-DD") return `${year}-${month}-${day}`;
  if (format === "DD/MM/YYYY") return `${day}/${month}/${year}`;
  if (format === "YYYY-MM-DD HH:mm:ss") return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isWeekend(date) {
  const d = new Date(date);
  const day = d.getDay();
  return day === 0 || day === 6;
}

module.exports = { formatDate, addDays, isWeekend };
