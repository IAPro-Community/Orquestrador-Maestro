"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {compareVersions,assertChannelAdvance}=require("../scripts/release-channel-policy");
test("monotonic promotion rejects channel regression",()=>{
  assert.equal(compareVersions("1.2.0-rc.10","1.2.0-rc.2"),1);
  assert.equal(compareVersions("1.2.0","1.2.0-rc.10"),1);
  assert.equal(compareVersions("1.2.0-rc","1.2.0-rc.1"),-1);
  assert.equal(compareVersions("1.2.0","1.2.0"),0);
  assert.throws(()=>assertChannelAdvance("next","1.2.0-rc.10","1.2.0-rc.2"),/regression/);
  assert.throws(()=>assertChannelAdvance("latest","1.3.0","1.2.0"),/regression/);
  assert.throws(()=>assertChannelAdvance("latest","1.1.1","1.2.0-rc.2"),/stable/);
  assert.doesNotThrow(()=>assertChannelAdvance("next","1.2.0-rc.2","1.2.0"));
  assert.doesNotThrow(()=>assertChannelAdvance("alpha","","1.3.0-alpha.1"));
});
