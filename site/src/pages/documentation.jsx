import React,{useMemo,useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import docs from '@site/src/generated/docs.json';

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
  const sections=useMemo(()=>['Todas',...new Set(docs.documents.map(doc=>sectionOf(doc.sourcePath)))],[]);

  const items=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase('pt-BR');
    return docs.documents.filter(doc=>{
      const matchesText=!needle||(doc.title+' '+doc.searchText+' '+doc.sourcePath).toLocaleLowerCase('pt-BR').includes(needle);
      const matchesSection=section==='Todas'||sectionOf(doc.sourcePath)===section;
      return matchesText&&matchesSection;
    });
  },[query,section]);

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
            <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: memória, instalação, skills, benchmark…" aria-label="Pesquisar documentação"/>
          </label>
          <label>
            <span>Seção</span>
            <select value={section} onChange={e=>setSection(e.target.value)}>
              {sections.map(x=><option key={x}>{x}</option>)}
            </select>
          </label>
        </div>

        <div className="docs-start">
          <Link to="/docs/START-HERE/"><strong>Comece aqui</strong><span>Fluxo inicial de 10 minutos →</span></Link>
          <Link to="/docs/installation/"><strong>Instalação</strong><span>Windows, Linux, macOS e rollback →</span></Link>
          <Link to="/docs/skills/"><strong>Portal de skills</strong><span>Escolha, receitas e referência →</span></Link>
          <Link to="/docs/benchmark/"><strong>Benchmark</strong><span>Metodologia e evidence gate →</span></Link>
        </div>

        <div className="result-summary"><strong>{items.length}</strong> documentos encontrados</div>
        <div className="docs-grid docs-grid-index">{items.map(doc=>{
          const body=<>
            <small>{sectionOf(doc.sourcePath)}</small>
            <h3>{doc.title}</h3>
            <p>{doc.excerpt}</p>
            <code className="doc-path">{doc.sourcePath}</code>
          </>;
          return doc.siteRoute
            ? <Link key={doc.id} to={doc.siteRoute}>{body}</Link>
            : <a key={doc.id} href={doc.sourceUrl}>{body}</a>;
        })}</div>
      </section>
    </main>
  </Layout>;
}
