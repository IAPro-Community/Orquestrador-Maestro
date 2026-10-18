# System Prompt Global - OpenCode Commands

## Shared Skill Routing

Before broad software work, read these compact control files in order:

1. `{{USER_HOME}}/.orquestrador/SKILL_EXECUTION_PROFILES.json`
2. `{{USER_HOME}}/.orquestrador/SKILL_ALIASES.json`
3. `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json`
4. `{{USER_HOME}}/.orquestrador/SKILL_CHAINS.json` only after choosing the primary skill

Then open only the matching `SKILL.md` files. For SaaS, dashboards, admin panels, Supabase, payments, AbacatePay, Stripe, subscriptions, tenant limits, or production security, start with `/skill:skill-saas-factory` and let it route to the smaller payment, dashboard, RLS, limits, or security skills. For subagents, multiagents, parallel agents, swarm, team execution, or delegation, start with `/skill:skill-multiagent-orchestration`. Default to the `standard` profile: at most three skills unless the user asks for deep work or subagents.

**Versão:** 1.0.0  
**Aplicável a:** Todos os agentes (OpenCode, Claude, Antigravity, Cursor, Windsurf)

---

## 📋 Comandos Slash Disponíveis

Quando o usuário digitar `/` seguido de um comando, execute a ação correspondente:

| Comando | Ação |
|---------|------|
| `/init` | Cria/atualiza `AGENTS.md` com configuração do projeto |
| `/undo` | Desfaz última ação usando `git restore` |
| `/redo` | Refaz ação desfeita usando `git stash pop` |
| `/share` | Cria link público da sessão |
| `/unshare` | Remove link público |
| `/help` | Lista todos os comandos disponíveis |
| `/compact` | Resume a sessão atual |
| `/details` | Mostra detalhes de execução |
| `/editor` | Abre editor externo |
| `/exit` | Encerra a sessão |
| `/export` | Exporta sessão para Markdown |
| `/models` | Lista modelos disponíveis |
| `/new` | Inicia nova sessão |
| `/sessions` | Lista sessões disponíveis |
| `/themes` | Lista temas disponíveis |
| `/thinking` | Alterna visualização do raciocínio |
| `/connect` | Adiciona provedor de API |

---

## 📁 Convenções de Código

### Nomenclatura de Arquivos

| Tipo | Padrão | Exemplo |
|------|--------|---------|
| Componentes | `PascalCase.tsx` | `UserProfile.tsx` |
| Hooks | `usePascalCase.ts` | `useAuth.ts` |
| Utils | `kebab-case.ts` | `format-date.ts` |
| Backend | `kebab-case.ts` | `user-service.ts` |

### Variáveis e Funções

| Tipo | Padrão | Exemplo |
|------|--------|---------|
| Variáveis | `camelCase` | `const userName = 'João'` |
| Constantes | `UPPER_SNAKE_CASE` | `const MAX_RETRIES = 3` |
| Funções | `camelCase` | `function getUser()` |
| Classes | `PascalCase` | `class UserService` |
| Interfaces | `PascalCase` | `interface IUser` |

---

## 🏗️ Stack Padrão

- **Frontend:** React + TypeScript + TailwindCSS + Vite + Lucide
- **Backend:** Node.js + Express + Prisma + PostgreSQL
- **Auth:** JWT + Bcrypt
- **Database:** Supabase

---

## 📝 Commits (Conventional Commits)

```
<tipo>(<escopo>): <descrição>

Tipos: feat, fix, docs, style, refactor, test, chore
Exemplo: feat(users): adiciona validação de email
```

---

## 🎨 TailwindCSS

Usar classes do Tailwind diretamente. Evitar CSS customizado.

```jsx
// ✅ Correto
<div className="flex items-center justify-between p-4 bg-white rounded-lg">

// ❌ Evitar
<div className="custom-class">
```

---

## 🧪 Testes

- Usar Playwright para E2E
- Usar Jest para unit tests
- Coverage mínimo: 80%
- Nomes descritivos: `deve retornar erro quando email for inválido`

---

## 🔐 Segurança

- Nunca expor secrets no código
- Validar todas as entradas
- Usar HTTPS sempre
- Hash de senhas com bcrypt

---

**Este prompt é lido automaticamente por todos os agentes IA.**
