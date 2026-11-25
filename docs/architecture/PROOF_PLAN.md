# O que foi feito e o que precisa ser comprovado

## 1. O que foi implementado (sistema)

### Memória Episódica
- **O que:** Sistema para registrar e buscar decisões, bugs, descobertas e problemas
- **Como:** JSONL com schema versionado, busca por texto/tipo/tags
- **Arquivo:** `orquestrador/bin/memory.js`
- **Comandos:** record, search, show, timeline, promote, stats, prune, dedupe, consolidate, retention, cleanup

### Adapters
- **O que:** Captura automática de observações de diferentes ferramentas de IA
- **Como:** Adaptadores para Claude, Codex, OpenCode e genérico
- **Arquivo:** `orquestrador/adapters/index.js`

### Benchmark Engine
- **O que:** Sistema para medir eficiência de contexto entre vanilla e Maestro
- **Como:** Runner com cenários isolados, métricas de contexto e duração
- **Arquivo:** `benchmarks/real-benchmark.js`
- **Cenários:** 6 cenários (feature, bug, investigation, refactor, resume, cross-session)

### Context Intelligence
- **O que:** Classificação de tarefas e gerenciamento de orçamento de contexto
- **Como:** Detecta tipo de tarefa, aloca orçamento, verifica conflitos com conhecimento canônico
- **Arquivo:** `tests/memory-context.test.js`

---

## 2. O que precisa ser comprovado (evidências)

### Evidência 1: Memória reduz busca de contexto

**Hipótese:** Com memória, o desenvolvedor encontra informações mais rápido

**Como comprovar:**
1. Criar cenário com 10 decisões documentadas
2. Medir tempo para encontrar "qual era a decisão sobre auth" com e sem memória
3. Comparar: `memory search --search "auth"` vs procurar em arquivos manualmente

**Métrica:** Tempo médio de busca (segundos)

**Resultado esperado:** Busca com memória deve ser mais rápida que busca manual

---

### Evidência 2: Maestro reduz tokens

**Hipótese:** Maestro envia menos contexto para a IA

**Como comprovar:**
1. Rodar mesmo prompt com e sem Maestro
2. Medir tokens reais via API (não simulado)
3. Comparar: vanilla vs maestro-core vs maestro-memory

**Métrica:** Tokens de entrada (input tokens)

**Resultado esperado:** Requer medição real para afirmar

---

### Evidência 3: Maestro melhora qualidade

**Hipótese:** Com Maestro, a IA produce código melhor

**Como comprovar:**
1. Dar mesma tarefa para IA com e sem Maestro
2. Avaliar: bugs, legibilidade, aderência a padrões
3. Comparar resultados

**Métrica:** Número de bugs, score de qualidade

**Resultado esperado:** Requer medição real para afirmar

---

### Evidência 4: Memória evita retrabalho

**Hipótese:** Com memória, não se repete o mesmo erro

**Como comprovar:**
1. Registrar bug na memória
2. Tentar implementar feature que causa o mesmo bug
3. Verificar se a IA detecta o problema conocido

**Métrica:** Número de vezes que o mesmo bug é repetido

**Resultado esperado:** Requer medição real para afirmar

---

### Evidência 5: Onboarding é mais rápido

**Hipótese:** Novos devs aprendem mais rápido com Maestro

**Como comprovar:**
1. Medir tempo para novo dev entender projeto com e sem Maestro
2. Comparar: precisa perguntar vs buscar na memória

**Métrica:** Dias para onboarding completo

**Resultado esperado:** Requer medição real para afirmar

---

## 3. Como executar cada evidência

### Evidência 1: Busca de contexto

```bash
# Setup: criar 10 decisões
for i in {1..10}; do
  node orquestrador/bin/memory.js record \
    --project demo --type decision \
    --summary "Decisão $i sobre auth"
done

# Teste com memória
time node orquestrador/bin/memory.js search --project demo --search "auth"

# Teste sem memória (procurar manualmente)
time grep -r "auth" ~/.orquestrador/memory/projects/demo/
```

### Evidência 2: Tokens

```bash
# Precisa de API key configurada
# Claude
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -d '{"model":"claude-3-5-sonnet","max_tokens":1024,"messages":[{"role":"user","content":"$(cat prompt.txt)"}]}'

# Comparar usage.input_tokens com e sem Maestro
```

### Evidência 3: Qualidade

```bash
# Criar teste automatizado
# 1. Mesma tarefa com e sem Maestro
# 2. Rodar testes
# 3. Comparar resultados
```

### Evidência 4: Retrabalho

```bash
# Registrar bug
node orquestrador/bin/memory.js record \
  --project demo --type bug \
  --summary "Bug: refresh token pode ser reusado"

# Simular nova feature
# Verificar se IA detecta o problema
```

### Evidência 5: Onboarding

```bash
# Medir tempo para novo dev
# 1. Sem Maestro: perguntar a 3 pessoas
# 2. Com Maestro: buscar na memória
# Comparar tempo total
```

---

## 4. Limitações atuais

### O que NÃO foi comprovado ainda

1. **Tokens reais:** Benchmark usa dados simulados, não API real
2. **Qualidade de código:** Não há métricas automatizadas de qualidade
3. **Onboarding real:** Não testado com devs reais
4. **Retrabalho real:** Não medido em projeto real
5. **Estatística:** Amostra pequena (1 run por cenário)

### O que precisa para comprovar

1. **Integração com API real:** Claude/GPT-4 para medir tokens
2. **Métricas automatizadas:** Lint, testes, code review
3. **Testes com devs reais:** A/B test com equipe
4. **Múltiplos runs:** 10+ runs por cenário
5. **Projeto real:** Testar em projeto com 10+ devs

---

## 5. Resumo

### Implementado ✅

| Componente | Status |
|------------|--------|
| Memória episódica | Funcional |
| Adapters | Funcional |
| Benchmark engine | Funcional |
| Context intelligence | Funcional |
| Retention/dedupe | Funcional |
| Security (redaction) | Funcional |
| 106 testes | Passando |

### Pendente ⏳

| Evidência | O que falta |
|-----------|-------------|
| Redução de tokens | Integração com API real |
| Melhoria de qualidade | Métricas automatizadas |
| Onboarding mais rápido | Teste com devs reais |
| Menos retrabalho | Medição em projeto real |
| Estatística robusta | Múltiplos runs |

---

## 6. Próximos passos

1. **Curto prazo (1 semana):**
   - Integrar com API do Claude/GPT-4
   - Rodar benchmark com tokens reais
   - Gerar relatório com dados reais

2. **Médio prazo (1 mês):**
   - Testar com equipe de 5 devs
   - Medir tempo de busca de contexto
   - Comparar antes/depois

3. **Longo prazo (3 meses):**
   - Medir onboarding completo
   - Analisar custo-benefício
   - Publicar caso de uso