# Security Policy

## Local-first

Arcframe analyzes repositories on the local machine. Do not configure Arcframe to upload source code to third-party “Arcframe cloud” endpoints — none are required for core operation.

## Reporting a vulnerability

Please open a private security advisory on GitHub or email the maintainer via the GitHub profile [@theworker02](https://github.com/theworker02).

Include:

- Affected version / commit
- Reproduction steps
- Impact assessment

## Hard rules in product code

- `env_*` tools never return secret **values**
- `db_*` tools never expose credentials
- `security_*` tools are defensive analysis only
- Git push is never automatic
- Destructive operations require explicit intent

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes |
