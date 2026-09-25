import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import data from '@site/src/generated/site-data.json';
import RouterSimulator from '@site/src/components/RouterSimulator';

const flow = [
  ['Observe','Entenda o pedido, as regras e o estado atual.'],
  ['Route','Encontre a skill principal pela evidência mais específica.'],
  ['Select','Carregue contexto, dependências e capacidades necessárias.'],
  ['Act','Execute dentro do escopo, risco e autorização disponíveis.'],
  ['Verify','Valide resultado, invariantes e critérios de aceite.'],
  ['Report','Registre evidência e estado útil para a próxima sessão.']
];

const withoutMaestro = [
  'A IA decide sozinha o que ler.',
  'O contexto cresce sem critério.',
  '“Done” pode ser apenas uma alegação.',
  'Cada ferramenta cria seu próprio ritual.'
];

const withMaestro = [
  'Começa por regras, estado e skill adequada.',
  'Lê o mínimo suficiente e aprofunda sob demanda.',
  'Verificação e handoff fazem parte do trabalho.',
  'O processo permanece entre ferramentas e sessões.'
];

export default function Home(){
  const featuredSkills = data.skills.slice(0,6);
  return <Layout
    title="Orquestração inteligente de agentes de IA"
    description="O Orquestrador Maestro organiza contexto, roteia skills, coordena execução e exige evidência antes da conclusão."
  >
    <main>
      <section className="hero" id="inicio">
        <div className="hero-grid-bg" aria-hidden="true"/>
        <div className="shell hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">ORQUESTRAÇÃO PARA AGENTES DE IA</span>
            <h1>Menos contexto. <em>Mais controle.</em></h1>
            <p className="hero-lede">Use o mesmo processo com Codex, Claude, OpenCode, Cursor, Gemini e outras ferramentas: entender o pedido, carregar só o contexto necessário, executar com limites e verificar o resultado.</p>
            <div className="actions">
              <Link className="btn primary" to="/simulador">Ver como funciona</Link>
              <a className="btn" href="https://github.com/IAPro-Community/Orquestrador-Maestro">Explorar no GitHub</a>
            </div>
            <div className="hero-proof" aria-label="Dados gerados do repositório">
              <div><strong>{data.skills.length}</strong><span>skills indexadas</span></div>
              <div><strong>v{data.router.version}</strong><span>roteador público</span></div>
              <div><strong>{data.benchmark.scenarioCount}</strong><span>cenários de benchmark</span></div>
            </div>
          </div>

          <div className="maestro-visual" aria-label="Identidade oficial do Orquestrador Maestro">
            <div className="orbit orbit-a" aria-hidden="true"/>
            <div className="orbit orbit-b" aria-hidden="true"/>
            <div className="signal-node node-a" aria-hidden="true">A</div>
            <div className="signal-node node-b" aria-hidden="true">B</div>
            <div className="signal-node node-c" aria-hidden="true">C</div>
            <img src="/Orquestrador-Maestro/img/orquestrador-maestro-logo.png" alt="Logo oficial do Orquestrador Maestro"/>
          </div>
        </div>
      </section>

      <section className="shell section">
        <div className="section-head">
          <div>
            <span className="eyebrow">PROCESSO CONSISTENTE</span>
            <h2>Do pedido à evidência.</h2>
          </div>
          <p>O Maestro não substitui a ferramenta de IA. Ele organiza o método de trabalho e mantém o processo verificável.</p>
        </div>
        <ol className="process-flow">
          {flow.map(([title,description],i)=><li key={title}>
            <span>{String(i+1).padStart(2,'0')}</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </li>)}
        </ol>
      </section>

      <section className="section contrast-section">
        <div className="shell">
          <div className="section-head">
            <div>
              <span className="eyebrow">O QUE MUDA NA PRÁTICA</span>
              <h2>O mesmo agente, com um processo melhor definido.</h2>
            </div>
            <p>Comparação baseada na documentação oficial do projeto, sem claims de desempenho inventados.</p>
          </div>
          <div className="comparison-grid">
            <article>
              <small>SEM ORQUESTRAÇÃO</small>
              <ul>{withoutMaestro.map(item=><li key={item}>{item}</li>)}</ul>
            </article>
            <article className="comparison-positive">
              <small>COM ORQUESTRADOR MAESTRO</small>
              <ul>{withMaestro.map(item=><li key={item}>{item}</li>)}</ul>
            </article>
          </div>
        </div>
      </section>

      <section className="shell section" id="simulacao">
        <div className="section-head">
          <div>
            <span className="eyebrow">SIMULAÇÃO FIEL AO ROTEADOR</span>
            <h2>Veja por que uma skill foi selecionada.</h2>
          </div>
          <p>O simulador usa as mesmas fontes canônicas do repositório e é coberto por teste de paridade contra <code>runtime/planner/intent-router.js</code>.</p>
        </div>
        <RouterSimulator/>
      </section>

      <section className="section contrast-section">
        <div className="shell">
          <div className="section-head">
            <div>
              <span className="eyebrow">SKILLS DINÂMICAS</span>
              <h2>O catálogo nasce do repositório.</h2>
            </div>
            <p>Novas skills entram automaticamente no próximo build a partir dos manifests, aliases, chains e documentação Markdown.</p>
          </div>
          <div className="skill-preview-grid">
            {featuredSkills.map(skill=><article key={skill.id}>
              <div className="skill-preview-head">
                <span>{skill.category || skill.source || 'skill'}</span>
                {skill.risk && <small>{skill.risk}</small>}
              </div>
              <h3>{skill.id}</h3>
              <p>{skill.description}</p>
              <div className="tags">{(skill.dependencies||[]).slice(0,2).map(dep=><code key={dep}>{dep}</code>)}</div>
            </article>)}
          </div>
          <div className="section-actions">
            <Link className="btn primary" to="/skills">Pesquisar todas as {data.skills.length} skills</Link>
          </div>
        </div>
      </section>

      <section className="shell section">
        <div className="evidence-panel">
          <div>
            <span className="eyebrow">BENCHMARK REPRODUZÍVEL</span>
            <h2>Números só viram claim quando existe evidência.</h2>
            <p>O site não publica uma taxa fixa de economia de tokens. A metodologia compara condições controladas, preserva artefatos e exige evidence gate antes de qualquer afirmação pública.</p>
            <div className="actions">
              <Link className="btn primary" to="/benchmark">Ver benchmark</Link>
              <Link className="btn" to="/docs/benchmark/">Ler metodologia</Link>
            </div>
          </div>
          <div className="evidence-facts">
            <div><strong>{data.benchmark.scenarioCount}</strong><span>cenários versionados</span></div>
            <div><strong>3</strong><span>condições documentadas</span></div>
            <div><strong>≥5</strong><span>runs exigidos para claims de significância</span></div>
          </div>
        </div>
      </section>

      <section className="section docs-callout">
        <div className="shell docs-callout-grid">
          <div>
            <span className="eyebrow">MARKDOWN FIRST</span>
            <h2>Documentação e produto evoluem juntos.</h2>
            <p>As páginas de documentação são renderizadas diretamente dos arquivos Markdown do repositório. Não existe uma cópia editorial paralela para ficar desatualizada.</p>
          </div>
          <div className="docs-links">
            <Link to="/docs/START-HERE/">Comece aqui <span>→</span></Link>
            <Link to="/skills">Portal de skills <span>→</span></Link>
            <Link to="/benchmark">Benchmark <span>→</span></Link>
            <Link to="/documentation">Toda a documentação <span>→</span></Link>
          </div>
        </div>
      </section>
    </main>
  </Layout>;
}
