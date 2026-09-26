import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Head from '@docusaurus/Head';
import data from '@site/src/generated/site-data.json';
import RouterSimulator from '@site/src/components/RouterSimulator';
import SkillSearchShowcase from '@site/src/components/SkillSearchShowcase';

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
  '“Pronto” pode ser apenas uma afirmação.',
  'Cada ferramenta cria seu próprio ritual.'
];

const withMaestro = [
  'Começa pelas regras, pelo estado e pela skill certa.',
  'Lê o mínimo suficiente e aprofunda sob demanda.',
  'Verificação e handoff fazem parte do trabalho.',
  'O processo se mantém entre ferramentas e sessões.'
];

const tools = [
  'Codex','Claude Code','OpenCode','Freebuff','Cursor','Gemini CLI',
  'Grok CLI','MiMo Code','Kimi Code','Windsurf','Antigravity'
];

const faq = [
  ['O Maestro é outro modelo de IA?','Não. Ele organiza regras, contexto, skills, execução, verificação e handoff entre ferramentas de IA existentes.'],
  ['As skills do site são cadastradas manualmente?','Não. O catálogo público é gerado dos manifests, aliases, chains e documentação versionados no repositório.'],
  ['O simulador executa uma tarefa real?','Não. No navegador ele reproduz apenas a decisão pública do roteador. Execução, workspace, providers e skills locais continuam no runtime do usuário.'],
  ['Existe uma promessa fixa de economia de tokens?','Não. O projeto documenta um benchmark reproduzível e só permite claims quando a evidência passa pelo evidence gate.'],
  ['A documentação do site pode ficar diferente do repositório?','O portal é Markdown-first: a documentação é renderizada a partir dos arquivos do próprio repositório em cada build.']
];

