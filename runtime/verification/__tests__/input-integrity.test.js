"use strict";
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const {execFileSync} = require("node:child_process");
const test = require("node:test"), assert = require("node:assert/strict");
const {verifierConfigSnapshot} = require("../input-integrity");
test("verifier input integrity binds tests and scripts to worktree and revision", t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"maestro-input-integrity-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync("git",args,{cwd:root,stdio:"pipe"});
  git("init","-q"); git("config","user.name","Fixture"); git("config","user.email","fixture@example.invalid");
  fs.mkdirSync(path.join(root,"src"));
  fs.writeFileSync(path.join(root,"src","a.test.js"),"assert(true)");
  git("add",".");git("commit","-qm","initial");
  const initial=verifierConfigSnapshot(root);
  assert.equal(initial.unsafe,false);
  assert.equal(initial.binding.headCommit.length,40);
  fs.writeFileSync(path.join(root,"src","a.test.js"),"assert(false)");
  assert.notEqual(verifierConfigSnapshot(root).digest,initial.digest);
  fs.writeFileSync(path.join(root,"src","a.test.js"),"assert(true)");
  fs.mkdirSync(path.join(root,"scripts"));
  fs.writeFileSync(path.join(root,"scripts","check.js"),"process.exit(0)");
  assert.notEqual(verifierConfigSnapshot(root).digest,initial.digest);
  fs.rmSync(path.join(root,"scripts"),{recursive:true});
  git("commit","--allow-empty","-qm","changed head");
  assert.notEqual(verifierConfigSnapshot(root).digest,initial.digest);
  if(process.platform!=="win32"){
    fs.symlinkSync(path.join(root,"src"),path.join(root,"tests"),"dir");
    assert.equal(verifierConfigSnapshot(root).unsafe,true);
  }
});
