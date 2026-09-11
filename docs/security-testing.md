# Testes de segurança

Use esta esteira para encontrar riscos no próprio projeto ou em ambientes explicitamente autorizados. Ela melhora a evidência de segurança, mas não promete ausência total de vulnerabilidades.

O Orquestrador oferece uma esteira em camadas para testar o próprio código e ambientes controlados. Ela é complementar, não uma garantia de ausência de vulnerabilidades.

## Execução local

Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\security-scan.ps1 -RepoPath .
```

Linux/macOS:

```bash
bash scripts/security-scan.sh --repo .
```

Os resultados ficam em `security-reports/`, que deve permanecer fora da publicação quando contiver dados sensíveis.

## Pentest com Strix

O Strix é opt-in e exige um alvo autorizado:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\security-scan.ps1 -RepoPath . -RunStrix -StrixTarget . -Authorized
```

Para uma aplicação em execução, use uma URL própria de local, preview ou staging. O Strix deve rodar isolado, sem segredos de produção e sem permissão para alterar código, infraestrutura ou dados reais. Consulte a [documentação oficial do Strix](https://github.com/usestrix/strix).

## Pipeline recomendado

| Momento | Controles | Política |
|---|---|---|
| Pre-commit | Gitleaks | Bloqueia segredo confirmado |
| Pull request | Semgrep, CodeQL, OSV-Scanner, Trivy | Bloqueia falhas altas/críticas confirmadas |
| Preview/staging | ZAP, Nuclei, Schemathesis | Escopo explícito, baixa taxa e sem ações destrutivas |
| Periódico | Strix | Pentest agentivo com revisão humana |

## Repositórios de referência

- [Strix](https://github.com/usestrix/strix)
- [Semgrep](https://github.com/semgrep/semgrep)
- [Gitleaks](https://github.com/gitleaks/gitleaks)
- [OSV-Scanner](https://github.com/google/osv-scanner)
- [Grype](https://github.com/anchore/grype)
- [Trivy](https://github.com/aquasecurity/trivy)
- [OWASP ZAP](https://github.com/zaproxy/zaproxy)
- [Nuclei](https://github.com/projectdiscovery/nuclei)
- [Schemathesis](https://github.com/schemathesis/schemathesis)

Não recomendamos executar Kali, Metasploit ou agentes de exploração irrestrita dentro do CI. Eles podem ser usados separadamente em um laboratório isolado, quando houver um plano de teste aprovado.
