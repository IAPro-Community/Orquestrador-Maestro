import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';

export default function Architecture(){
  return <Layout title="Arquitetura" description="Arquitetura atual implementada do Orquestrador Maestro.">
    <main>
      <section className="page-hero compact-hero">
        <div className="shell">
          <span className="eyebrow">ARQUITETURA IMPLEMENTADA</span>
          <h1 className="page-title">Uma camada portátil entre projeto e ferramentas de IA.</h1>
          <p className="page-lede">O pacote atual é Node.js/CommonJS, com CLI, instaladores, contexto de projeto, roteamento de skills e runtime local aditivo.</p>
        </div>
      </section>

      <section className="shell section page-section">
        <div className="system-shape">
          <article className="system-core"><small>ENTRYPOINT</small><strong>CLI</strong><p>install · verify · doctor · DEV helpers · runtime · bridge · providers</p></article>
          <div className="system-arrow">↓</div>
          <div className="system-grid">
            <article><small>REGRAS</small><strong>Persistence contract</strong><p>Instruções globais e locais.</p></article>
            <article><small>SKILLS</small><strong>Registry + synchronizer</strong><p>Manifest, router, aliases, chains e biblioteca.</p></article>
            <article><small>WORKFLOWS</small><strong>Declarativos e opt-in</strong><p>Sequências aprovadas de execução.</p></article>
            <article><small>TOOLS</small><strong>Profiles + entrypoints</strong><p>Codex, OpenCode, Claude, Cursor, Gemini e outros.</p></article>
            <article><small>MEMÓRIA</small><strong>DEV/</strong><p>Estado humano-legível e durável do projeto.</p></article>
            <article><small>RUNTIME</small><strong>Application API</strong><p>Run Store, providers, verification engine e bridge.</p></article>
          </div>
        </div>

        <div className="architecture-principles">
          <article><strong>Contexto e persistência</strong><p><code>DEV/</code> continua separado da instalação do pacote e dos dados privados do usuário.</p></article>
          <article><strong>Skills</strong><p>O manifest é o registro canônico; conteúdo comunitário fica sob demanda em vez de ser copiado em massa.</p></article>
          <article><strong>Integrações</strong><p>Profiles apontam ferramentas para regras, contexto e roteador compartilhados; não duplicam a lógica de orquestração.</p></article>
          <article><strong>Privacidade</strong><p>O snapshot público é sanitizado e a telemetria é opt-in, sem conteúdo de projeto, prompts, caminhos ou secrets.</p></article>
        </div>

        <div className="actions">
          <Link className="btn primary" to="/docs/architecture/MAESTRO_CURRENT_ARCHITECTURE/">Ler arquitetura canônica</Link>
          <Link className="btn" to="/documentation">Explorar documentação</Link>
        </div>
      </section>
    </main>
  </Layout>;
}
