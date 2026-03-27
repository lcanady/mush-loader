# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x     | Yes       |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email the maintainer directly or open a [GitHub Security Advisory](https://github.com/lcanady/mush-loader/security/advisories/new). Include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You can expect an acknowledgement within 48 hours and a fix or mitigation plan within 14 days.

## Security Design

### MUSHcode vetting

All softcode passes through static validation (`src/validate.ts`) before installation. Patterns that are always blocked:

- `execscript()` with user-controlled arguments
- `@power`, `@wizard` privilege escalation
- `@destroy #1` and similar critical object destruction
- `@switch` with user input in case position

Patterns that produce a `warn` verdict (require explicit approval):

- Any `execscript()` call
- `@boot`, `@nuke`
- Unbalanced `[` / `]` brackets

AI vetting (optional) adds a second pass using the model of your choice. Both the static and AI verdict must be `pass` before a `--vet` load proceeds automatically.

### Registry integrity

Every package downloaded from the registry is verified against its SHA-256 hash before installation. A mismatch aborts the install with a clear error.

Registry URLs are validated to `http:` or `https:` schemes only — `file://`, `javascript:`, and `data:` URIs are rejected.

### In-game privilege

All `+mload` commands require the `Wizard` flag (`hasflag(%#,wizard)`). The `MushLoader <sys>` bootstrap object is flagged `INHERIT SAFE` and locked to wizard-only access.

### Credentials

Game credentials (`RHOST_PASS`, `RHOST_USER`) are read from environment variables only. The example config file (`config/loader.conf.example`) is committed; the actual `loader.conf` is `.gitignore`d and must never be committed.
