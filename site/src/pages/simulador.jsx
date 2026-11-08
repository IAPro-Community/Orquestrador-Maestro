import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import RouterSimulator from '@site/src/components/RouterSimulator';

export default function Page(){
  return <Layout title="Simulador do roteador" description="Simule o roteador público do Maestro com aliases, triggers, capabilities, chains e execution profiles versionados.">
    <main>
      <section className="page-hero compact-hero">
        <div className="shell">
          <span className="eyebrow">ROTEAMENTO V2 · PARIDADE VALIDADA</span>
          <h1 className="page-title">Veja a decisão, não uma animação inventada.</h1>
          <p className="page-lede">A simulação usa aliases, router, chains e execution profiles gerados no build. O CI compara a implementação browser com <code>runtime/planner/intent-router.js</code>.</p>
        </div>
      </section>

      <section className="shell section page-section">
        <div className="route-source-grid">
          <article><strong>1. Evidência</strong><p>Canonical ID, alias, trigger ou capability geram evidência com pesos diferentes.</p></article>
          <article><strong>2. Ranking</strong><p>A rota mais específica e prioritária assume a posição principal.</p></article>
          <article><strong>3. Chains</strong><p>Dependências só entram quando são permitidas para a skill principal e também possuem evidência.</p></article>
          <article><strong>4. Perfil</strong><p>O conjunto selecionado determina o execution profile aplicável.</p></article>
        </div>

        <RouterSimulator/>

        <div className="route-notes">
          <div>
            <span className="eyebrow">LIMITES DA DEMONSTRAÇÃO</span>
            <h2>O navegador não substitui o runtime local.</h2>
          </div>
          <p>O GitHub Pages não possui acesso às skills locais, ao workspace do usuário, aos providers nem à execução real de tarefas. Ele reproduz apenas a decisão pública do roteador sobre o catálogo versionado.</p>
        </div>

        <div className="actions">
          <Link className="btn primary" to="/docs/orquestrador-reference/">Ler referência do orquestrador</Link>
          <Link className="btn" to="/skills">Explorar catálogo</Link>
        </div>
      </section>
    </main>
  </Layout>;
}
