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


test("execute rejection before handle creation is recorded as incomplete", async () => {
  const bad = {
    id: "opencode",
    async detect() { return { installed: true }; },
    async capabilities() { return {}; },
    async execute() { throw new Error("spawn failed"); }
  };
  const meter = new MissionUsageMeter();
  const registry = { adapters: new Map([["opencode", bad]]) };
  meter.instrumentRegistry(registry);
  await assert.rejects(() => registry.adapters.get("opencode").execute({ prompt: "x" }), /spawn failed/u);
  const snapshot = meter.snapshot();
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.invocationCount, 1);
  assert.deepEqual(snapshot.incompleteReasons, ["provider-execute-rejected"]);
});

test("unobservable provider handle is recorded as incomplete", async () => {
  const bad = {
    id: "opencode",
    async detect() { return { installed: true }; },
    async capabilities() { return {}; },
    async execute() { return { cancel() {} }; }
  };
  const meter = new MissionUsageMeter();
  const registry = { adapters: new Map([["opencode", bad]]) };
  meter.instrumentRegistry(registry);
  await registry.adapters.get("opencode").execute({ prompt: "x" });
  const snapshot = meter.snapshot();
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.invocationCount, 1);
  assert.deepEqual(snapshot.incompleteReasons, ["provider-result-unobservable"]);
});


test("zero provider invocations is an exact zero-token mission", () => {
  const meter = new MissionUsageMeter();
  const snapshot = meter.snapshot();
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.invocationCount, 0);
  assert.equal(snapshot.totalTokens, 0);
  assert.equal(snapshot.modelCalls, 0);
  assert.deepEqual(snapshot.observed, { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 });
});

test("instrumenting the same registry twice does not double-count an invocation", async () => {
  const meter = new MissionUsageMeter();
  const registry = { adapters: new Map([["opencode", adapter([step(10, 2)])]]) };
  meter.instrumentRegistry(registry);
  meter.instrumentRegistry(registry);
  await (await registry.adapters.get("opencode").execute({ prompt: "once" })).result;
  const snapshot = meter.snapshot();
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.invocationCount, 1);
  assert.equal(snapshot.totalTokens, 12);
});


test("explicit fresh named sessions are safe to aggregate", async () => {
  const meter = new MissionUsageMeter();
  const registry = { adapters: new Map([["opencode", adapter([step(80, 20)])]]) };
  meter.instrumentRegistry(registry);
  await (await registry.adapters.get("opencode").execute({ prompt: "review", sessionId: "review-new", freshSession: true })).result;
  const snapshot = meter.snapshot();
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.totalTokens, 100);
});


test("reasoning tokens remain a separate dimension and are not double-counted in totals", async () => {
  const stdout = JSON.stringify({
    type: "step_finish",
    sessionID: "ses",
    part: { type: "step-finish", tokens: { input: 100, output: 20, reasoning: 7, cache: { read: 0, write: 0 } } }
  });
  const meter = new MissionUsageMeter();
  const registry = { adapters: new Map([["opencode", adapter([stdout])]]) };
  meter.instrumentRegistry(registry);
  await (await registry.adapters.get("opencode").execute({ prompt: "reason" })).result;
  const snapshot = meter.snapshot();
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.reasoningTokens, 7);
  assert.equal(snapshot.totalTokens, 120);
});
