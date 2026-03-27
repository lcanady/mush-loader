# Usage Guide

## CLI

Source your config, then run any command:

```bash
source config/loader.conf

# Load a file (static validation only)
mush-loader load my-system.mush

# Load with AI vetting first (requires AI_PROVIDER in config)
mush-loader load --vet my-system.mush

# Vet without loading (exit 1 if verdict is fail)
mush-loader vet my-system.mush

# Browse the registry
mush-loader registry

# Install a registry package
mush-loader install bboard
mush-loader install bboard@1.2.0

# (Re)install the game-side bootstrap object
mush-loader bootstrap
```

## In-game commands

All commands require Wizard level.

| Command | Description |
|---------|-------------|
| `+mload` | Show help and version |
| `+mload <file>` | Load a local .mush file (path on server) |
| `+mload/vet <file>` | Vet a file with AI, queue for approval |
| `+mload/approve` | Approve and install a queued vetted load |
| `+mload/reject` | Reject and discard a queued load |
| `+mload/registry` | List available registry packages |
| `+mload/install <pkg>` | Fetch a registry package and install it |
| `+mload/status` | Show the last logged operation |
| `+mload/log` | Show full load history |

## .mush file format

One command per line. Lines starting with `#` are comments and are ignored.

You can include optional `#!pre-install` and `#!post-install` hooks. All three sections are independently vetted before any section is installed. If any section fails, the entire load is blocked.

```mushcode
# My System v1.0

#!pre-install
# Runs first — precondition checks, dependency setup
think Pre-install: checking requirements...
#!end-pre-install

# Main code
@create MySystem <sys>
@set MySystem <sys>=inherit safe
@fo me=&d.sys me=search(name=MySystem <sys>)
&FN_GREET [v(d.sys)]=[if(not(%0),#-1 MISSING ARG,Hello [name(%0)]!)]

#!post-install
# Runs after main — wiring, version stamp, announcement
&VERSION [v(d.sys)]=1.0.0
think Post-install: MySystem at [v(d.sys)].
#!end-post-install
```

Sections that are absent are silently skipped.

## Vetting

Vetting runs on all sections independently. Each section is labelled in findings (e.g. `[pre-install]`, `[main]`, `[post-install]`).

Stages always run in order:

1. **Static validation** — fast, no AI, always runs. Catches injection vectors, `@power`, unbalanced brackets. A `fail` blocks the load and skips AI.

2. **AI vetting** — runs only if `AI_PROVIDER` is configured. Deeper semantic audit. Returns `pass`, `warn`, or `fail` with findings.

If static passes but AI warns, you are asked to confirm before loading.

### What happens after vetting

| Verdict | Action |
|---------|--------|
| `pass` | Code is added as a pattern to `../mush-patterns` via PR |
| `warn` | You approve/reject → if approved, pattern PR is opened |
| `fail` | Load blocked; findings recorded in `../mush-patterns/anti-patterns/` |

## The pending approval flow

`+mload/vet` is asynchronous — it queues the vet result so you can review it before committing. Only one load can be pending at a time.

```
+mload/vet /opt/mush-loader/packages/my-system.mush
  → Vetting... (calls AI)
  → Shows vet findings
  → "Use +mload/approve to install or +mload/reject to cancel."

+mload/approve
  → Installs the queued file

+mload/reject
  → Clears the queue without installing
```
