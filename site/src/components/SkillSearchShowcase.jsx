import React,{useMemo,useState} from 'react';
import Link from '@docusaurus/Link';
import data from '@site/src/generated/site-data.json';

function valueOf(value){
  if(Array.isArray(value)) return value.join(' ');
  return value==null?'':String(value);
}

export default function SkillSearchShowcase(){
  const [query,setQuery]=useState('');
  const results=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase('pt-BR');
    return data.skills.filter(skill=>{
      if(!needle) return true;
      return [
        skill.id,skill.description,skill.category,skill.risk,skill.safety,
        ...(skill.tags||[]),...(skill.triggers||[]),...(skill.aliases||[]),...(skill.dependencies||[])
      ].map(valueOf).join(' ').toLocaleLowerCase('pt-BR').includes(needle);
    }).slice(0,5);
  },[query]);

  return <div className="v2-skill-browser">
    <div className="v2-skill-search">
      <span>⌕</span>
      <input
        id="marketing-skill-query"
        type="search"
        value={query}
        onChange={e=>setQuery(e.target.value)}
        placeholder="Busque por skill, trigger, alias ou capacidade…"
        aria-label="Pesquisar skills"
      />
      <small>{results.length} resultados em destaque</small>
    </div>

    <div className="v2-skill-table" aria-live="polite">
      <div className="v2-skill-table-head"><span>SKILL</span><span>CONTEXTO</span><span>ROTA</span></div>
      {results.map(skill=><article key={skill.id}>
        <div className="v2-skill-id">
          <small>{valueOf(skill.category)||valueOf(skill.source)||'skill'}</small>
          <strong>{skill.id}</strong>
        </div>
        <p>{skill.description||'Sem descrição publicada.'}</p>
        <div className="v2-skill-meta">
          <span>{(skill.triggers||[]).length} triggers</span>
          <span>{(skill.dependencies||[]).length} chains</span>
          {(skill.risk||skill.safety)&&<b>{valueOf(skill.risk||skill.safety)}</b>}
        </div>
      </article>)}
    </div>

    <div className="v2-skill-footer">
      <span>Fonte: manifests e documentação versionados</span>
      <Link to="/skills">Explorar as {data.skills.length} skills <b>↗</b></Link>
    </div>
  </div>;
}
