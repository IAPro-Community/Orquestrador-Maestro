import React,{useMemo,useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import docs from '@site/src/generated/docs.json';

export default function Documentation(){
  const [query,setQuery]=useState('');
  const items=useMemo(()=>{
    const needle=query.toLocaleLowerCase('pt-BR');
    return docs.documents.filter((doc)=>!needle||(doc.title+' '+doc.searchText).toLocaleLowerCase('pt-BR').includes(needle)).slice(0,120);
  },[query]);
  return <Layout title="Documentação">
    <main className="shell section">
      <span className="eyebrow">MARKDOWN DO REPOSITÓRIO</span>
      <h1 className="page-title">Documentação</h1>
      <p>Estas páginas são renderizadas a partir dos arquivos Markdown do próprio repositório. Não há cópia editorial separada.</p>
      <input className="skill-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar documentação…" aria-label="Pesquisar documentação"/>
      <div className="docs-grid">{items.map(doc=><Link key={doc.id} to={'/docs/'+doc.slug+'/'}>
        <h3>{doc.title}</h3><p>{doc.excerpt}</p><small>{doc.sourcePath}</small>
      </Link>)}</div>
    </main>
  </Layout>;
}
