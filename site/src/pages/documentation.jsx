import React,{useEffect,useMemo,useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import docs from '@site/src/generated/docs.json';

const PAGE_SIZE=24;

function normalizeSearch(value=''){
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('pt-BR');
}

function sectionOf(path=''){
  if(path.startsWith('docs/skills/')) return 'Skills';
  if(path.startsWith('docs/architecture/')||path.startsWith('docs/rfcs/')) return 'Arquitetura e RFCs';
  if(path.startsWith('docs/product/')) return 'Produto';
  if(path.startsWith('docs/')) return 'Guias';
  return 'Referência raiz';
}

export default function Documentation(){
  const [query,setQuery]=useState('');
  const [section,setSection]=useState('Todas');
  const [visibleCount,setVisibleCount]=useState(PAGE_SIZE);

  const sections=useMemo(()=>{
    const values=docs.documents.map(doc=>sectionOf(doc.sourcePath));
    return ['Todas',...Array.from(new Set(values)).sort((a,b)=>a.localeCompare(b,'pt-BR'))];
  },[]);

  const items=useMemo(()=>{
    const needle=normalizeSearch(query.trim());
    return docs.documents.filter(doc=>{
      const haystack=normalizeSearch([doc.title,doc.searchText,doc.sourcePath,sectionOf(doc.sourcePath)].filter(Boolean).join(' '));
      return (!needle||haystack.includes(needle))
        && (section==='Todas'||sectionOf(doc.sourcePath)===section);
    });
  },[query,section]);

  useEffect(()=>setVisibleCount(PAGE_SIZE),[query,section]);
  const visibleItems=items.slice(0,visibleCount);

  function clearFilters(){
    setQuery('');
    setSection('Todas');
  }

  return <Layout title="Documentação" description="Índice pesquisável da documentação Markdown do Orquestrador Maestro.">
    <main>
      <section className="page-hero compact-hero">
        <div className="shell">
          <span className="eyebrow">MARKDOWN FIRST</span>
          <h1 className="page-title">A documentação é o próprio repositório.</h1>
          <p className="page-lede">O índice é reconstruído no build. Documentos em <code>docs/</code> são renderizados pelo Docusaurus; arquivos raiz continuam apontando para sua fonte oficial.</p>
        </div>
      </section>

      <section className="shell section page-section">
        <div className="docs-toolbar">
          <label className="search-field">
            <span>Pesquisar documentação</span>
            <input type="search" value={query} onInput={e=>setQuery(e.currentTarget.value)} placeholder="Ex.: memória, instalação, skills, benchmark…" aria-label="Pesquisar documentação" autoComplete="off"/>
          </label>
          <label>
            <span>Seção</span>
            <select value={section} onChange={e=>setSection(e.target.value)}>
              {sections.map(value=><option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>

        <div className="docs-start">
          <Link to="/docs/START-HERE/"><strong>Comece aqui</strong><span>Fluxo inicial de 10 minutos →</span></Link>
          <Link to="/docs/installation/"><strong>Instalação</strong><span>Windows, Linux, macOS e rollback →</span></Link>
          <Link to="/docs/skills/"><strong>Portal de skills</strong><span>Escolha, receitas e referência →</span></Link>
          <Link to="/docs/benchmark/"><strong>Benchmark</strong><span>Metodologia e evidence gate →</span></Link>
        </div>

        <div className="result-summary" aria-live="polite">
          <span><strong>{items.length}</strong> documentos encontrados{query.trim()?<> para <q>{query.trim()}</q></>:null}</span>
          {(query||section!=='Todas')&&<button type="button" onClick={clearFilters}>Limpar filtros</button>}
        </div>

        {visibleItems.length>0?<div className="docs-grid docs-grid-index">{visibleItems.map(doc=>{
          const body=<>
            <small>{sectionOf(doc.sourcePath)}</small>
            <h3>{doc.title}</h3>
            <p>{doc.excerpt}</p>
            <code className="doc-path">{doc.sourcePath}</code>
          </>;
          return doc.siteRoute
            ? <Link key={doc.id} to={doc.siteRoute}>{body}</Link>
            : <a key={doc.id} href={doc.sourceUrl}>{body}</a>;
        })}</div>:<div className="empty-state">
          <strong>Nenhum documento encontrado.</strong>
          <p>Ajuste a busca ou remova o filtro de seção.</p>
          <button type="button" onClick={clearFilters}>Limpar filtros</button>
        </div>}

        {visibleCount<items.length&&<div className="load-more">
          <button type="button" onClick={()=>setVisibleCount(count=>count+PAGE_SIZE)}>
            Mostrar mais {Math.min(PAGE_SIZE,items.length-visibleCount)} documentos
          </button>
          <span>{visibleItems.length} de {items.length} exibidos</span>
        </div>}
      </section>
    </main>
  </Layout>;
}
