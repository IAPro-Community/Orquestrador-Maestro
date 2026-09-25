import React from 'react';
import Layout from '@theme/Layout';
import RouterSimulator from '@site/src/components/RouterSimulator';

export default function Page(){
  return <Layout title="Simulador do roteador">
    <main className="shell section">
      <span className="eyebrow">ROTEAMENTO V2</span>
      <h1 className="page-title">Simule como o Maestro encontra uma skill.</h1>
      <p>A seleção usa as fontes canônicas geradas no build: aliases, router, chains e execution profiles.</p>
      <RouterSimulator/>
    </main>
  </Layout>;
}
