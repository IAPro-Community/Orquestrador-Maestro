"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {durableTaskId,matchesDurableTask}=require("../task-identity");
test("same logical ID across submissions never aliases or passes the wrong binding",()=>{
 const args={projectId:"p1",submissionId:"s1",manifestId:"m1",semanticTaskId:"t1"};
 const id=durableTaskId(args);
 for(const patch of [{projectId:"p2"},{submissionId:"s2"},{manifestId:"m2"},{semanticTaskId:"t2"}])assert.notEqual(durableTaskId({...args,...patch}),id);
 const metadata={durableSubmissionId:"s1",durableManifestId:"m1",semanticTaskId:"t1"};
 const run={taskId:id,metadata},task={id,projectId:"p1",metadata},submission={id:"s1",manifestId:"m1",projectId:"p1"};
 assert.equal(matchesDurableTask(run,task,submission,"t1"),true);
 assert.equal(matchesDurableTask(run,task,{...submission,id:"s2"},"t1"),false);
});
