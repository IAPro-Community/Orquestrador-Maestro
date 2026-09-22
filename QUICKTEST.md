# Como Testar - Guia Rápido

## 1. Testar Memória Episódica

### Registrar uma observation
```bash
node orquestrador/bin/memory.js record \
  --project meu-projeto \
  --type decision \
  --summary "Usei JWT para autenticação" \
  --tags "auth,jwt" \
  --verified
```

### Buscar observations
```bash
node orquestrador/bin/memory.js search \
  --project meu-projeto \
  --search "auth"
```

### Ver timeline
```bash
node orquestrador/bin/memory.js timeline \
  --project meu-projeto
```

### Ver stats
```bash
node orquestrador/bin/memory.js stats \
  --project meu-projeto
```

## 2. Testar Benchmark

### Listar cenários
```bash
node benchmarks/benchmark.js list
```

### Executar benchmark
```bash
node benchmarks/real-benchmark.js
```

### Ver resultados
```bash
cat benchmarks/results/real/real-benchmark-report.json
```

## 3. Rodar Todos os Testes

```bash
node --test tests/*.test.js
```

## 4. Exemplos Práticos

### Exemplo 1: Registrar descoberta
```bash
node orquestrador/bin/memory.js record \
  --project api-auth \
  --type discovery \
  --summary "Bug: refresh token pode ser reusado" \
  --details "O TokenService permite múltiplos refreshes com o mesmo token" \
  --files "src/services/TokenService.ts" \
  --tags "bug,security,auth"
```

### Exemplo 2: Buscar por tipo
```bash
node orquestrador/bin/memory.js search \
  --project api-auth \
  --type bug
```

### Exemplo 3: Consolidar observations
```bash
node orquestrador/bin/memory.js consolidate \
  --project api-auth \
  --ids "obs_abc123,obs_def456" \
  --type problem \
  --summary "Problema de segurança no refresh token"
```

### Exemplo 4: Limpar dados antigos
```bash
node orquestrador/bin/memory.js retention \
  --project api-auth \
  --max-age-days 30 \
  --max-count 100
```

## 5. Verificar Instalação

```bash
# Rodar todos os testes
node --test tests/*.test.js

# Verificar se há erros
echo $?
```

## 6. Estrutura de Diretórios

```
~/.orquestrador/memory/
  projects/
    meu-projeto/
      observations.jsonl
    outro-projeto/
      observations.jsonl
```

## 7. Comandos Disponíveis

### Memória
- `record` - Registrar observation
- `search` - Buscar observations
- `show` - Ver observation específica
- `timeline` - Ver cronologia
- `promote` - Promover para conhecimento canônico
- `stats` - Ver estatísticas
- `projects` - Listar projetos
- `prune` - Limpar observations antigas
- `dedupe` - Remover duplicatas
- `consolidate` - Consolidar observations
- `retention` - Aplicar política de retenção
- `cleanup` - Limpeza completa

### Benchmark
- `list` - Listar cenários
- `run` - Executar benchmark
- `compare` - Comparar resultados
- `report` - Gerar relatório