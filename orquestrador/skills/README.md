# Orquestrador Skills

Este diretório é a fonte canônica das skills customizadas.

Para escolher uma skill, leia primeiro:

`{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json`

Para ver organização, categorias e regras de manutenção, leia:

`{{USER_HOME}}/.orquestrador/SKILLS_ORGANIZATION.md`

Não edite os espelhos diretamente. Depois de alterar uma skill canônica, execute:

`powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador/sync-skills.ps1 -Apply`

Depois valide:

`powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador/doctor.ps1`
