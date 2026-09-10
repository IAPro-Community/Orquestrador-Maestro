"use strict";

function Button({ label, variant = "primary", size = "md", disabled = false, onClick }) {
  const className = [
    "btn",
    `btn-${variant}`,
    `btn-${size}`,
    disabled ? "btn-disabled" : "",
  ].filter(Boolean).join(" ");

  return `<button class="${className}" ${disabled ? "disabled" : ""} onclick="${onClick || ""}">${label}</button>`;
}

function IconButton({ icon, label, variant = "primary", disabled = false }) {
  return `<button class="btn btn-icon btn-${variant} ${disabled ? "btn-disabled" : ""}" ${disabled ? "disabled" : ""}><span class="icon">${icon}</span>${label ? `<span class="label">${label}</span>` : ""}</button>`;
}

module.exports = { Button, IconButton };
