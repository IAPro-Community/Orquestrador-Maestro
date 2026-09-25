import React,{useMemo,useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import data from '@site/src/generated/site-data.json';

export default function Skills(){
  const [query,setQuery]=useState('');
  const items=useMemo(()=>{
    const needle=query.toLocaleLowerCase('pt-BR');
    return data.skills.filter((skill)=>!needle||[
      skill.id,skill.description,skill.category,...skill.tags,...skill.triggers,...skill.aliases
    ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(needle));
  },[query]);

  return <Layout title="Skills">
    <main className="shell section">
      <span className="eyebrow">CATÁLOGO GERADO</span>
      <h1 className="page-title">Skills do Maestro</h1>
      <p>Não existe lista manual nesta página. O catálogo é reconstruído de <code>SKILLS_MANIFEST.json</code>, <code>SKILLS_ROUTER.json</code>, aliases, chains e <code>PUBLIC_SKILLS_MANIFEST.json</code> em cada deploy.</p>
      <input className="skill-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar skill, trigger, alias ou categoria…" aria-label="Buscar skills"/>
      <p>{items.length} de {data.skills.length}</p>
      <div className="skill-grid">{items.map((skill)=><article key={skill.id}>
        <span>{skill.category||skill.source||'skill'}</span>
        <h3>{skill.id}</h3>
        <p>{skill.description}</p>
        <div className="tags">{(skill.dependencies||[]).slice(0,3).map(dep=><code key={dep}>{dep}</code>)}</div>
        {skill.referenceSlug
          ? <Link to={'/docs/'+skill.referenceSlug+'/'}>Documentação →</Link>
          : skill.publicSourceUrl
            ? <a href={skill.publicSourceUrl}>Fonte da skill →</a>
            : null}
      </article>)}</div>
    </main>
  </Layout>;
}
