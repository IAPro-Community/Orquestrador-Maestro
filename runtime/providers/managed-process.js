"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");
const ownProcessGroup = process.platform !== "win32";
// Unix groups cover ordinary descendants. A deliberately escaped process
// is not contained; Windows taskkill is best effort, not a Job Object.
function signalManagedProcess(child, signal) {
  if (!child?.pid) return;
  if (ownProcessGroup) {
    try { process.kill(-child.pid, signal); return; }
    catch (error) { if (error.code === "ESRCH") return; }
  } else if (signal === "SIGKILL" && child.exitCode === null && child.signalCode === null) {
    try {
      const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
      const killer = spawn(executable, ["/PID", String(child.pid), "/T", "/F"], {shell:false,stdio:"ignore",windowsHide:true});
      killer.once("error", () => { try { child.kill("SIGKILL"); } catch {} });
      killer.once("close", code => { if(code!==0)try{child.kill("SIGKILL");}catch{} });
      killer.unref();
      return;
    } catch {}
  }
  try { child.kill(signal); } catch {}
}
module.exports = { ownProcessGroup, signalManagedProcess };
