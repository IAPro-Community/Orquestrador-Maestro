import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const siteRoot=path.resolve(here,'..');
const repoRoot=path.resolve(siteRoot,'..');
const generatedDir=path.join(siteRoot,'src','generated');
const staticImgDir=path.join(siteRoot,'static','img');
await fs.mkdir(generatedDir,{recursive:true});
await fs.mkdir(staticImgDir,{recursive:true});

const readJson=async p=>JSON.parse(await fs.readFile(path.join(repoRoot,p),'utf8'));
const readText=async p=>fs.readFile(path.join(repoRoot,p),'utf8');
const manifest=await readJson('orquestrador/SKILLS_MANIFEST.json');
const router=await readJson('orquestrador/SKILLS_ROUTER.json');
const aliasesDoc=await readJson('orquestrador/SKILL_ALIASES.json');
const chains=await readJson('orquestrador/SKILL_CHAINS.json');
const profiles=await readJson('orquestrador/SKILL_EXECUTION_PROFILES.json');
const publicManifest=await readJson('skill-library/PUBLIC_SKILLS_MANIFEST.json');
const recipes=await readJson('orquestrador/SKILL_RECIPES.json').catch(()=>({recipes:[]}));
const aliases=aliasesDoc.aliases||aliasesDoc;

await fs.copyFile(path.join(repoRoot,'assets','orquestrador-maestro-logo.png'),path.join(staticImgDir,'orquestrador-maestro-logo.png'));

