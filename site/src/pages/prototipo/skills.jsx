import React,{useMemo,useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import data from '@site/src/generated/site-data.json';
import {PrototypeHeader,PrototypeFooter} from '@site/src/components/MarketingPrototypeShell';
import '@site/src/css/marketing-prototype.css';

const norm=v=>String(v==null?'':v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const CAP=12;
function SkillDetail({skill}){
 return <div className="mp-skill-extra">
  <div><b>Origem</b><span>{skill.source||'Manifest canônico'}</span></div>
  <div><b>Risco</b><span>{skill.risk||skill.safety||'Não classificado'}</span></div>
  <div><b>Triggers publicados</b><span>{(skill.triggers||[]).slice(0,4).join(' · ')||'Nenhum trigger publicado'}</span></div>
  <div><b>Aliases</b><span>{(skill.aliases||[]).slice(0,4).join(' · ')||'Nenhum alias publicado'}</span></div>
  <div className="mp-skill-links">
   {skill.referenceSlug&&<Link to={'/docs/'+skill.referenceSlug+'/'}>Documentação ↗</Link>}
   {skill.publicSourceUrl&&<a href={skill.publicSourceUrl}>Fonte ↗</a>}
  </div>
 </div>;
}
export default function PrototypeSkills(){
 const [query,setQuery]=useState('');
 const [category,setCategory]=useState('all');
 const [count,setCount]=useState(CAP);
 const categories=useMemo(()=>['all',...new Set(data.skills.map(s=>s.category).filter(Boolean))],[]);
 const items=useMemo(()=>data.skills.filter(s=>{
  const haystack=[s.id,s.description,s.category,s.source,...(s.triggers||[]),...(s.aliases||[])].filter(Boolean).join(' ');
  return (!query||norm(haystack).includes(norm(query)))&&(category==='all'||s.category===category);
 }),[query,category]);
 const visible=items.slice(0,count);
 function changeQuery(x){setQuery(x);setCount(CAP);}
 function changeCategory(x){setCategory(x);setCount(CAP);}
 return <Layout title="Protótipo — catálogo de skills" description="Protótipo mobile-first do catálogo pesquisável de skills do Maestro" noFooter wrapperClassName="maestro-prototype">
  <main className="mp-root mp-skills-page">
   <PrototypeHeader/>
   <section className="mp-catalog-hero">
    <div className="mp-container">
     <Link to="/prototipo/" className="mp-back-link">← Voltar ao protótipo</Link>
     <div className="mp-section-label">EXPLORADOR DE SKILLS / FONTES CANÔNICAS</div>
     <h1>Encontre a skill<br/><em>certa para a tarefa.</em></h1>
     <p>Pesquise por intenção, alias, categoria ou descrição. Tudo vem do repositório; nenhum resultado foi adicionado manualmente para a apresentação.</p>
     <div className="mp-catalog-total"><b>{data.skills.length}</b><span>skills indexadas no build</span></div>
    </div>
   </section>
   <section className="mp-container mp-catalog-main">
    <div className="mp-catalog-search">
     <label htmlFor="mp-skill-search">PESQUISAR NO CATÁLOGO</label>
     <div className="mp-catalog-input"><svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.7" cy="10.7" r="6.7"/><path d="m16 16 5 5"/></svg><input id="mp-skill-search" type="search" value={query} onChange={e=>changeQuery(e.target.value)} placeholder="Ex.: debugging, segurança, release"/>{query&&<button type="button" onClick={()=>changeQuery('')} aria-label="Limpar pesquisa">×</button>}</div>
    </div>
    <div className="mp-catalog-categories" aria-label="Filtrar por categoria">
     {categories.map(c=><button type="button" key={c} aria-pressed={c===category} onClick={()=>changeCategory(c)}>{c==='all'?'Todas':c}</button>)}
    </div>
    <div className="mp-catalog-status" aria-live="polite"><strong>{items.length}</strong> resultados encontrados <span>Catálogo atualizado a cada build</span></div>
    {visible.length>0?<div className="mp-catalog-list">
     {visible.map((skill,i)=><details key={skill.id} className="mp-catalog-card">
      <summary>
       <span className="mp-card-index">{String(i+1).padStart(2,'0')}</span>
       <span className="mp-card-main">
        <small>{skill.category||skill.source||'Skill publicada'}</small>
        <strong>{skill.id}</strong>
        <span>{skill.description||'Sem descrição publicada no manifest.'}</span>
       </span>
       <span className="mp-card-chevron" aria-hidden="true">+</span>
      </summary>
      <SkillDetail skill={skill}/>
     </details>)}
    </div>:<div className="mp-no-result"><strong>Nenhuma skill encontrada.</strong><p>Tente buscar por outro termo ou limpe os filtros.</p><button type="button" onClick={()=>{changeQuery('');changeCategory('all')}}>Limpar filtros</button></div>}
    {count<items.length&&<button type="button" className="mp-more" onClick={()=>setCount(x=>x+CAP)}>Carregar mais skills <span>{Math.min(CAP,items.length-count)} próximas ↓</span></button>}
    <p className="mp-catalog-source">Fonte: SKILLS_MANIFEST, SKILLS_ROUTER e PUBLIC_SKILLS_MANIFEST. Dados exibidos conforme a versão publicada.</p>
   </section>
   <PrototypeFooter/>
  </main>
 </Layout>;
}