export default function Home(){
  const softwareJsonLd={
    '@context':'https://schema.org',
    '@type':'SoftwareApplication',
    name:'Orquestrador Maestro',
    applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, Linux, macOS',
    url:'https://iapro-community.github.io/Orquestrador-Maestro/',
    codeRepository:'https://github.com/IAPro-Community/Orquestrador-Maestro',
    description:'Orquestrador de processos para agentes de IA com contexto mínimo, roteamento de skills, verificação e evidência.'
  };

  return <Layout
    title="Orquestração inteligente de agentes de IA"
    description="O Orquestrador Maestro organiza contexto, roteia skills, coordena execução e exige evidência antes da conclusão."
  >
    <Head>
      <meta property="og:title" content="Orquestrador Maestro — menos contexto, mais controle"/>
      <meta property="og:description" content="Um processo consistente para agentes de IA: contexto mínimo, skill certa, execução com limites e verificação antes da conclusão."/>
      <meta property="og:image" content="https://iapro-community.github.io/Orquestrador-Maestro/img/orquestrador-maestro-logo.png"/>
      <meta name="twitter:card" content="summary_large_image"/>
      <script type="application/ld+json">{JSON.stringify(softwareJsonLd)}</script>
    </Head>

    <main>
      <section className="hero" id="inicio">
        <div className="hero-grid-bg" aria-hidden="true"/>
        <div className="hero-ambient hero-ambient-a" aria-hidden="true"/>
        <div className="hero-ambient hero-ambient-b" aria-hidden="true"/>

        <div className="shell hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">ORQUESTRAÇÃO PARA AGENTES DE IA</span>
            <h1><span>Menos contexto.</span><em>Mais controle.</em></h1>
            <p className="hero-lede">Um processo consistente para entender o pedido, carregar só o contexto necessário, encontrar a skill adequada, executar com limites e verificar o resultado antes de concluir.</p>

            <div className="actions hero-actions">
              <Link className="btn primary" to="/simulador">Experimentar o roteador</Link>
              <Link className="btn" to="/como-funciona">Entender o processo</Link>
            </div>

            <div className="hero-proof" aria-label="Dados gerados do repositório">
              <div><strong>{data.skills.length}</strong><span>skills indexadas</span></div>
              <div><strong>v{data.router.version}</strong><span>roteador público</span></div>
              <div><strong>{data.benchmark.scenarioCount}</strong><span>cenários versionados</span></div>
            </div>
          </div>

          <div className="maestro-visual" aria-label="Identidade oficial do Orquestrador Maestro">
            <div className="visual-kicker">CONTEXT · SKILLS · EVIDENCE</div>
            <div className="orbit orbit-a" aria-hidden="true"/>
            <div className="orbit orbit-b" aria-hidden="true"/>
            <div className="signal-node node-a" aria-hidden="true">01</div>
            <div className="signal-node node-b" aria-hidden="true">02</div>
            <div className="signal-node node-c" aria-hidden="true">03</div>
            <img src="/Orquestrador-Maestro/img/orquestrador-maestro-logo.png" alt="Logo oficial do Orquestrador Maestro"/>
            <div className="visual-caption">
              <span>Observe</span><span>Route</span><span>Select</span><span>Verify</span>
            </div>
          </div>
        </div>

        <div className="shell tool-marquee" aria-label="Ferramentas documentadas">
          <span>FUNCIONA COM</span>
          <div>{tools.map(tool=><b key={tool}>{tool}</b>)}</div>
        </div>
      </section>

      <section className="shell section">
        <div className="section-head">
          <div>
            <span className="eyebrow">UM MÉTODO, NÃO OUTRO CHAT</span>
            <h2>Do pedido à evidência.</h2>
          </div>
          <p>O Maestro não substitui Codex, Claude, OpenCode, Cursor, Gemini ou outra ferramenta. Ele organiza o caminho que todas elas podem seguir.</p>
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
              <h2>O mesmo agente. Um processo mais previsível.</h2>
            </div>
            <p>Esta comparação vem da documentação oficial do projeto. Ela descreve o processo; não transforma hipótese em métrica.</p>
          </div>

          <div className="comparison-grid marketing-comparison">
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
            <h2>Veja a decisão e a evidência que levou até ela.</h2>
          </div>
          <p>O CI do site possui teste de paridade contra <code>runtime/planner/intent-router.js</code>. A demonstração usa aliases, triggers, capabilities e chains versionados.</p>
        </div>
        <RouterSimulator/>
        <div className="section-actions split-actions">
          <Link className="btn primary" to="/simulador">Abrir simulador completo</Link>
          <Link className="btn" to="/arquitetura">Ver arquitetura</Link>
        </div>
      </section>

      <section className="section skill-marketing-section">
        <div className="shell">
          <div className="section-head">
            <div>
              <span className="eyebrow">SKILLS DINÂMICAS</span>
              <h2>Pesquise o catálogo que o Maestro realmente conhece.</h2>
            </div>
            <p>Não existe uma lista de marketing separada. O que aparece aqui é reconstruído no build a partir das fontes canônicas do repositório.</p>
          </div>
          <SkillSearchShowcase/>
        </div>
      </section>

      <section className="shell section">
        <div className="evidence-panel evidence-panel-marketing">
          <div>
            <span className="eyebrow">BENCHMARK REPRODUZÍVEL</span>
            <h2>Números só viram claim quando existe evidência.</h2>
            <p>O harness compara condições com o mesmo cenário, modelo e critérios de aceitação. Execução real, isolamento, tokens confiáveis e validação aprovada fazem parte do evidence gate.</p>
            <div className="actions">
              <Link className="btn primary" to="/benchmark">Explorar benchmark</Link>
              <Link className="btn" to="/docs/benchmark/">Ler metodologia</Link>
            </div>
          </div>
          <div className="evidence-facts">
            <div><strong>{data.benchmark.scenarioCount}</strong><span>cenários versionados</span></div>
            <div><strong>3</strong><span>condições documentadas</span></div>
            <div><strong>≥5</strong><span>runs para claims de significância</span></div>
          </div>
        </div>
      </section>

      <section className="section install-section">
        <div className="shell install-grid">
          <div>
            <span className="eyebrow">COMECE EM MINUTOS</span>
            <h2>Instale. Verifique. Use na ferramenta que você já escolheu.</h2>
            <p>O fluxo documentado exige Node.js 20.19 ou superior no pacote atual.</p>
            <div className="actions">
              <Link className="btn primary" to="/docs/installation/">Guia de instalação</Link>
              <Link className="btn" to="/docs/START-HERE/">Comece aqui</Link>
            </div>
          </div>
          <div className="install-terminal" aria-label="Comandos de instalação">
            <div><i></i><i></i><i></i><span>terminal</span></div>
            <pre><code>{`npm install -g @iapro/orquestrador-maestro-cli@latest
orquestrador-maestro install
orquestrador-maestro verify`}</code></pre>
          </div>
        </div>
      </section>

      <section className="section privacy-section">
        <div className="shell privacy-grid">
          <div className="privacy-mark" aria-hidden="true">◎</div>
          <div>
            <span className="eyebrow">PRIVACIDADE POR PADRÃO</span>
            <h2>Estrutura pública. Conteúdo privado continua local.</h2>
            <p>O snapshot público é sanitizado. Credenciais, sessões, logs, caches, caminhos locais e memórias privadas ficam fora do repositório. A telemetria é opt-in.</p>
          </div>
          <Link className="btn" to="/docs/privacy-model/">Modelo de privacidade</Link>
        </div>
      </section>

      <section className="shell section">
        <div className="section-head">
          <div>
            <span className="eyebrow">PERGUNTAS DIRETAS</span>
            <h2>Sem esconder as limitações.</h2>
          </div>
          <p>O site distingue claramente demonstração, runtime real e evidência publicável.</p>
        </div>
        <div className="faq-grid">
          {faq.map(([q,a])=><details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>)}
        </div>
      </section>

      <section className="section docs-callout">
        <div className="shell docs-callout-grid">
          <div>
            <span className="eyebrow">MARKDOWN FIRST</span>
            <h2>Documentação e produto evoluem juntos.</h2>
            <p>As páginas são renderizadas dos arquivos Markdown do repositório. Atualizou documentação, skills ou benchmark: o próximo build atualiza o portal.</p>
          </div>
          <div className="docs-links">
            <Link to="/docs/START-HERE/">Comece aqui <span>→</span></Link>
            <Link to="/skills">Portal de skills <span>→</span></Link>
            <Link to="/benchmark">Benchmark <span>→</span></Link>
            <Link to="/documentation">Toda a documentação <span>→</span></Link>
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="shell final-cta-inner">
          <img src="/Orquestrador-Maestro/img/orquestrador-maestro-logo.png" alt=""/>
          <div>
            <span className="eyebrow">OPEN SOURCE</span>
            <h2>Você escolhe a IA.<br/>O Maestro organiza o trabalho.</h2>
          </div>
          <div className="actions">
            <a className="btn primary" href="https://github.com/IAPro-Community/Orquestrador-Maestro">Ver no GitHub</a>
            <Link className="btn" to="/docs/START-HERE/">Começar agora</Link>
          </div>
        </div>
      </section>
    </main>
  </Layout>;
}
