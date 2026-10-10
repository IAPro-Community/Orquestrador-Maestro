import React,{useMemo,useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import data from '@site/src/generated/site-data.json';
import {resolveIntent} from '@site/src/lib/intent-router.mjs';
import {PrototypeHeader,PrototypeFooter} from '@site/src/components/MarketingPrototypeShell';
import '@site/src/css/marketing-prototype.css';

const EXAMPLES=[
 {id:'skill-systematic-debugging',label:'Investigar uma falha'},
 {id:'skill-repo-health',label:'Auditar repositório'},
 {id:'skill-verification-before-completion',label:'Verificar entrega'}
];
const FEATURED=[
 'skill-systematic-debugging',
 'skill-repo-health',
 'skill-verification-before-completion',
 'skill-release-engineering'
];

function RoutePreview(){
 const available=useMemo(()=>EXAMPLES.map(example=>{
  const skill=data.skills.find(s=>s.id===example.id);
  return skill?{...example,query:skill.triggers?.[0]||skill.id}:null;
 }).filter(Boolean),[]);
 const [chosen,setChosen]=useState(0);
 const query=available[chosen]?.query||'skill:skill-repo-health';
 const result=useMemo(()=>resolveIntent(query,{
  aliases:data.aliases,router:data.router,chains:data.chains,profiles:data.profiles
 }),[query]);
 return <div className="mp-demo" id="demonstracao">
  <div className="mp-demo-top">
   <div className="mp-console-title"><span className="mp-live-dot"></span> MAESTRO ROUTER <span className="mp-version">v{data.router.version}</span></div>
   <span className="mp-demo-kind">SIMULAÇÃO PÚBLICA</span>
  </div>
  <div className="mp-demo-inner">
   <div className="mp-demo-prompt">
    <small>01 / INTENÇÃO</small>
    <div className="mp-demo-query">{query}</div>
    <div className="mp-demo-examples" aria-label="Exemplos de roteamento">
     {available.map((x,i)=><button type="button" key={x.id} aria-pressed={i===chosen} className={i===chosen?'is-active':''} onClick={()=>setChosen(i)}>{x.label}</button>)}
    </div>
   </div>
   <div className="mp-demo-track" aria-hidden="true"><span></span><b>ROUTE</b><span></span></div>
   <div className="mp-demo-outcome">
    <small>02 / SKILL SELECIONADA</small>
    <strong>{result.primarySkill?.id||'Sem skill conclusiva'}</strong>
    <dl>
     <div><dt>Confiança</dt><dd>{result.confidence||'—'}</dd></div>
     <div><dt>Perfil</dt><dd>{result.profile||'—'}</dd></div>
    </dl>
    <div className="mp-demo-evidence">
     <span>03 / EVIDÊNCIA</span>
     <p>{result.matchedEvidence?.slice(0,2).map(e=>e.kind+': '+e.value).join(' · ')||'Sem correspondência específica neste exemplo.'}</p>
    </div>
   </div>
  </div>
  <div className="mp-demo-bottom"><span>Roteamento reproduzido das fontes públicas do repositório.</span><Link to="/simulador">Simulador técnico completo ↗</Link></div>
 </div>;
}

function FeaturedSkills(){
 const [query,setQuery]=useState('');
 const preview=useMemo(()=>{
  const canonical=FEATURED.map(id=>data.skills.find(s=>s.id===id)).filter(Boolean);
  return (canonical.length>=2?canonical:data.skills.filter(s=>s.id.startsWith('skill-'))).slice(0,4);
 },[]);
 const results=useMemo(()=>{
  const normalized=query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(!normalized)return preview;
  return data.skills.filter(s=>[s.id,s.description,s.category,...(s.aliases||[]),...(s.triggers||[])].filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(normalized)).slice(0,4);
 },[query,preview]);
 return <div className="mp-discovery-panel">
  <div className="mp-discovery-search"><svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.7" cy="10.7" r="6.7"/><path d="m16 16 5 5"/></svg><input type="search" aria-label="Pesquisar skills" placeholder="Busque por debug, revisão, release…" value={query} onChange={e=>setQuery(e.target.value)}/><span>{results.length} exibidas</span></div>
  <div className="mp-featured-list">
   {results.length?results.map((s,i)=><article key={s.id} className="mp-featured-row">
    <span className="mp-featured-idx">{String(i+1).padStart(2,'0')}</span>
    <div><b>{s.id}</b><p>{s.description||'Skill publicada no catálogo.'}</p></div>
    <span className="mp-featured-tag">{s.category||s.source||'Skill'}</span>
   </article>):<p className="mp-no-result">Nenhuma skill corresponde à busca. Experimente outro termo.</p>}
  </div>
  <Link className="mp-discovery-link" to="/prototipo/skills/">Abrir catálogo pesquisável <span>↗</span></Link>
 </div>;
}

export default function PrototypeHome(){
 return <Layout title="Protótipo de marketing — Maestro" description="Prévia isolada do novo design de marketing do Orquestrador Maestro." noFooter wrapperClassName="maestro-prototype">
  <main className="mp-root">
   <PrototypeHeader/>
   <section className="mp-hero">
    <div className="mp-container mp-hero-grid">
     <div className="mp-hero-copy">
      <div className="mp-overline"><span className="mp-overline-line"></span> UM PROCESSO. VÁRIOS AGENTES.</div>
      <h1>A IA executa.<br/><em>O Maestro dá</em><br/>direção ao trabalho.</h1>
      <p>Menos contexto desnecessário, escolhas de skills rastreáveis e uma entrega que termina em evidência — usando as ferramentas de IA que você já conhece.</p>
      <div className="mp-hero-actions">
       <Link to="/prototipo/#demonstracao" className="mp-btn mp-btn-gold">Experimentar o Maestro <span>↗</span></Link>
       <Link to="/prototipo/skills/" className="mp-btn mp-btn-outline">Explorar skills</Link>
      </div>
      <div className="mp-hero-meta"><span><i></i> LOCAL-FIRST</span><span>OPEN SOURCE</span><span>DOCUMENTAÇÃO VIVA</span></div>
     </div>
     <div className="mp-hero-visual" aria-label="Logomarca oficial sobre a superfície de orquestração">
      <div className="mp-visual-caption">ORQUESTRAÇÃO, NÃO OUTRO MODELO</div>
      <div className="mp-visual-grid" aria-hidden="true"></div>
      <div className="mp-orbit mp-orbit-one" aria-hidden="true"></div>
      <div className="mp-orbit mp-orbit-two" aria-hidden="true"></div>
      <div className="mp-floating-tag mp-tag-left">INTENÇÃO <span>01</span></div>
      <div className="mp-floating-tag mp-tag-right">SKILLS <span>02</span></div>
      <div className="mp-floating-tag mp-tag-bottom">EVIDÊNCIA <span>03</span></div>
      <div className="mp-official-logo"><img src="/Orquestrador-Maestro/img/orquestrador-maestro-logo.png" alt="Logomarca Orquestrador Maestro"/></div>
      <span className="mp-visual-note">Sua IA continua sendo sua. O processo ganha consistência.</span>
     </div>
    </div>
    <div className="mp-container mp-metrics" aria-label="Informações do repositório">
     <div><strong>{data.skills.length}</strong><span>skills públicas indexadas</span></div>
     <div><strong>v{data.router.version}</strong><span>versão do roteador público</span></div>
     <div><strong>{data.benchmark.scenarioCount}</strong><span>cenários disponíveis no harness</span></div>
     <p>Dados do repositório, não indicadores de economia ou desempenho.</p>
    </div>
   </section>
   <section className="mp-clarity" id="produto">
    <div className="mp-container mp-clarity-grid">
     <div className="mp-section-label">01 — O PRODUTO</div>
     <h2>Agentes diferentes.<br/><em>Um jeito consistente</em> de trabalhar.</h2>
     <div className="mp-clarity-text"><p>Sem uma camada de orquestração, cada ferramenta decide sozinha o que ler, quando parar e como declarar uma tarefa concluída.</p><p>O Maestro preserva regras, estado, escolha de skills e verificação entre ferramentas e sessões.</p></div>
    </div>
   </section>
   <section className="mp-demo-section">
    <div className="mp-container">
     <div className="mp-section-heading"><div><span className="mp-section-label">02 — VEJA FUNCIONAR</span><h2>Uma decisão<br/><em>que você consegue explicar.</em></h2></div><p>Escolha um exemplo real do catálogo e acompanhe a intenção, o roteamento e a evidência que fundamenta a seleção.</p></div>
     <RoutePreview/>
    </div>
   </section>
   <section className="mp-benefits">
    <div className="mp-container mp-benefits-grid">
     <div className="mp-benefits-intro"><span className="mp-section-label">03 — O MÉTODO</span><h2>Um fluxo claro.<br/>Sem magia.</h2></div>
     <div className="mp-benefit-list">
      <article><span>01</span><div><h3>Encontre o contexto certo.</h3><p>Leia o mínimo suficiente, aprofunde apenas quando a tarefa exigir.</p></div></article>
      <article><span>02</span><div><h3>Encaminhe para a skill adequada.</h3><p>Roteie por intenção, regras e evidências versionadas.</p></div></article>
      <article><span>03</span><div><h3>Conclua com verificação.</h3><p>Saia da resposta declarativa para o resultado verificável e o handoff.</p></div></article>
     </div>
    </div>
   </section>
   <section className="mp-skills-section" id="skills">
    <div className="mp-container">
     <div className="mp-section-heading"><div><span className="mp-section-label">04 — SKILLS</span><h2>Explore o que o<br/><em>Maestro realmente conhece.</em></h2></div><p>Pesquisa e metadados alimentados pelos manifests e arquivos Markdown do repositório. Sem catálogo inventado.</p></div>
     <FeaturedSkills/>
    </div>
   </section>
   <section className="mp-evidence-section" id="evidencias">
    <div className="mp-container mp-evidence-grid">
     <div><span className="mp-section-label">05 — EVIDÊNCIA</span><h2>Menos promessas.<br/><em>Mais verificabilidade.</em></h2><p>O benchmark separa cenários versionados de resultados certificados. Nenhuma alegação de economia de tokens é publicada sem execução verificável.</p><Link to="/benchmark" className="mp-inline-link">Conheça a metodologia <span>↗</span></Link></div>
     <div className="mp-proof-list"><div><strong>{data.benchmark.scenarioCount}</strong><span>Cenários atualmente versionados</span></div><div><strong>3</strong><span>Condições previstas na metodologia</span></div><div><strong>—</strong><span>Economia de tokens certificada neste site</span></div></div>
    </div>
   </section>
   <section className="mp-install-section" id="instalar">
    <div className="mp-container mp-install-grid">
     <div><span className="mp-section-label">06 — PRÓXIMO PASSO</span><h2>Escolha sua IA.<br/><em>Comece com o Maestro.</em></h2><p>Use o fluxo de instalação documentado. O pacote atual requer Node.js 20.19 ou superior.</p><Link to="/docs/installation/" className="mp-btn mp-btn-dark">Ver guia de instalação <span>↗</span></Link></div>
     <div className="mp-terminal"><div className="mp-terminal-head"><span><i></i><i></i><i></i></span><b>TERMINAL</b><small>NODE 20.19+</small></div><pre><code>{'npm install -g @iapro/orquestrador-maestro-cli@latest\n\norquestrador-maestro install\norquestrador-maestro verify'}</code></pre></div>
    </div>
   </section>
   <PrototypeFooter/>
  </main>
 </Layout>;
}
