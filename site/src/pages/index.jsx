import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Head from '@docusaurus/Head';
import data from '@site/src/generated/site-data.json';
import RouterSimulator from '@site/src/components/RouterSimulator';
import SkillSearchShowcase from '@site/src/components/SkillSearchShowcase';

const flow = [
  ['01','Observe','Pedido, regras e estado atual entram primeiro.'],
  ['02','Route','A intenção encontra a skill pela evidência mais específica.'],
  ['03','Select','Só o contexto necessário é carregado.'],
  ['04','Act','A execução respeita escopo, risco e autorização.'],
  ['05','Verify','Resultado, invariantes e aceite são verificados.'],
  ['06','Report','Evidência e estado útil ficam para a próxima sessão.']
];

const tools = ['Codex','Claude Code','OpenCode','Cursor','Gemini CLI','Grok CLI','Windsurf','Antigravity'];

const faq = [
  ['O Maestro é outro modelo de IA?','Não. Ele organiza regras, contexto, skills, execução, verificação e handoff entre ferramentas de IA existentes.'],
  ['As skills são cadastradas no site?','Não. O catálogo é reconstruído dos manifests, aliases, chains e documentação versionados no repositório.'],
  ['O simulador executa tarefas reais?','Não. No navegador ele demonstra a decisão pública do roteador. Execução, providers e workspace continuam no runtime local.'],
  ['Existe uma promessa fixa de economia de tokens?','Não. Claims só podem ser publicados quando passam pelo evidence gate documentado pelo projeto.']
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
    title="Orquestração de agentes com contexto, skills e evidência"
    description="O Orquestrador Maestro organiza o trabalho entre diferentes ferramentas de IA sem substituir o modelo que você já usa."
  >
    <Head>
      <meta property="og:title" content="Orquestrador Maestro — você escolhe a IA, o Maestro organiza o trabalho"/>
      <meta property="og:description" content="Contexto mínimo, roteamento de skills, execução com limites e evidência antes de concluir."/>
      <meta property="og:image" content="https://iapro-community.github.io/Orquestrador-Maestro/img/orquestrador-maestro-logo.png"/>
      <meta name="twitter:card" content="summary_large_image"/>
      <script type="application/ld+json">{JSON.stringify(softwareJsonLd)}</script>
    </Head>

    <main className="marketing-v2">
      <section className="v2-hero">
        <div className="v2-grid" aria-hidden="true"/>
        <div className="shell v2-hero-layout">
          <div className="v2-hero-copy">
            <div className="v2-kicker"><span></span> ORQUESTRAÇÃO LOCAL-FIRST PARA AGENTES DE IA</div>
            <h1><span>Menos contexto.</span><strong>Mais controle.</strong></h1>
            <p>Você continua escolhendo a IA. O Maestro organiza o processo: entende a intenção, encontra a skill certa, limita o contexto e exige evidência antes de considerar o trabalho concluído.</p>

            <div className="v2-actions">
              <Link className="v2-button v2-button-primary" to="/simulador">Experimentar o roteador</Link>
              <Link className="v2-button v2-button-quiet" to="/docs/START-HERE/">Começar em 10 minutos</Link>
            </div>

            <div className="v2-proof" aria-label="Dados atuais do repositório">
              <div><b>{data.skills.length}</b><span>skills indexadas</span></div>
              <div><b>v{data.router.version}</b><span>roteador público</span></div>
              <div><b>{data.benchmark.scenarioCount}</b><span>cenários de benchmark</span></div>
            </div>
          </div>

          <div className="v2-stage" aria-label="Representação da identidade oficial do Maestro">
            <div className="v2-stage-label">MAESTRO / CONTROL PLANE</div>
            <div className="v2-route-line v2-route-line-a" aria-hidden="true"/>
            <div className="v2-route-line v2-route-line-b" aria-hidden="true"/>
            <div className="v2-route-line v2-route-line-c" aria-hidden="true"/>
            <div className="v2-node v2-node-intent"><small>01</small><span>INTENT</span></div>
            <div className="v2-node v2-node-skill"><small>02</small><span>SKILL</span></div>
            <div className="v2-node v2-node-proof"><small>03</small><span>EVIDENCE</span></div>
            <div className="v2-brand-seal">
              <img src="/Orquestrador-Maestro/img/orquestrador-maestro-logo.png" alt="Logo oficial do Orquestrador Maestro"/>
            </div>
            <div className="v2-stage-footer">
              <span>Observe</span><i>→</i><span>Route</span><i>→</i><span>Verify</span>
            </div>
          </div>
        </div>

        <div className="shell v2-tools">
          <span>UMA CAMADA PARA O PROCESSO, NÃO PARA O MODELO</span>
          <div>{tools.map(tool=><b key={tool}>{tool}</b>)}</div>
        </div>
      </section>

      <section className="v2-manifesto">
        <div className="shell v2-manifesto-grid">
          <div className="v2-section-index">01 / POSICIONAMENTO</div>
          <div>
            <p className="v2-big-copy">Agentes diferentes podem usar o <em>mesmo método de trabalho</em> sem reconstruir contexto e ritual a cada ferramenta.</p>
          </div>
          <div className="v2-manifesto-aside">
            <span>SEM MAESTRO</span>
            <p>Contexto cresce sem critério. Cada cliente cria seu próprio fluxo. “Pronto” pode significar apenas uma afirmação.</p>
            <span>COM MAESTRO</span>
            <p>Regras, estado, skill, verificação e handoff fazem parte do mesmo contrato operacional.</p>
          </div>
        </div>
      </section>

      <section className="v2-process">
        <div className="shell">
          <div className="v2-section-head">
            <div>
              <div className="v2-section-index">02 / PROCESSO</div>
              <h2>Do pedido à evidência.</h2>
            </div>
            <p>Seis etapas simples, persistentes entre ferramentas e sessões.</p>
          </div>

          <div className="v2-process-list">
            {flow.map(([number,title,description])=><article key={title}>
              <span>{number}</span>
              <div><h3>{title}</h3><p>{description}</p></div>
            </article>)}
          </div>
        </div>
      </section>

      <section className="v2-router-section">
        <div className="shell">
          <div className="v2-section-head">
            <div>
              <div className="v2-section-index">03 / ROTEAMENTO</div>
              <h2>Veja por que uma skill foi escolhida.</h2>
            </div>
            <p>O simulador usa as mesmas fontes versionadas do repositório e expõe a evidência que determinou a rota.</p>
          </div>

          <div className="v2-product-shell">
            <div className="v2-product-bar">
              <div><i></i><i></i><i></i></div>
              <span>maestro / intent-router</span>
              <b>routing v{data.router.version}</b>
            </div>
            <RouterSimulator/>
          </div>

          <div className="v2-inline-links">
            <Link to="/simulador">Abrir simulador completo <span>↗</span></Link>
            <Link to="/arquitetura">Entender a arquitetura <span>↗</span></Link>
          </div>
        </div>
      </section>

      <section className="v2-skills-section">
        <div className="shell">
          <div className="v2-section-head">
            <div>
              <div className="v2-section-index">04 / SKILLS</div>
              <h2>Um catálogo que nasce do código.</h2>
            </div>
            <p>Não existe catálogo paralelo de marketing. O que aparece aqui é reconstruído dos manifests e da documentação a cada build.</p>
          </div>
          <SkillSearchShowcase/>
        </div>
      </section>

      <section className="v2-evidence">
        <div className="shell v2-evidence-layout">
          <div className="v2-evidence-copy">
            <div className="v2-section-index">05 / EVIDÊNCIA</div>
            <h2>Resultado antes de promessa.</h2>
            <p>O benchmark só sustenta claims públicos quando execução, isolamento, tokens confiáveis e validação passam pelo evidence gate.</p>
            <div className="v2-inline-links">
              <Link to="/benchmark">Ver benchmark <span>↗</span></Link>
              <Link to="/docs/benchmark/">Ler metodologia <span>↗</span></Link>
            </div>
          </div>
          <div className="v2-evidence-numbers">
            <div><b>{data.benchmark.scenarioCount}</b><span>cenários versionados</span></div>
            <div><b>3</b><span>condições documentadas</span></div>
            <div><b>≥5</b><span>runs para claims de significância</span></div>
          </div>
        </div>
      </section>

      <section className="v2-start">
        <div className="shell v2-start-grid">
          <div>
            <div className="v2-section-index">06 / COMEÇAR</div>
            <h2>Instale o Maestro.<br/>Mantenha sua IA.</h2>
            <p>O pacote atual exige Node.js 20.19 ou superior.</p>
            <div className="v2-actions">
              <Link className="v2-button v2-button-primary" to="/docs/installation/">Guia de instalação</Link>
              <Link className="v2-button v2-button-quiet" to="/documentation">Explorar documentação</Link>
            </div>
          </div>
          <div className="v2-terminal">
            <header><span>TERMINAL</span><b>local-first</b></header>
            <pre><code>{`npm install -g @iapro/orquestrador-maestro-cli@latest

orquestrador-maestro install
orquestrador-maestro verify`}</code></pre>
          </div>
        </div>
      </section>

      <section className="v2-faq">
        <div className="shell">
          <div className="v2-section-head">
            <div>
              <div className="v2-section-index">07 / DIRETO AO PONTO</div>
              <h2>Sem esconder limites.</h2>
            </div>
            <p>Marketing bom deixa claro o que o produto faz — e o que ele não faz.</p>
          </div>
          <div className="v2-faq-list">
            {faq.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}
          </div>
        </div>
      </section>

      <section className="v2-final">
        <div className="shell v2-final-grid">
          <div className="v2-final-brand">
            <img src="/Orquestrador-Maestro/img/orquestrador-maestro-logo.png" alt=""/>
          </div>
          <div>
            <div className="v2-section-index">OPEN SOURCE</div>
            <h2>Você escolhe a IA.<br/><span>O Maestro organiza o trabalho.</span></h2>
          </div>
          <div className="v2-actions">
            <a className="v2-button v2-button-primary" href="https://github.com/IAPro-Community/Orquestrador-Maestro">Ver no GitHub</a>
            <Link className="v2-button v2-button-quiet" to="/docs/START-HERE/">Começar agora</Link>
          </div>
        </div>
      </section>
    </main>
  </Layout>;
}
