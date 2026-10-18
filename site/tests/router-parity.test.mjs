import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolveIntent} from '../src/lib/intent-router.mjs';

const require=createRequire(import.meta.url);
const here=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(here,'../..');
const {IntentRouter}=require(path.join(repoRoot,'runtime/planner/intent-router.js'));
const read=(p)=>JSON.parse(fs.readFileSync(path.join(repoRoot,p),'utf8'));
const aliasesDoc=read('orquestrador/SKILL_ALIASES.json');
const aliases=aliasesDoc.aliases||aliasesDoc;
const router=read('orquestrador/SKILLS_ROUTER.json');
const chains=read('orquestrador/SKILL_CHAINS.json');
const profiles=read('orquestrador/SKILL_EXECUTION_PROFILES.json');
const userHome=fs.mkdtempSync(path.join(os.tmpdir(),'maestro-site-parity-'));
const runtime=new IntentRouter({maestroRoot:path.join(repoRoot,'orquestrador'),userHome});
const corpus=new Set([
  ...Object.keys(aliases),
  ...Object.keys(router.skills||{}),
  ...Object.values(router.skills||{}).flatMap(s=>s.triggers||[]),
  ...Object.values(router.capabilityRoutes||{}).flatMap(r=>r.triggers||[])
]);
function shape(r){return{primary:r.primarySkill?.id||null,chained:r.chainedSkills.map(s=>s.id),guided:r.guidedSkills.map(s=>s.id),profile:r.profile,risk:r.risk,routingVersion:r.routingVersion,confidence:r.confidence,engineeringCapabilities:[...r.engineeringCapabilities]}}
test('browser router stays in parity with runtime intent-router v2',()=>{for(const text of corpus){assert.deepEqual(shape(resolveIntent(text,{aliases,router,chains,profiles})),shape(runtime.resolve(text)),'routing drift for: '+text)}});
