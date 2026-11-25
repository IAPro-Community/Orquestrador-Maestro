"use strict";
function releaseBranch(version, branch) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version || "")) throw new Error("Invalid release version");
  const expected = /^1\.2\.0-rc\.[1-9]\d*$/.test(version) ? "release/1.2.0" : "main";
  if (branch !== expected) throw new Error("Release must be authorized from " + expected);
  return expected;
}
if (require.main === module) {
  try { console.log(releaseBranch(process.argv[2], process.argv[3])); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { releaseBranch };
