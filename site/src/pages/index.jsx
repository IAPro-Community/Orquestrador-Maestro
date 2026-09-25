import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import data from '@site/src/generated/site-data.json';
import RouterSimulator from '@site/src/components/RouterSimulator';

export default function Home(){
  return <Layout title="Orquestração inteligente de agentes de IA" description="O Maestro organiza contexto, skills, execução e evidência entre diferentes ferramentas de IA.">
    <main>
      <section className="hero">
        <div className="shell hero-grid">
          <div>
            <span className="eyebrow">ORQUESTRAÇÃO INTELIGENTE DE AGENTES DE IA</span>
            <h1>Você escolhe a IA. <em>O Maestro organiza o trabalho.</em></h1>
            <p>Use o mesmo processo com Codex, Claude, OpenCode, Cursor, Gemini e outras ferramentas: contexto mínimo suficiente, skill certa e verificação antes da conclusão.</p>
            <div className="actions">
              <Link className="btn primary" to="/simulador">Simular roteamento</Link>
              <Link className="btn" to="/skills">Explorar {data.skills.length} skills</Link>
            </div>
          </div>
          <div className="logo-stage"><img src="/Orquestrador-Maestro/img/orquestrador-maestro-logo.png" alt="Orquestrador Maestro"/></div>
        </div>
      </section>
      <section className="shell section">
        <h2>Como funciona</h2>
        <div className="steps">{['Observe','Route','Select','Act','Verify','Report'].map((x,i)=><article key={x}><b>{i+1}</b><h3>{x}</h3></article>)}</div>
      </section>
      <section className="shell section">
        <div className="section-head">
          <div><span className="eyebrow">SIMULAÇÃO FIEL</span><h2>O mesmo algoritmo de roteamento, validado por paridade.</h2></div>
          <p>O CI compara a implementação usada no site com <code>runtime/planner/intent-router.js</code> sobre aliases, triggers, capacidades e invocações canônicas.</p>
        </div>
        <RouterSimulator/>
      </section>
      <section className="shell section">
        <div className="stats">
          <article><strong>{data.skills.length}</strong><span>skills indexadas</span></article>
          <article><strong>{data.benchmark.scenarioCount}</strong><span>cenários de benchmark versionados</span></article>
          <article><strong>v{data.router.version}</strong><span>roteador público</span></article>
        </div>
      </section>
    </main>
  </Layout>;
}
