"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {detectExecutable,safeEnvironment,startProcess}=require("../process-execution");
test("provider version probe has a bounded timeout",async()=>{
 const r=await detectExecutable({executable:process.execPath,args:["-e","setInterval(()=>{},1000)","--"],providerId:"fixture",timeoutMs:200});
 assert.equal(r.installed,false);assert.equal(r.error,"DETECTION_TIMEOUT");
});
test("credential-shaped environment keys are stripped case-insensitively",()=>{
 const env=safeEnvironment({my_service_token:"fixture",my_password:"fixture",SAFE_FIXTURE:"yes"});
 assert.equal(env.my_service_token,undefined);assert.equal(env.my_password,undefined);assert.equal(env.SAFE_FIXTURE,"yes");
});
test("timeout cannot become successful execution even if process ignores SIGTERM",{skip:process.platform==="win32"},async()=>{
 const h=startProcess({executable:process.execPath,args:["-e","process.on('SIGTERM',()=>{});setInterval(()=>{},1000)","--"],providerId:"fixture",request:{prompt:"fixture",timeoutMs:500}});
 const r=await h.result;assert.equal(r.timedOut,true);assert.notEqual(r.exitCode,0);
});
