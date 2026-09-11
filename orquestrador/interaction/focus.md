# Focus

O perfil `focus` é opt-in para fluxos gerenciados pelo Maestro. Ele prioriza o
estado atual e a próxima ação, reduz tangentes e exige evidência na conclusão.

Contrato compacto injetado somente em prompts gerenciados:

```text
Interaction profile: focus

Communication requirements:
- expose current state
- show next action when required
- suppress unrelated tangents
- maximum visible working set: 5
- report failures as failure → evidence → corrective action
- completion requires evidence
```
