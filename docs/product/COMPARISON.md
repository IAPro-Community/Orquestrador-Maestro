# Comparação: Com e Sem Orquestrador

## Sem Orquestrador

### O que acontece:
```
$ git log --oneline -5
→ a1b2c3d fix: adjust validation
→ e4f5g6h fix: adjust validation
→ i7j8k9l fix: adjust validation

$ grep -r "TODO" src/
→ 47 resultados

$ memory search --project auth --search "JWT"
→ Command not found: memory
```

### Problemas:
- **Contexto perdido:** Decisões ficam em cabeças/Slack
- **Busca manual:** "Pergunta pro Fulano"
- **Repetição:** Mesmos bugs aparecem反复
- **Bugs:** Erros conhecidos são repetidos

---

## COM Orquestrador

### O que acontece:
```
$ memory search --project auth --search "JWT"

→ obs_abc123: "Decisão: JWT para APIs, Session para webapp"
  - author: Fulano
  - date: 2026-08-15
  - verified: true
  - files: docs/adr/001-auth.md
```

### Benefícios:
- **Contexto preservado:** Decisões ficam registradas
- **Busca instantânea:** Encontra informações em segundos
- **Consistência:** Todos seguem as mesmas decisões
- **Onboarding rápido:** Novos devs aprendem mais rápido
- **Menos bugs:** Conhecimento acumulado evita erros

---

## Comparação Direta

| Aspecto | Sem Orquestrador | Com Orquestrador |
|---------|------------------|------------------|
| **Contexto** | Perdido entre sessões | Preservado em JSONL |
| **Busca** | "Pergunta pro Fulano" | `memory search` |
| **Decisões** | Em cabeças/Slack | Em ADRs + memória |
| **Onboarding** | Sem contexto persistente | Contexto preservado |
| **Bugs** | Erros repetidos | Conhecimento acumulado |

---

## Exemplo Prático

### Situação: Bug no refresh token

**Sem Orquestrador:**
1. Dev encontra bug
2. Não sabe se é bug novo ou conhecido
3. Pergunta no Slack
4. Ninguém lembra
5. Investiga tempo considerável
6. Descobre que já foi reportado

**Com Orquestrador:**
1. Dev encontra bug
2. Roda: `memory search --search "refresh token"`
3. Encontra: "Bug conhecido: TokenService permite múltiplos refreshes"
4. Ve: `files: ["src/TokenService.ts"]`
5. Corrige rapidamente

---

## O que o Orquestrador Oferece

### 1. Memória Episódica
- Registra decisões, bugs, descobertas
- Busca por tipo, tags, texto
- Timeline cronológica
- Promoção para conhecimento canônico

### 2. Context Intelligence
- Classifica tarefas automaticamente
- Gerencia orçamento de contexto
- Detecta conflitos com conhecimento canônico

### 3. Benchmark Engine
- Mede eficiência de contexto
- Compara: vanilla vs maestro-core vs maestro-memory
- Métricas de infraestrutura (setup only)

### 4. Adapters
- Integra com Claude, Codex, OpenCode
- Captura automaticamente observações
- Zero configuração manual

---

## Conclusão

| Pergunta | Resposta |
|----------|----------|
| Vale a pena? | Sim, para projetos com múltiplos devs |
| Quando usar? | Quando há contexto valioso a preservar |
| Quanto economiza? | Requer medição real para afirmar |
| Complexidade? | Baixa - zero dependências, JSONL simples |

**Próximo passo:** Testar em um projeto real
