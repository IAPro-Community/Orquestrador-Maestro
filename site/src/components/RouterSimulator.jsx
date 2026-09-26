import React,{useMemo,useState} from 'react';
import data from '@site/src/generated/site-data.json';
import {resolveIntent} from '@site/src/lib/intent-router.mjs';

function unique(values){return [...new Set(values.filter(Boolean))]}

export default function RouterSimulator(){
  const examples=useMemo(()=>unique(data.skills.flatMap(skill=>skill.triggers||[])).slice(0,4),[]);
  const [text,setText]=useState(examples[0] || 'skill:skill-repo-health');
  const result=useMemo(()=>resolveIntent(text,{aliases:data.aliases,router:data.router,chains:data.chains,profiles:data.profiles}),[text]);

  return <div className="simulator-shell">
    <div className="sim-input">
      <label htmlFor="router-intent">Descreva a intenção</label>
      <textarea id="router-intent" value={text} onChange={e=>setText(e.target.value)} placeholder="Descreva uma tarefa…"/>
      {examples.length>0&&<div className="sim-examples">
        <span>Exemplos reais de triggers:</span>
        <div>{examples.map(example=><button type="button" key={example} onClick={()=>setText(example)}>{example}</button>)}</div>
      </div>}
      <p className="caveat">A simulação considera somente o catálogo público versionado. Skills locais descobertas na máquina do usuário não existem no GitHub Pages.</p>
    </div>

    <div className="sim-result">
      <div className="sim-result-head">
        <div>
          <small>ROTEADOR v{result.routingVersion}</small>
          <h3>{result.primarySkill?.id || 'Nenhuma skill selecionada'}</h3>
        </div>
        <span className={'confidence confidence-'+result.confidence}>{result.confidence}</span>
      </div>

      <dl className="sim-meta">
        <div><dt>Perfil</dt><dd>{result.profile}</dd></div>
        <div><dt>Risco/runtime</dt><dd>{result.risk}</dd></div>
        <div><dt>Capacidades</dt><dd>{result.engineeringCapabilities.length || 0}</dd></div>
      </dl>

      <div className="sim-block">
        <strong>Evidência que decidiu a rota</strong>
        <div className="evidence-tags">
          {result.matchedEvidence.length
            ? result.matchedEvidence.map((e,i)=><code key={i}>{e.kind}: {e.value}</code>)
            : <span className="muted">Nenhuma evidência forte encontrada.</span>}
        </div>
      </div>

      {result.guidedSkills.length>0&&<div className="sim-block">
        <strong>Skills guiadas por capacidade</strong>
        <div className="evidence-tags">{result.guidedSkills.map(skill=><code key={skill.id}>{skill.id}</code>)}</div>
      </div>}

      {result.chainedSkills.length>0&&<div className="sim-block">
        <strong>Chains compatíveis</strong>
        <div className="evidence-tags">{result.chainedSkills.map(skill=><code key={skill.id}>{skill.id}</code>)}</div>
      </div>}

      {result.ambiguities.length>0&&<div className="sim-block warning-block">
        <strong>Ambiguidade detectada</strong>
        <p>{result.ambiguities.join(', ')}</p>
      </div>}
    </div>
  </div>;
}
