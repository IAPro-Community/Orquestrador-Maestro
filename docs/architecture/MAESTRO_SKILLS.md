# Maestro Skills

The runtime Skill Registry enforces Skill Contract V2 natively for official `maestro/*` skills. External library skills, user-installed provider skills, and project-local skills keep their own formats and are normalized only at the compatibility boundary; they do not need to adopt the Maestro manifest.

Skill identity is namespaced, for example `maestro/security-review`, `user/codex/react`, and `project/omega-development`. Source and verification are independent: only skills from the distributed Maestro bundle are `maestro_verified`; user and project discoveries are `unverified` by default.