function titleFromMarkdown(md,fallback){const m=md.match(/^#\s+(.+)$/m);return m?m[1].trim():fallback}
function stripMarkdown(md){return md.replace(/```[\s\S]*?```/g,' ').replace(/`([^`]+)`/g,'$1').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/^#{1,6}\s+/gm,'').replace(/[>*_~|]/g,' ').replace(/\s+/g,' ').trim()}
function slugFor(relativePath){const normalized=relativePath.replace(/\\/g,'/');if(normalized==='README.md')return'overview';if(normalized==='README-technical-reference.md')return'technical-reference';const noExt=normalized.replace(/\.md$/i,'').replace(/^docs\//,'');return noExt.endsWith('/README')?noExt.slice(0,-7):noExt}
async function walkMarkdown(dir,prefix=''){const out=[];for(const item of await fs.readdir(dir,{withFileTypes:true})){if(item.name.startsWith('.'))continue;const full=path.join(dir,item.name);const rel=path.posix.join(prefix,item.name);if(item.isDirectory())out.push(...await walkMarkdown(full,rel));else if(item.isFile()&&item.name.endsWith('.md'))out.push(rel)}return out}

const documentPaths=['README.md','README-technical-reference.md',...await walkMarkdown(path.join(repoRoot,'docs'),'docs')];
const documents=[];const docsBySource=new Map();
for(const relativePath of documentPaths){
  const markdown=await readText(relativePath);const slug=slugFor(relativePath);
  const doc={id:crypto.createHash('sha1').update(relativePath).digest('hex').slice(0,12),sourcePath:relativePath,slug,title:titleFromMarkdown(markdown,path.basename(relativePath,'.md')),excerpt:stripMarkdown(markdown).slice(0,260),searchText:stripMarkdown(markdown).slice(0,12000),markdown,sourceUrl:'https://github.com/IAPro-Community/Orquestrador-Maestro/blob/main/'+relativePath};
  documents.push(doc);docsBySource.set(relativePath.replace(/\\/g,'/'),doc);
}

const aliasBySkill={};
for(const [alias,skillId] of Object.entries(aliases))(aliasBySkill[skillId]??=[]).push(alias);
const publicById=Object.fromEntries((publicManifest.skills||[]).map(s=>[s.id,s]));
const skillIds=new Set([...Object.keys(manifest.skills||{}),...Object.keys(router.skills||{}),...Object.keys(router.librarySkills||{}),...(publicManifest.skills||[]).map(s=>s.id)]);
const skills=[...skillIds].sort((a,b)=>a.localeCompare(b,'en')).map(id=>{
  const canonical=manifest.skills?.[id]||{},routed=router.skills?.[id]||router.librarySkills?.[id]||{},published=publicById[id]||{},chain=chains.chains?.[id]||{};
  const referenceDoc=docsBySource.get('docs/skills/reference/'+id+'.md');
  return{id,description:canonical.description||routed.description||published.description||'',category:canonical.category||null,risk:canonical.risk||null,safety:routed.safety||null,cost:routed.cost||null,status:canonical.status||null,source:canonical.source||published.source||null,tags:canonical.tags||[],triggers:[...new Set([...(canonical.triggers||[]),...(routed.triggers||[])])],aliases:[...new Set([...(canonical.aliases||[]),...(aliasBySkill[id]||[])])],mirrorEverywhere:canonical.mirrorEverywhere??null,documentation:canonical.documentation||null,dependencies:chain.mayInvoke||[],chainRules:chain.rules||[],publicPath:published.relativePath||null,referenceSlug:referenceDoc?.slug||null,provenance:canonical.provenance||null,priority:Number(canonical.priority??routed.priority??0)}
});

for(const skill of skills.filter(s=>s.id.startsWith('skill-')&&!s.referenceSlug)){
  const d=skill.documentation||{};
  const list=(title,values)=>['','## '+title,'',...(values?.length?values.map(v=>'- '+v):['- Não informado no manifesto.'])];
  const lines=['# '+skill.id,'',skill.description||'Sem descrição publicada.','','## Metadados canônicos','', '- Categoria: `'+(skill.category||'não informada')+'`','- Risco: `'+(skill.risk||'não informado')+'`','- Segurança/runtime: `'+(skill.safety||'não informado')+'`','- Fonte: `'+(skill.source||'não informada')+'`',...list('Gatilhos',skill.triggers),...list('Dependências permitidas',skill.dependencies.map(v=>'`'+v+'`')),...list('Melhores casos de uso',d.bestFor),...list('Quando não usar',d.notFor),...list('Pré-requisitos',d.prerequisites),...list('Evidência mínima',d.expectedEvidence)];
  const markdown=lines.join('\n'),relativePath='generated/skills/'+skill.id+'.md';
  const doc={id:crypto.createHash('sha1').update(relativePath).digest('hex').slice(0,12),sourcePath:relativePath,slug:'skills/reference/'+skill.id,title:skill.id,excerpt:stripMarkdown(markdown).slice(0,260),searchText:stripMarkdown(markdown),markdown,sourceUrl:'https://github.com/IAPro-Community/Orquestrador-Maestro/blob/main/orquestrador/SKILLS_MANIFEST.json'};
  documents.push(doc);skill.referenceSlug=doc.slug;
}

const scenarios=[];const scenarioDir=path.join(repoRoot,'benchmark-harness','scenarios');
for(const item of await fs.readdir(scenarioDir,{withFileTypes:true}).catch(()=>[])){if(!item.isFile()||!item.name.endsWith('.json'))continue;const s=JSON.parse(await fs.readFile(path.join(scenarioDir,item.name),'utf8'));scenarios.push({id:s.id,name:s.name,limits:s.limits||null,acceptanceCriteria:s.acceptance?.criteria?.map(c=>c.type)||[]})}

const generatedAt=new Date().toISOString();
const siteData={generatedAt,gitRef:process.env.GITHUB_SHA||'main',source:{repository:'IAPro-Community/Orquestrador-Maestro',manifestVersion:manifest.version,routerVersion:router.version,publicManifestVersion:publicManifest.schemaVersion},skills,aliases,router,chains,profiles,recipes,benchmark:{scenarios,scenarioCount:scenarios.length,methodologyUrl:'/docs/benchmark/'}};
await fs.writeFile(path.join(generatedDir,'site-data.json'),JSON.stringify(siteData,null,2));
await fs.writeFile(path.join(generatedDir,'docs.json'),JSON.stringify({generatedAt,documents},null,2));
await fs.writeFile(path.join(siteRoot,'static','robots.txt'),'User-agent: *\nAllow: /\n\nSitemap: https://iapro-community.github.io/Orquestrador-Maestro/sitemap.xml\n');
console.log('Generated '+skills.length+' skills, '+documents.length+' Markdown documents and '+scenarios.length+' benchmark scenarios.');
