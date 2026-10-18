import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import data from '@site/src/generated/site-data.json';

function formatMs(value){
  if(!Number.isFinite(value)) return '—';
  if(value>=60000) return (value/60000).toFixed(value%60000===0?0:1)+' min';
  return (value/1000).toFixed(0)+' s';
}

export default function Benchmark(){
  return <Layout title="Benchmark" description="Metodologia reproduzível do Orquestrador Maestro para comparar condições com o mesmo modelo, fixture e critérios de aceitação.">
    <main>
      <section className="page-hero compact-hero">
        <div className="shell">
          <span className="eyebrow">EVIDÊNCIA, NÃO PROMESSA</span>
          <h1 className="page-title">Benchmark reproduzível.</h1>
          <p className="page-lede">O harness compara o mesmo cenário, modelo e critérios de aceitação. O site não transforma exemplos ilustrativos em resultado oficial.</p>
        </div>
      </section>

      <section className="shell section page-section">
        <div className="stats">
          <article><strong>{data.benchmark.scenarioCount}</strong><span>cenários versionados</span></article>
          <article><strong>3</strong><span>condições: vanilla, maestro e maestro-focus</span></article>
          <article><strong>≥5</strong><span>runs para claims de significância</span></article>
        </div>

        <div className="benchmark-principles">
          <article><span>01</span><strong>Reprodutibilidade</strong><p>Prompt hash, commit e modelo versionado entram na evidência.</p></article>
          <article><span>02</span><strong>Isolamento</strong><p>Runs oficiais usam workspace efêmero e container provenance.</p></article>
          <article><span>03</span><strong>Verificação</strong><p>Hidden tests e invariantes precisam passar.</p></article>
          <article><span>04</span><strong>Evidence gate</strong><p>Só execução real, tokens confiáveis e validação concluída podem sustentar claim público.</p></article>
        </div>

        <div className="section-head benchmark-heading">
          <div><span className="eyebrow">CENÁRIOS VERSIONADOS</span><h2>O que o harness realmente testa.</h2></div>
          <p>Os cards abaixo são gerados dos JSON em <code>benchmark-harness/scenarios/</code>.</p>
        </div>

        <div className="scenario-grid">
          {data.benchmark.scenarios.map(s=><article key={s.id}>
            <small>{s.id}</small>
            <h3>{s.name||s.id}</h3>
            <dl>
              <div><dt>Tempo máx.</dt><dd>{formatMs(s.limits?.maxTimeMs)}</dd></div>
              <div><dt>Retries</dt><dd>{s.limits?.maxRetries??'—'}</dd></div>
            </dl>
            <div className="scenario-criteria">
              {(s.acceptanceCriteria||[]).map(c=><code key={c}>{c}</code>)}
            </div>
          </article>)}
        </div>

        <div className="evidence-panel benchmark-evidence">
          <div>
            <span className="eyebrow">POLÍTICA DE CLAIMS</span>
            <h2>Uma economia de tokens só é publicada se puder ser auditada.</h2>
            <p>O evidence gate exige execução real, provenance de container, tokens exatos de fonte confiável, reprodutibilidade, isolamento e validação aprovada.</p>
          </div>
          <div className="actions">
            <Link className="btn primary" to="/docs/benchmark/">Metodologia completa</Link>
            <a className="btn" href="https://github.com/IAPro-Community/Orquestrador-Maestro/tree/main/benchmark-harness">Abrir harness</a>
          </div>
        </div>
      </section>
    </main>
  </Layout>;
}
