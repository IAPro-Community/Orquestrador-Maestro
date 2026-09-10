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

function parseDate(dateString) {
  const parts = dateString.split(/[/\-]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    if (a > 1000) return new Date(a, b - 1, c);
    if (c > 1000) return new Date(c, b - 1, a);
    return new Date(2000 + a, b - 1, c);
  }
  return new Date(dateString);
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

function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diff = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

module.exports = { formatDate, parseDate, addDays, isWeekend, daysBetween };
