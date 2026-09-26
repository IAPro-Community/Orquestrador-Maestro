import React,{useMemo,useState} from 'react';
import Link from '@docusaurus/Link';
import data from '@site/src/generated/site-data.json';

export default function SkillSearchShowcase(){
  const [query,setQuery]=useState('');
  const results=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase('pt-BR');
    const list=data.skills.filter(skill=>{
      if(!needle) return true;
      return [
        skill.id,skill.description,skill.category,skill.risk,skill.safety,
        ...(skill.tags||[]),...(skill.triggers||[]),...(skill.aliases||[]),...(skill.dependencies||[])
      ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(needle);
    });
    return list.slice(0,6);
  },[query]);

  return <div className="marketing-skill-search">
    <div className="marketing-search-bar">
      <label htmlFor="marketing-skill-query">Pesquisar no catálogo real</label>
      <div>
        <input
          id="marketing-skill-query"
          type="search"
          value={query}
          onChange={e=>setQuery(e.target.value)}
          placeholder="Ex.: debug, release, frontend, segurança…"
        />
        <Link to="/skills">Abrir catálogo completo</Link>
      </div>
    </div>

    <div className="marketing-skill-results" aria-live="polite">
      {results.map(skill=><article key={skill.id}>
        <div>
          <small>{skill.category||skill.source||'skill'}</small>
          {(skill.risk||skill.safety)&&<span>{skill.risk||skill.safety}</span>}
        </div>
        <h3>{skill.id}</h3>
        <p>{skill.description||'Sem descrição publicada.'}</p>
        <footer>
          <span>{(skill.triggers||[]).length} triggers</span>
          <span>{(skill.dependencies||[]).length} chains</span>
        </footer>
      </article>)}
    </div>
  </div>;
}
