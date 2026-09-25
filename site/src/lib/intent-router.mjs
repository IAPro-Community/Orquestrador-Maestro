function phraseMatches(text, phrase) {
  const escaped = phrase.toLowerCase().replace(/[.*+?^$()|[\\]{}\\\\]/g, '\\replace(/[.*+?^$\\{}()|[\\]\\\\]/g, '\\$&')');
  return new RegExp('(?<![\\p{L}\\p{N}])' + escaped + '(?![\\p{L}\\p{N}])', 'iu').test(text);
}

export function resolveIntent(description, { aliases = {}, router = { skills: {} }, chains = { chains: {} }, profiles = { profiles: {} } } = {}) {
  const rawDescription = String(description || '').trim();
  const lowerDesc = rawDescription.toLocaleLowerCase('pt-BR');
  const matchedSkills = new Map();
  const engineeringCapabilities = [];
  const capabilitySkillIds = new Set();

  const addEvidence = (skillId, evidence) => {
    const current = matchedSkills.get(skillId) || { evidence: [] };
    current.evidence.push(evidence);
    matchedSkills.set(skillId, current);
  };

  const skillIds = new Set([...Object.keys(router.skills || {}), ...Object.keys(router.librarySkills || {})]);

  for (const skillId of skillIds) {
    const explicit = new RegExp('(?:^|[^\\p{L}\\p{N}])(?:/)?skill:' + skillId + '(?:$|[^\\p{L}\\p{N}])', 'iu').test(rawDescription);
    const bareCanonical = new RegExp('(?:^|[^\\p{L}\\p{N}])' + skillId + '(?:$|[^\\p{L}\\p{N}])', 'iu').test(rawDescription);
    if (explicit || bareCanonical) addEvidence(skillId, {
      kind: 'canonical',
      value: skillId,
      tier: 6,
      specificity: skillId.length,
      priority: Number(router.skills?.[skillId]?.priority || router.librarySkills?.[skillId]?.priority || 0)
    });
  }

  const genericAliases = new Set(['saas','ia','ai','llm','ux','admin','dashboard','whatsapp']);
  for (const [alias, skillId] of Object.entries(aliases)) {
    const normalizedAlias = String(alias).trim().toLocaleLowerCase('pt-BR');
    if (!normalizedAlias) continue;
    const containedTier = genericAliases.has(normalizedAlias) ? 1 : 3;
    if (lowerDesc === normalizedAlias) addEvidence(skillId,{kind:'alias-exact',value:alias,tier:5,specificity:normalizedAlias.length,priority:0});
    else if (phraseMatches(lowerDesc,normalizedAlias)) addEvidence(skillId,{kind:'alias-contained',value:alias,tier:containedTier,specificity:normalizedAlias.length,priority:0});
  }

  for (const [skillId, skill] of Object.entries(router.skills || {})) {
    for (const trigger of skill.triggers || []) {
      const normalizedTrigger = String(trigger).trim().toLocaleLowerCase('pt-BR');
      if (!normalizedTrigger) continue;
      const priority = Number(skill.priority || 0);
      if (lowerDesc === normalizedTrigger) addEvidence(skillId,{kind:'trigger-exact',value:trigger,tier:4,specificity:normalizedTrigger.length,priority});
      else if (phraseMatches(lowerDesc,normalizedTrigger)) addEvidence(skillId,{kind:'trigger-contained',value:trigger,tier:2,specificity:normalizedTrigger.length,priority});
    }
  }

  for (const [capability, route] of Object.entries(router.capabilityRoutes || {})) {
    if (!(route.triggers || []).some((trigger)=>phraseMatches(lowerDesc,trigger))) continue;
    engineeringCapabilities.push(capability);
    for (const skillId of route.skills || []) {
      capabilitySkillIds.add(skillId);
      addEvidence(skillId,{kind:'capability',value:capability,tier:1,specificity:capability.length,priority:Number(route.priority||0)});
    }
  }

  const summarize = (details) => {
    const evidence=[...details.evidence].sort((a,b)=>b.tier-a.tier||b.specificity-a.specificity||b.priority-a.priority||a.value.localeCompare(b.value,'pt-BR'));
    const strongest=evidence[0]||{tier:0,specificity:0,priority:0};
    return {score:strongest.tier*100000+strongest.specificity*100+strongest.priority,tier:strongest.tier,specificity:strongest.specificity,priority:strongest.priority,evidence};
  };

  const ranked=[...matchedSkills.entries()].map(([skillId,details])=>[skillId,summarize(details)])
    .sort((a,b)=>b[1].tier-a[1].tier||b[1].specificity-a[1].specificity||b[1].priority-a[1].priority||a[0].localeCompare(b[0],'en'));

  const primarySkillId=ranked[0]?.[0]||null;
  const primarySkill=primarySkillId?{id:primarySkillId,...(router.skills?.[primarySkillId]||router.librarySkills?.[primarySkillId]||{})}:null;
  const top=ranked[0]?.[1]||null;
  const ambiguities=top?ranked.filter(([,d])=>d.tier===top.tier&&d.specificity===top.specificity&&d.priority===top.priority).map(([id])=>id):[];

  const chainedSkills=[];
  if (primarySkillId&&chains.chains?.[primarySkillId]) {
    for (const allowedSkill of chains.chains[primarySkillId].mayInvoke||[]) {
      if (!matchedSkills.has(allowedSkill)) continue;
      const details=summarize(matchedSkills.get(allowedSkill));
      chainedSkills.push({id:allowedSkill,...(router.skills?.[allowedSkill]||router.librarySkills?.[allowedSkill]||{}),matchScore:details.score,matchedEvidence:details.evidence});
    }
  }

  const guidedSkills=ranked.filter(([skillId])=>capabilitySkillIds.has(skillId)&&skillId!==primarySkillId).slice(0,4)
    .map(([skillId,details])=>({id:skillId,...(router.skills?.[skillId]||router.librarySkills?.[skillId]||{}),matchScore:details.score,matchedEvidence:details.evidence}));

  const totalSkills=1+chainedSkills.length;
  const profile=engineeringCapabilities.length>0?'guided-engineering':totalSkills>3?'deep':totalSkills>1?'standard':'fast';
  const risk=primarySkill?.safety||'standard';
  const maxSkills=profiles.profiles?.[profile]?.maxSkills;
  const allSkills=[primarySkill,...guidedSkills,...chainedSkills].filter(Boolean).filter((skill,index,list)=>list.findIndex((candidate)=>candidate.id===skill.id)===index);

  return Object.freeze({
    primarySkill,
    chainedSkills,
    allSkills:Number.isInteger(maxSkills)?allSkills.slice(0,maxSkills):allSkills,
    guidedSkills:Object.freeze(guidedSkills),
    profile,
    risk,
    engineeringCapabilities:Object.freeze(engineeringCapabilities),
    routingVersion:2,
    confidence:primarySkill?(top.tier>=4?'high':top.tier>=2?'medium':'low'):'none',
    matchedEvidence:Object.freeze(top?top.evidence:[]),
    ambiguities:Object.freeze(ambiguities.length>1?ambiguities:[]),
    matchDetails:Object.fromEntries(ranked)
  });
}
