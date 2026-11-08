import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';

const flow=[
  ['Observe','Entender o pedido, as regras aplicáveis e o estado atual.'],
  ['Route','Resolver a intenção e identificar a skill principal.'],
  ['Select','Carregar o mínimo suficiente de contexto, chains e capacidades.'],
  ['Act','Executar dentro do escopo e das autorizações disponíveis.'],
  ['Verify','Testar o resultado e verificar invariantes.'],
  ['Report','Registrar evidência, handoff e próximo estado útil.']
];

export default function HowItWorks(){
  return <Layout title="Como funciona" description="Fluxo operacional do Orquestrador Maestro entre diferentes ferramentas de IA.">
    <main>
      <section className="page-hero">
        <div className="shell narrow">
          <span className="eyebrow">UM PROCESSO · VÁRIAS FERRAMENTAS</span>
          <h1 className="page-title">O Maestro organiza o método, não substitui sua IA.</h1>
          <p className="page-lede">Codex, Claude, OpenCode, Cursor, Gemini e outros clientes continuam responsáveis por runtime, login, modelo e credenciais. O Maestro mantém regras, contexto, roteamento, verificação e estado útil do projeto.</p>
        </div>
      </section>

      <section className="shell section page-section">
        <ol className="process-flow process-flow-large">
          {flow.map(([title,description],i)=><li key={title}><span>{String(i+1).padStart(2,'0')}</span><h3>{title}</h3><p>{description}</p></li>)}
        </ol>

        <div className="architecture-strip">
          <div><small>ENTRADA</small><strong>Pedido + regras + estado</strong></div>
          <span>→</span>
          <div><small>ROTEAMENTO</small><strong>Skill + contexto mínimo</strong></div>
          <span>→</span>
          <div><small>EXECUÇÃO</small><strong>Ferramenta de IA</strong></div>
          <span>→</span>
          <div><small>SAÍDA</small><strong>Evidência + handoff</strong></div>
        </div>

        <div className="comparison-grid">
          <article>
            <small>SEM ORQUESTRAÇÃO</small>
            <ul>
              <li>A IA decide sozinha o que ler.</li>
              <li>Contexto cresce sem critério.</li>
              <li>“Pronto” pode ser só uma afirmação.</li>
              <li>Cada ferramenta cria seu próprio ritual.</li>
            </ul>
          </article>
          <article className="comparison-positive">
            <small>COM MAESTRO</small>
            <ul>
              <li>Começa pelas regras, estado e skill certa.</li>
              <li>Lê o mínimo suficiente e aprofunda sob demanda.</li>
              <li>Verificação e handoff fazem parte do trabalho.</li>
              <li>O processo se mantém entre ferramentas e sessões.</li>
            </ul>
          </article>
        </div>

        <div className="actions">
          <Link className="btn primary" to="/simulador">Testar roteamento</Link>
          <Link className="btn" to="/docs/START-HERE/">Começar em 10 minutos</Link>
        </div>
      </section>
    </main>
  </Layout>;
}
