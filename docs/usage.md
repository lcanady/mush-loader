# Usage Guide

## CLI

Source your config, then run any command:

```bash
source config/loader.conf
```

### Checking connectivity

Before loading anything, verify the CLI can reach your game:

```bash
mush-loader status
```

Output shows latency for both the HTTP API (if configured) and the telnet path:

```
Game: localhost:4201

Testing HTTP API (port 2222)...
  API OK  12ms  — server: RhostMUSH 4.0.0
Testing telnet (port 4201)...
  Telnet OK  38ms
```

---

### Loading files

```bash
# Preview commands without connecting (no game changes)
mush-loader load --dry-run my-system.mush

# Load with static validation only
mush-loader load my-system.mush

# Load with AI vetting first (requires AI_PROVIDER in config)
mush-loader load --vet my-system.mush

# Vet without loading (exit 1 if verdict is fail)
mush-loader vet my-system.mush
```

`--dry-run` parses the file, runs static validation, and prints every command
that would execute — pre-install, main, and post-install sections in order.
Nothing is sent to the game.

---

### Registry

```bash
# List all available packages
mush-loader registry

# Search by name, tag, or description
mush-loader search bboard
mush-loader search "character generation"
mush-loader search utility

# Show details for a specific package before installing
mush-loader info bboard
mush-loader info bboard@1.2.0

# Install latest version
mush-loader install bboard

# Install a specific version
mush-loader install bboard@1.2.0

# Update to the latest registry version (shows diff first)
mush-loader update bboard
```

`mush-loader update` fetches the new version, diffs it against your previously
installed code, shows the changes, then asks `[y/N]` before proceeding. If the
code is identical to what you already have, it tells you so and exits.

---

### Scaffolding a new package

```bash
mush-loader init my-system
```

Creates two files in the current directory:

- `my-system.mush` — softcode template with pre-install / main / post-install sections
- `tests/my-system.test.ts` — test stub wired to `@rhost/testkit`

The object name is derived from the slug (`my-system` → `My System <sys>`). Edit both files,
then run `mush-loader load --dry-run my-system.mush` to preview before installing.

---

### Bootstrapping

```bash
# (Re)install the game-side bootstrap object and +mload commands
mush-loader bootstrap
```

---

## Install history

Every successful `load` and `install` is recorded in `~/.mush-loader/history.json`.

```bash
# Show the last 20 installs (all hosts)
mush-loader history

# Limit to 5 entries
mush-loader history --limit 5

# Filter by game host
mush-loader history --host game.example.com

# Raw JSON (useful for scripting)
mush-loader history --json
```

Each entry stores the timestamp, game host, package name/version, and the raw
code that was installed. `mush-loader update` reads from this history to produce
the diff.

---

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
| `+mload/install <pkg[@version]>` | Fetch a registry package and install it |
| `+mload/status` | Show the last logged operation |
| `+mload/log` | Show full load history |
| `+mload/help [<topic>]` | In-game help; topic can be any switch name |

---

## .mush file format

One command per line. Lines starting with `#` are comments and are ignored.

You can include optional `#!pre-install` and `#!post-install` hooks. All three
sections are independently vetted before any section is installed. If any
section fails, the entire load is blocked.

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

---

## Vetting

Vetting runs on all sections independently. Each section is labelled in
findings (e.g. `[pre-install]`, `[main]`, `[post-install]`).

Stages always run in order:

1. **Static validation** — fast, no AI, always runs. Catches injection
   vectors, dangerous commands, unbalanced brackets. A `fail` blocks the
   load and skips AI.

2. **AI vetting** — runs only if `AI_PROVIDER` is configured. Deeper
   semantic audit. Returns `pass`, `warn`, or `fail` with findings.

If static passes but AI warns, you are asked to confirm before loading.

### What the static validator catches

| Pattern | Severity |
|---------|----------|
| `execscript()` with user-controlled arg | error |
| `@power`, `@wizard` | error |
| `@fo`/`@force` with user-controlled object or command | error |
| `@trigger` with user-controlled attribute name | error |
| `@chown` with user-controlled target or new owner | error |
| `@newpassword` | error |
| `@su`/`@sudo` | error |
| `@switch` case label contains `%0`–`%9` | error |
| Destroy targeting `#1` | error |
| `@pemit` interpolating unsanitized user input | warn |
| `@function` without `/safe` | warn |
| `get()`/`xget()` with user-controlled object | warn |
| `@tel` destination user-controlled | warn |
| `@set ... !safe` or `@set ... !inherit` | warn |
| `execscript()` usage (no user arg, but still suspicious) | warn |
| `@boot`, `@nuke` | warn |
| Unbalanced `[` `]` brackets | warn |

### What happens after vetting

| Verdict | Action |
|---------|--------|
| `pass` | Code is added as a pattern to `../mush-patterns` via PR |
| `warn` | You approve/reject → if approved, pattern PR is opened |
| `fail` | Load blocked; findings recorded in `../mush-patterns/anti-patterns/` |

---

## The pending approval flow (+mload/vet)

`+mload/vet` queues the vet result so you can review it before committing.
Only one load can be pending at a time.

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
