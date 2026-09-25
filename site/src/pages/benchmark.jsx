import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import data from '@site/src/generated/site-data.json';

export default function Benchmark(){
  return <Layout title="Benchmark">
    <main className="shell section">
      <span className="eyebrow">EVIDÊNCIA, NÃO PROMESSA</span>
      <h1 className="page-title">Benchmark reproduzível</h1>
      <p>O site não publica uma taxa fixa de economia de tokens sem evidência. O harness compara o mesmo cenário, modelo e critérios de aceitação e preserva a evidência.</p>
      <div className="stats">
        <article><strong>{data.benchmark.scenarioCount}</strong><span>cenários versionados</span></article>
        <article><strong>≥5</strong><span>runs para claims de significância, conforme metodologia</span></article>
        <article><strong>3</strong><span>condições documentadas: vanilla, maestro e maestro-focus</span></article>
      </div>
      <div className="scenario-list">{data.benchmark.scenarios.map(s=><code key={s.id}>{s.id}</code>)}</div>
      <Link className="btn primary" to="/docs/benchmark/">Ler metodologia completa</Link>
    </main>
  </Layout>;
}
