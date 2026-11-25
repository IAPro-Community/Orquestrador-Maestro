"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto");
const {checkEvidence,REQUIRED_CHECKS}=require("../scripts/check-local-release-evidence");
test("local approval binds exact SHA, checksums and all required gates",t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"maestro-local-evidence-"));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const version="1.2.0-rc.2",sha="a".repeat(40),filename="iapro-orquestrador-maestro-cli-"+version+".tgz",bytes=Buffer.from("fixture");
  const checksum=crypto.createHash("sha256").update(bytes).digest("hex");
  const row={schemaVersion:1,status:"LOCAL_GATES_PASSED",sha,version,checks:REQUIRED_CHECKS,artifact:{filename,sha256:checksum,integrity:"sha512-"+crypto.createHash("sha512").update(bytes).digest("base64")}};
  const file=path.join(dir,filename),evidence=path.join(dir,"EVIDENCE.json");
  fs.writeFileSync(file,bytes);fs.writeFileSync(evidence,JSON.stringify(row));
  const args={dir,sha,checksum,version};
  assert.equal(checkEvidence(args),file);
  assert.throws(()=>checkEvidence({...args,sha:"b".repeat(40)}),/does not match/);
  assert.throws(()=>checkEvidence({...args,checksum:"b".repeat(64)}),/does not match/);
  fs.writeFileSync(evidence,JSON.stringify({...row,checks:[]}));
  assert.throws(()=>checkEvidence(args),/required gates/);
  fs.writeFileSync(evidence,JSON.stringify(row));fs.writeFileSync(file,"tampered");
  assert.throws(()=>checkEvidence(args),/integrity mismatch/);
});
