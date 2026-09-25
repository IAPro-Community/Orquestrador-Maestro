import React,{useMemo,useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import data from '@site/src/generated/site-data.json';

const ALL='all';

export default function Skills(){
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState(ALL);
  const [risk,setRisk]=useState(ALL);
  const [selected,setSelected]=useState(null);

  const categories=useMemo(()=>[ALL,...new Set(data.skills.map(s=>s.category).filter(Boolean))].sort(),[]);
  const risks=useMemo(()=>[ALL,...new Set(data.skills.map(s=>s.risk||s.safety).filter(Boolean))].sort(),[]);

  const items=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase('pt-BR');
    return data.skills.filter(skill=>{
      const haystack=[
        skill.id,skill.description,skill.category,skill.risk,skill.safety,skill.source,
        ...(skill.tags||[]),...(skill.triggers||[]),...(skill.aliases||[]),...(skill.dependencies||[])
      ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      const matchesQuery=!needle||haystack.includes(needle);
      const matchesCategory=category===ALL||skill.category===category;
      const effectiveRisk=skill.risk||skill.safety||null;
      const matchesRisk=risk===ALL||effectiveRisk===risk;
      return matchesQuery&&matchesCategory&&matchesRisk;
    });
  },[query,category,risk]);

  const selectedSkill=selected?data.skills.find(s=>s.id===selected):null;

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

        <div className="result-summary">
          <strong>{items.length}</strong> de {data.skills.length} skills encontradas
          {(query||category!==ALL||risk!==ALL)&&<button type="button" onClick={()=>{setQuery('');setCategory(ALL);setRisk(ALL)}}>Limpar filtros</button>}
        </div>

        <div className="skills-layout">
          <div className="skill-grid skill-grid-dense">
            {items.map(skill=><article key={skill.id} className={selected===skill.id?'is-selected':''}>
              <div className="skill-preview-head">
                <span>{skill.category||skill.source||'skill'}</span>
                {(skill.risk||skill.safety)&&<small>{skill.risk||skill.safety}</small>}
              </div>
              <h3>{skill.id}</h3>
              <p>{skill.description||'Sem descrição publicada.'}</p>
              <div className="skill-card-meta">
                <span>{(skill.triggers||[]).length} triggers</span>
                <span>{(skill.dependencies||[]).length} dependências</span>
              </div>
              <div className="skill-card-actions">
                <button type="button" onClick={()=>setSelected(skill.id)}>Inspecionar</button>
                {skill.referenceSlug
                  ? <Link to={'/docs/'+skill.referenceSlug+'/'}>Documentação</Link>
                  : skill.publicSourceUrl
                    ? <a href={skill.publicSourceUrl}>Fonte</a>
                    : null}
              </div>
            </article>)}
          </div>

          <aside className="skill-inspector" aria-live="polite">
            {selectedSkill?<>
              <span className="eyebrow">DETALHE CANÔNICO</span>
              <h2>{selectedSkill.id}</h2>
              <p>{selectedSkill.description||'Sem descrição publicada.'}</p>

              <dl>
                <div><dt>Categoria</dt><dd>{selectedSkill.category||'—'}</dd></div>
                <div><dt>Risco</dt><dd>{selectedSkill.risk||selectedSkill.safety||'—'}</dd></div>
                <div><dt>Fonte</dt><dd>{selectedSkill.source||'—'}</dd></div>
                <div><dt>Prioridade</dt><dd>{selectedSkill.priority??'—'}</dd></div>
              </dl>

              <div className="inspector-block">
                <strong>Triggers</strong>
                <div className="evidence-tags">{(selectedSkill.triggers||[]).length?selectedSkill.triggers.map(x=><code key={x}>{x}</code>):<span className="muted">Nenhum trigger publicado.</span>}</div>
              </div>
              <div className="inspector-block">
                <strong>Aliases</strong>
                <div className="evidence-tags">{(selectedSkill.aliases||[]).length?selectedSkill.aliases.map(x=><code key={x}>{x}</code>):<span className="muted">Nenhum alias publicado.</span>}</div>
              </div>
              <div className="inspector-block">
                <strong>Pode invocar</strong>
                <div className="evidence-tags">{(selectedSkill.dependencies||[]).length?selectedSkill.dependencies.map(x=><code key={x}>{x}</code>):<span className="muted">Nenhuma chain publicada.</span>}</div>
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
