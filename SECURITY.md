# Security Policy

## Supported Versions

Only the latest commit on `master` is supported for security fixes.

## Reporting a Vulnerability

Do not open public issues for security vulnerabilities.

Report privately to the project owner first, then wait for a fix before public disclosure.

Include:
- Affected endpoint/page/file
- Reproduction steps
- Expected vs actual behavior
- Impact (what data or access is at risk)

## Security Boundaries

This project is a web tracker and optional local log sync agent.

Allowed:
- Reading local EFT log files
- Sending parsed task events to this app over HTTPS

Not allowed:
- Memory reading from game process
- DLL injection, hooks, or process tampering
- Any anti-cheat bypass behavior

## Hard Requirements Before Public Release

- No live secrets in git (keys, tokens, DB URLs, session secrets)
- `.env` and `.env.local` must stay untracked
- Rotate all production secrets after any accidental exposure
- Keep invite/admin controls protected by strong random secrets
- Keep dependency versions up to date and patch vulnerable packages quickly
