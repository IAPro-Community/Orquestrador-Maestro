const config = {
  title: 'Orquestrador Maestro',
  tagline: 'Você escolhe a IA. O Maestro organiza o trabalho.',
  favicon: 'img/orquestrador-maestro-logo.png',
  url: 'https://iapro-community.github.io',
  baseUrl: '/Orquestrador-Maestro/',
  organizationName: 'IAPro-Community',
  projectName: 'Orquestrador-Maestro',
  trailingSlash: true,
  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn'
    }
  },
  i18n: { defaultLocale: 'pt-BR', locales: ['pt-BR'] },
  presets: [
    ['classic', {
      docs: {
        path: '../docs',
        routeBasePath: 'docs',
        sidebarPath: false,
        breadcrumbs: true,
        showLastUpdateAuthor: false,
        showLastUpdateTime: false,
        remarkPlugins: [require('./remark-repo-links.cjs')]
      },
      blog: false,
      theme: { customCss: './src/css/custom.css' }
    }]
  ],
  themeConfig: {
    image: 'img/orquestrador-maestro-logo.png',
    colorMode: { defaultMode: 'dark', disableSwitch: true, respectPrefersColorScheme: false },
    metadata: [
      { name: 'keywords', content: 'orquestrador de agentes, AI agents, skills, Codex, Claude Code, OpenCode, Cursor, Gemini, orchestration' },
      { name: 'theme-color', content: '#06111f' }
    ],
    navbar: {
      title: 'Orquestrador Maestro',
      logo: { alt: 'Logo do Orquestrador Maestro', src: 'img/orquestrador-maestro-logo.png' },
      items: [
        { to: '/', label: 'Início', position: 'left' },
        { to: '/como-funciona', label: 'Como funciona', position: 'left' },
        { to: '/skills', label: 'Skills', position: 'left' },
        { to: '/simulador', label: 'Simulação', position: 'left' },
        { to: '/arquitetura', label: 'Arquitetura', position: 'left' },
        { to: '/benchmark', label: 'Benchmark', position: 'left' },
        { to: '/documentation', label: 'Documentação', position: 'left' },
        { href: 'https://github.com/IAPro-Community/Orquestrador-Maestro', label: 'GitHub', position: 'right' }
      ]
    },
    footer: {
      style: 'dark',
      links: [
        { title: 'Projeto', items: [
          { label: 'GitHub', href: 'https://github.com/IAPro-Community/Orquestrador-Maestro' },
          { label: 'Instalação', href: 'https://github.com/IAPro-Community/Orquestrador-Maestro/blob/main/docs/installation.md' },
          { label: 'Contribuir', href: 'https://github.com/IAPro-Community/Orquestrador-Maestro/blob/main/CONTRIBUTING.md' }
        ]},
        { title: 'Referência', items: [
          { label: 'Como funciona', to: '/como-funciona' },
          { label: 'Skills', to: '/skills' },
          { label: 'Roteador', to: '/simulador' },
          { label: 'Arquitetura', to: '/arquitetura' },
          { label: 'Benchmark', to: '/benchmark' },
          { label: 'Documentação', to: '/documentation' }
        ]}
      ],
      copyright: 'Orquestrador Maestro · Conteúdo derivado das fontes canônicas do repositório.'
    }
  }
};
module.exports = config;
