"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { MissionUsageMeter } = require("../mission-usage-meter");
const step = (i,o) => JSON.stringify({ type:"step_finish", sessionID:"ses", part:{ type:"step-finish", tokens:{ input:i, output:o, reasoning:0, cache:{read:0,write:0} } } });
function adapter(outputs){let n=0;return{id:"opencode",async detect(){return{installed:true}},async capabilities(){return{}},async execute(){const stdout=outputs[n++];return{result:Promise.resolve({stdout,stderr:""}),cancel(){}}}}}
test("mission meter sums complete fresh invocations", async () => {
  const meter=new MissionUsageMeter(); const registry={adapters:new Map([["opencode",adapter([step(100,20),step(50,10)])]])}; meter.instrumentRegistry(registry);
  await (await registry.adapters.get("opencode").execute({prompt:"a"})).result; await (await registry.adapters.get("opencode").execute({prompt:"b"})).result;
  const s=meter.snapshot(); assert.equal(s.complete,true); assert.equal(s.inputTokens,150); assert.equal(s.outputTokens,30); assert.equal(s.totalTokens,180);
});
test("one incomplete invocation makes mission total unavailable", async () => {
  const bad=[step(100,20),JSON.stringify({type:"text",part:{type:"text",text:"late"}})].join("\n");
  const meter=new MissionUsageMeter(); const registry={adapters:new Map([["opencode",adapter([step(50,10),bad])]])}; meter.instrumentRegistry(registry);
  await (await registry.adapters.get("opencode").execute({prompt:"a"})).result; await (await registry.adapters.get("opencode").execute({prompt:"b"})).result;
  const s=meter.snapshot(); assert.equal(s.complete,false); assert.equal(s.totalTokens,null); assert.equal(s.observed.inputTokens,50); assert.deepEqual(s.incompleteReasons,["usage-incomplete"]);
});
test("resumed session is never blindly summed", async () => {
  const meter=new MissionUsageMeter(); const registry={adapters:new Map([["opencode",adapter([step(100,20)])]])}; meter.instrumentRegistry(registry);
  await (await registry.adapters.get("opencode").execute({prompt:"a",sessionId:"old"})).result;
  assert.deepEqual(meter.snapshot().incompleteReasons,["session-resume-unsafe"]);
});
