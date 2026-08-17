# Maestro Skills

The runtime Skill Registry wraps existing manifests and routing. It lists official Maestro bundle skills, user-installed provider skills, and project-local skills without copying or installing them.

Skill identity is namespaced, for example `maestro/security-review`, `user/codex/react`, and `project/omega-development`. Source and verification are independent: only skills from the distributed Maestro bundle are `maestro_verified`; user and project discoveries are `unverified` by default.
