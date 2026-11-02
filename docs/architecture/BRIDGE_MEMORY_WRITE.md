# Etapa 00D — memória canônica: escrita explicitamente autorizada

**API:** Bridge JSON-RPC v1, método `memory.record`.  
**Padrão de segurança:** DESABILITADO. Não introduz engine, store, scheduler ou cópia da memória do Nexus.  
**Dependência:** PR de leitura Maestro #42 / issue #41.

## Como habilitar

A instância local do Bridge só anuncia `initialize.capabilities.memory.write=true` quando o **operador inicia explicitamente o processo** com `ORQUESTRADOR_MAESTRO_BRIDGE_MEMORY_WRITE=1`. Sem isso, o método responde `-32601` e nada é salvo.

Mesmo com a instância habilitada, **cada solicitação** requer `confirmed:true`, `reason` de 8 a 200 caracteres e `idempotencyKey` estável. Essa confirmação é uma *declaração de consentimento local*, **não é autenticação criptográfica nem substituto de controle de acesso no Nexus**. Não expor este Bridge habilitado a clientes remotos ou não confiáveis.

```json
{
  "jsonrpc":"2.0",
  "id":3,
  "method":"memory.record",
  "params":{
    "confirmed":true,
    "reason":"Registrar decisão revisada do projeto",
    "idempotencyKey":"my-project-reviewed-decision-0001",
    "type":"decision",
    "summary":"O Maestro é o único proprietário da memória semântica",
    "scopeLevel":"branch"
  }
}
```

Retorno de sucesso: `{schemaVersion:1,authority:"maestro",status:"RECORDED",id:"obs_...",scope:{...}}`. Repetir a mesma chave e conteúdo/escopo retorna `status:"REPLAYED"` e o mesmo `id`; reutilizar chave com payload ou escopo diferente falha com `-32602`.

## Contrato e garantias

- Rejeita campos não previstos, escopos e IDs arbitrários, `verified`, `verifier`, `source` e `timestamp` do cliente. Qualquer observação registrada por esse método é explicitamente `verified:false`.
- Aceita somente `scopeLevel` igual a `repository`, `branch`, `workspace` ou `task`. O Maestro calcula os identificadores de repositório/branch/worktree Git; `task` exige `taskId`. Não permite caller-forged `scope`.
- `summary` até 500, `details` até 4000, `files/tags` no máximo 16 itens tipados e limitados. Política de captura, detecção de prompt injection, redaction e validação final continuam no `Memory.record` original.
- O adaptador usa um lock por hash de idempotency key, situado **na mesma pasta da memória canônica**, e somente então chama `Memory.record` (que conserva o lock de escrita por repositório). Isso torna a deduplicação serializável entre solicitações do Bridge no mesmo storage.
- Registra `source.tool=maestro-bridge`, `source.bridgeIdempotencyKey`, `source.bridgeRequestHash` e `source.operatorConfirmed=true`; o texto de consentimento não é armazenado como memória. Hash inclui conteúdo, `taskId` e escopo canônico.
- O `Bridge` em modo padrão continua somente leitura e compatível com clientes existentes.
- A API não faz `promote`, `reflect`, `retain` implícito, compaction, migração de INSTALL global, importação em massa ou remoção de registro.

## Validação e limites para ativação

```bash
node --test runtime/bridge/__tests__/memory-api.test.js
node --test runtime/bridge/__tests__/memory-write.test.js
node --test runtime/bridge/__tests__/memory-write-bridge.test.js
node --test runtime/bridge/__tests__/bridge.test.js
```

Requer provas em Node real (Windows/Linux), dois processos independentes tentando escrever a mesma chave, recuperação de lock expirado, `DEV/memory-policy.json` opt-out, duas branches/worktrees e preservação de evidências de aprovação. Antes de habilitar em Nexus Web/mobile, **é obrigatório criar um controle de acesso com confirmação do operador dentro do Nexus**, que não permita a UI passar `confirmed=true` sem uma ação genuína.

**Estado:** implementação candidata, PR draft, sem alegação de homologação. Sem merge automático.
