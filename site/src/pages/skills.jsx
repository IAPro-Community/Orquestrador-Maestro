import React,{useEffect,useMemo,useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import data from '@site/src/generated/site-data.json';

const ALL='all';
const PAGE_SIZE=24;

function normalizedString(value){
  if(value===null||value===undefined) return '';
  if(Array.isArray(value)) return value.join(' ');
  return String(value);
}

export default function Skills(){
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState(ALL);
  const [risk,setRisk]=useState(ALL);
  const [selected,setSelected]=useState(null);
  const [visibleCount,setVisibleCount]=useState(PAGE_SIZE);

  const categories=useMemo(()=>{
    const values=data.skills.map(s=>normalizedString(s.category)).filter(Boolean);
    return [ALL,...Array.from(new Set(values)).sort((a,b)=>a.localeCompare(b,'pt-BR'))];
  },[]);

  const risks=useMemo(()=>{
    const values=data.skills.map(s=>normalizedString(s.risk||s.safety)).filter(Boolean);
    return [ALL,...Array.from(new Set(values)).sort((a,b)=>a.localeCompare(b,'pt-BR'))];
  },[]);

  const items=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase('pt-BR');
    return data.skills.filter(skill=>{
      const haystack=[
        skill.id,skill.description,skill.category,skill.risk,skill.safety,skill.source,
        ...(skill.tags||[]),...(skill.triggers||[]),...(skill.aliases||[]),...(skill.dependencies||[])
      ].map(normalizedString).filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');

      const effectiveCategory=normalizedString(skill.category);
      const effectiveRisk=normalizedString(skill.risk||skill.safety);

      return (!needle||haystack.includes(needle))
        && (category===ALL||effectiveCategory===category)
        && (risk===ALL||effectiveRisk===risk);
    });
  },[query,category,risk]);

  useEffect(()=>setVisibleCount(PAGE_SIZE),[query,category,risk]);

  const visibleItems=items.slice(0,visibleCount);
  const selectedSkill=selected?data.skills.find(s=>s.id===selected):null;

  function clearFilters(){
    setQuery('');
    setCategory(ALL);
    setRisk(ALL);
  }

  return <Layout title="Skills" description="Catálogo pesquisável de skills gerado diretamente das fontes canônicas do Orquestrador Maestro.">
    <main>
      <section className="page-hero compact-hero">
        <div className="shell">
          <span className="eyebrow">CATÁLOGO GERADO DO REPOSITÓRIO</span>
          <h1 className="page-title">Skills, sem catálogo manual.</h1>
          <p className="page-lede">A página é reconstruída a cada deploy a partir de <code>SKILLS_MANIFEST.json</code>, <code>SKILLS_ROUTER.json</code>, aliases, chains e <code>PUBLIC_SKILLS_MANIFEST.json</code>.</p>
        </div>
      </section>

      <section className="shell section page-section">
        <div className="explorer-toolbar">
          <label className="search-field">
            <span>Pesquisar</span>
            <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Skill, trigger, alias, dependência…" aria-label="Buscar skills"/>
          </label>
          <label>
            <span>Categoria</span>
            <select value={category} onChange={e=>setCategory(e.target.value)}>
              {categories.map(value=><option key={value} value={value}>{value===ALL?'Todas':value}</option>)}
            </select>
          </label>
          <label>
            <span>Risco</span>
            <select value={risk} onChange={e=>setRisk(e.target.value)}>
              {risks.map(value=><option key={value} value={value}>{value===ALL?'Todos':value}</option>)}
            </select>
          </label>
        </div>

        <div className="result-summary" aria-live="polite">
          <span><strong>{items.length}</strong> de {data.skills.length} skills encontradas</span>
          {(query||category!==ALL||risk!==ALL)&&<button type="button" onClick={clearFilters}>Limpar filtros</button>}
        </div>

        <div className="skills-layout">
          <div>
            {visibleItems.length>0?<div className="skill-grid skill-grid-dense">
              {visibleItems.map(skill=><article key={skill.id} className={selected===skill.id?'is-selected':''}>
                <div className="skill-preview-head">
                  <span>{normalizedString(skill.category)||normalizedString(skill.source)||'skill'}</span>
                  {(skill.risk||skill.safety)&&<small>{normalizedString(skill.risk||skill.safety)}</small>}
                </div>
                <h3>{skill.id}</h3>
                <p>{skill.description||'Sem descrição publicada.'}</p>
                <div className="skill-card-meta">
                  <span>{(skill.triggers||[]).length} triggers</span>
                  <span>{(skill.dependencies||[]).length} dependências</span>
                </div>
                <div className="skill-card-actions">
                  <button type="button" onClick={()=>setSelected(skill.id)} aria-pressed={selected===skill.id}>Inspecionar skill</button>
                  {skill.referenceSlug
                    ? <Link to={'/docs/'+skill.referenceSlug+'/'}>Ver documentação</Link>
                    : skill.publicSourceUrl
                      ? <a href={skill.publicSourceUrl}>Ver código-fonte</a>
                      : null}
                </div>
              </article>)}
            </div>:<div className="empty-state">
              <strong>Nenhuma skill encontrada.</strong>
              <p>Ajuste a busca ou remova os filtros aplicados.</p>
              <button type="button" onClick={clearFilters}>Limpar filtros</button>
            </div>}

            {visibleCount<items.length&&<div className="load-more">
              <button type="button" onClick={()=>setVisibleCount(count=>count+PAGE_SIZE)}>
                Mostrar mais {Math.min(PAGE_SIZE,items.length-visibleCount)} skills
              </button>
              <span>{visibleItems.length} de {items.length} exibidas</span>
            </div>}
          </div>

          <aside className="skill-inspector" aria-live="polite">
            {selectedSkill?<>
              <span className="eyebrow">DETALHE CANÔNICO</span>
              <h2>{selectedSkill.id}</h2>
              <p>{selectedSkill.description||'Sem descrição publicada.'}</p>

              <dl>
                <div><dt>Categoria</dt><dd>{normalizedString(selectedSkill.category)||'—'}</dd></div>
                <div><dt>Risco</dt><dd>{normalizedString(selectedSkill.risk||selectedSkill.safety)||'—'}</dd></div>
                <div><dt>Fonte</dt><dd>{normalizedString(selectedSkill.source)||'—'}</dd></div>
                <div><dt>Prioridade</dt><dd>{selectedSkill.priority??'—'}</dd></div>
              </dl>

              <div className="inspector-block">
                <strong>Triggers</strong>
                <div className="evidence-tags">{(selectedSkill.triggers||[]).length?selectedSkill.triggers.map(x=><code key={normalizedString(x)}>{normalizedString(x)}</code>):<span className="muted">Nenhum trigger publicado.</span>}</div>
              </div>
              <div className="inspector-block">
                <strong>Aliases</strong>
                <div className="evidence-tags">{(selectedSkill.aliases||[]).length?selectedSkill.aliases.map(x=><code key={normalizedString(x)}>{normalizedString(x)}</code>):<span className="muted">Nenhum alias publicado.</span>}</div>
              </div>
              <div className="inspector-block">
                <strong>Pode invocar</strong>
                <div className="evidence-tags">{(selectedSkill.dependencies||[]).length?selectedSkill.dependencies.map(x=><code key={normalizedString(x)}>{normalizedString(x)}</code>):<span className="muted">Nenhuma chain publicada.</span>}</div>
              </div>

              <div className="actions inspector-actions">
                {selectedSkill.referenceSlug&&<Link className="btn primary" to={'/docs/'+selectedSkill.referenceSlug+'/'}>Abrir documentação</Link>}
                {selectedSkill.publicSourceUrl&&<a className="btn" href={selectedSkill.publicSourceUrl}>Ver fonte</a>}
              </div>
            </>:<>
              <span className="eyebrow">COMO USAR</span>
              <h2>Selecione uma skill.</h2>
              <p>O painel mostra somente metadados publicados no repositório: triggers, aliases, dependências, risco e fonte.</p>
              <p className="muted">Isso evita inventar capacidades que não existem no catálogo real.</p>
            </>}
          </aside>
        </div>
      </section>
    </main>
  </Layout>;
}
