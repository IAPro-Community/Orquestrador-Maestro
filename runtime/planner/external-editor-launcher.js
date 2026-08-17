"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");

function detectEditor() {
  const env = process.env;
  return env.VISUAL || env.EDITOR || (os.platform() === "win32" ? "notepad" : "vi");
}

class ExternalEditorLauncher {
  constructor({ editor } = {}) {
    this.editor = editor || null;
  }

  async detect() {
    return this.editor || detectEditor();
  }

  async launch(filePath, options = {}) {
    if (typeof filePath !== "string" || filePath.trim() === "") {
      throw new TypeError("filePath must be a non-empty string");
    }

    if (options.requireExisting && !fs.existsSync(filePath)) {
      return Object.freeze({
        success: false,
        reason: `File not found: ${filePath}`,
        editor: await this.detect()
      });
    }

    const editor = await this.detect();
    return new Promise((resolve) => {
      const child = spawn(editor, [filePath], {
        stdio: "inherit",
        shell: os.platform() === "win32"
      });

      child.on("error", (error) => {
        resolve(Object.freeze({
          success: false,
          reason: error.message || String(error),
          editor
        }));
      });

      child.on("close", (code) => {
        resolve(Object.freeze({
          success: code === 0,
          reason: code !== 0 ? `Editor exited with code ${code}` : undefined,
          editor,
          exitCode: code
        }));
      });
    });
  }
}

module.exports = { ExternalEditorLauncher };
