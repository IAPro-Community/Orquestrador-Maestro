import React,{useMemo,useState} from 'react';
import data from '@site/src/generated/site-data.json';
import {resolveIntent} from '@site/src/lib/intent-router.mjs';

export default function RouterSimulator(){
  const [text,setText]=useState('investigar bug de autenticação e validar antes de concluir');
  const result=useMemo(()=>resolveIntent(text,{aliases:data.aliases,router:data.router,chains:data.chains,profiles:data.profiles}),[text]);
  return <div className="simulator">
    <textarea aria-label="Intenção para simular" value={text} onChange={e=>setText(e.target.value)}/>
    <div className="sim-result">
      <small>Roteador v{result.routingVersion} · confiança {result.confidence}</small>
      <h3>{result.primarySkill?.id||'Nenhuma skill selecionada'}</h3>
      <p>Perfil: <b>{result.profile}</b> · risco/runtime: <b>{result.risk}</b></p>
      <div>{result.matchedEvidence.map((e,i)=><code key={i}>{e.kind}: {e.value}</code>)}</div>
      {result.chainedSkills.length>0&&<p>Chains compatíveis: {result.chainedSkills.map(s=>s.id).join(', ')}</p>}
    </div>
    <p className="caveat">Simulação do roteador público do repositório. Skills locais descobertas na máquina do usuário não existem no GitHub Pages.</p>
  </div>;
}
