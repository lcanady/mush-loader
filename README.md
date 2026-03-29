# mush-loader

> Safe MUSHcode loader for RhostMUSH — CLI + in-game commands with optional AI vetting

**Version:** 0.1.0  **Server:** RhostMUSH  **License:** MIT

![Coverage](https://img.shields.io/badge/coverage-99.69%25%20line%20%7C%2095.71%25%20branch-brightgreen)

Load softcode onto your RhostMUSH game from the command line or from inside the game itself. Static
validation runs on every load; plug in an AI provider to get deep security analysis before anything
touches your database. Registry packages are SHA-256 verified before install.

---

## Installation

### Prerequisites

- RhostMUSH server with `execscript` enabled for your wizard character
- Node.js 18+ and npm
- Wizard-level access to paste or send commands to the game

### Install the CLI

```bash
git clone https://github.com/lcanady/mush-loader
cd mush-loader
npm install && npm run build
cp config/loader.conf.example config/loader.conf
# edit loader.conf with your game connection details
```

### Configure

Open `config/loader.conf` and set at minimum:

```bash
export RHOST_HOST=localhost   # game hostname
export RHOST_PORT=4201        # telnet port
export RHOST_USER=Wizard      # wizard character name
export RHOST_PASS=secret      # wizard password
```

All other settings (AI vetting, HTTP API, registry URL) are optional — see
[Configuration](#configuration) below.

### Bootstrap your game

Run once to create the `MushLoader <sys>` object and install the `+mload` command suite:

```bash
source config/loader.conf
mush-loader bootstrap
```

Then in-game as Wizard, point the object at your install directory:

```
&MLOAD_INSTALL_PATH search(name=MushLoader <sys>)=/absolute/path/to/mush-loader
```

Verify the install:

```
+mload
```

Expected output: usage text listing all available `+mload` switches.

### Rollback

To remove the in-game objects manually, `@nuke` the `MushLoader <sys>` and `HelpSystem <sys>`
objects. The CLI leaves no persistent state on the server aside from those two objects.

---

## CLI Reference

```
mush-loader load [--vet] [--dry-run] <file.mush>
mush-loader vet <file.mush>
mush-loader registry
mush-loader search <query>
mush-loader info <pkg[@version]>
mush-loader install <pkg[@version]>
mush-loader update <pkg[@version]>
mush-loader status
mush-loader bootstrap
```

| Command | Description |
|---------|-------------|
| `load <file>` | Static validation + install a local `.mush` file |
| `load --vet <file>` | AI vet first; blocked on `fail`, prompts on `warn`, then installs |
| `load --dry-run <file>` | Print every command that would execute — nothing sent to game |
| `vet <file>` | AI vet only; records outcome to mush-patterns; exits 1 on fail |
| `registry` | List all packages in the community registry |
| `search <query>` | Filter registry by name, tag, or description |
| `info <pkg[@version]>` | Show details for a specific registry package |
| `install <pkg[@version]>` | Download, verify SHA-256, and install a registry package |
| `update <pkg[@version]>` | Diff against previous install, then re-install if changed |
| `status` | Test HTTP API and telnet connectivity to the game |
| `bootstrap` | Install `MushLoader <sys>` object and `+mload` command suite |

---

## In-Game Commands

All commands require the WIZARD flag. The use lock on `MushLoader <sys>` enforces this at the
object level; individual commands re-check `hasflag(%#,wizard)` for defense in depth.

| Command | Description |
|---------|-------------|
| `+mload <file>` | Load a local file (path validated, then sent via execscript) |
| `+mload/vet <file>` | AI vet the file and queue it for approval; blocks if a load is already pending |
| `+mload/approve` | Install the file queued by `+mload/vet` |
| `+mload/reject` | Discard the queued file without installing |
| `+mload/registry` | List packages available in the mush-loader registry |
| `+mload/install <pkg[@version]>` | Download and install a registry package |
| `+mload/status` | Show the most recent entry in the load history log |
| `+mload/log` | Show the full timestamped load history |
| `+mload/help [<topic>]` | Show overview help, or help for a specific switch |

File and package name arguments are sanitized before being passed to `execscript`. Paths allow only
`a-z A-Z 0-9 / . - _ @` and block `..` (path traversal). Package names allow only
`a-z A-Z 0-9 @ . - _`.

---

## AI Vetting

Set `AI_PROVIDER` in `loader.conf` to enable. Supported providers:

| Provider | `AI_PROVIDER` value | Notes |
|----------|---------------------|-------|
| Anthropic (Claude) | `anthropic` | Requires `AI_API_KEY` |
| OpenAI | `openai` | Requires `AI_API_KEY` |
| Google Gemini | `gemini` | Via OpenAI-compatible endpoint |
| Ollama (local) | `ollama` | No key needed; set `AI_BASE_URL` |
| Custom endpoint | `custom` | Set `AI_BASE_URL`; key optional |

Leave `AI_PROVIDER` unset to use static-only validation (always active regardless of AI settings).

Vet verdicts:

- **pass** — code looks clean; load proceeds automatically when using `--vet`
- **warn** — findings present but not blocking; CLI prompts `[y/N]` before loading
- **fail** — load is blocked; outcome recorded to mush-patterns as an anti-pattern

Vetted code is automatically contributed to
[mush-patterns](https://github.com/lcanady/mush-patterns) to build a community knowledge base.

---

## Configuration

All settings are environment variables. Source `loader.conf` before running the CLI, or export them
directly.

| Variable | Default | Description |
|----------|---------|-------------|
| `RHOST_HOST` | `localhost` | Game hostname |
| `RHOST_PORT` | `4201` | Telnet port |
| `RHOST_USER` | `Wizard` | Wizard character name |
| `RHOST_PASS` | _(required)_ | Wizard password |
| `API_PORT` | _(unset)_ | RhostMUSH HTTP API port (replaces telnet when all three API vars are set) |
| `API_DBREF` | _(unset)_ | Dbref of the `@api/enable`'d object (e.g. `#123`) |
| `API_PASSWORD` | _(unset)_ | Password set with `@api/password <dbref>=<pass>` |
| `AI_PROVIDER` | _(unset)_ | `anthropic` \| `openai` \| `gemini` \| `ollama` \| `custom` |
| `AI_API_KEY` | _(unset)_ | API key for chosen AI provider |
| `AI_MODEL` | _(provider default)_ | Model name (e.g. `claude-opus-4-6`, `gpt-4o`) |
| `AI_BASE_URL` | _(unset)_ | Base URL for `ollama` or `custom` providers |
| `REGISTRY_URL` | GitHub mush-registry index | Override registry source |

### HTTP API (optional)

When `API_PORT`, `API_DBREF`, and `API_PASSWORD` are all set, the CLI uses the RhostMUSH HTTP API
instead of telnet. This is faster and more reliable when the game host is network-accessible. See
[docs/game-setup.md](docs/game-setup.md) for setup instructions.

### In-game configuration

The `MushLoader <sys>` object stores a small amount of state:

| Attribute | Description |
|-----------|-------------|
| `MLOAD_INSTALL_PATH` | Absolute path to the mush-loader directory on the server (set once after bootstrap) |
| `MLOAD_LOG` | Pipe-separated timestamped history of all load operations |
| `MLOAD_PENDING` | Flag set while a vetted load is awaiting approval |
| `MLOAD_QUEUE` | Path of the file currently queued for approval |
| `MLOAD_VERSION` | Version string set at bootstrap time |

---

## In-Game Help System

The `softcode/help-system.mush` file installs a full `+help` system on a separate
`HelpSystem <sys>` object. Install it the same way as the main bootstrap:

```bash
mush-loader load softcode/help-system.mush
```

Or in-game: `+mload /path/to/mush-loader/softcode/help-system.mush`

### Player commands

| Command | Description |
|---------|-------------|
| `+help` | Show index grouped by category |
| `+help <topic>` | Look up a topic (case-insensitive) |
| `+help/list` | All accessible topics grouped by category |
| `+help/list <cat>` | Topics in one category |
| `+help/search <kw>` | Keyword search (skips topics caller can't read) |
| `+help/cats` | List categories with descriptions |

### Wizard commands

| Command | Description |
|---------|-------------|
| `+help/set <topic>=<text>` | Create or update a topic |
| `+help/set/hidden <topic>=<text>` | Create or update a hidden topic (wizard-only visibility) |
| `+help/set/lock <topic>=<preset\|expr>` | Set a read lock (preset: `public`, `staff`, `royalty`, `wizard`) |
| `+help/set/unlock <topic>` | Clear a read lock |
| `+help/delete <topic>` | Remove a topic |
| `+help/reload <topic>` | Force-fetch from `HOOK_FETCH` |
| `+help/addcat <cat>=<desc>` | Create a category |
| `+help/delcat <cat>` | Delete a category |
| `+help/setcat <topic>=<cat>` | Assign a topic to a category |
| `+help/list/all` | Audit view: all topics with their lock expressions |

---

## Development

### Project structure

```
src/            TypeScript CLI source
  cli.ts        Entry point — all CLI commands
  config.ts     Config loader (env vars → typed Config)
  validate.ts   Static MUSHcode validation
  vet.ts        AI vetting orchestration
  install.ts    Game install (telnet + API paths)
  registry.ts   Community registry fetch, search, resolve
  history.ts    Local install history (for update diffs)
  client.ts     Telnet client
  api.ts        RhostMUSH HTTP API client
  parse.ts      .mush file parser (pre/main/post sections)
  patterns.ts   Pattern extraction for mush-patterns
  ai/           AI provider adapters (anthropic, openai-compat, ollama, custom)
softcode/       RhostMUSH softcode source files
  bootstrap.mush   Creates MushLoader <sys> object
  commands.mush    Installs +mload command suite
  help-system.mush Installs +help system
  rockjobs.mush    Additional softcode (untracked)
tests/          Test suites
  unit/         Unit tests (node --test)
  bootstrap.test.ts
  commands.test.ts
  security.test.ts
  help-system.test.ts
config/         Configuration templates
docs/           Extended documentation
scripts/        Server-side wrapper scripts (mload execscript wrapper)
```

### Build

```bash
npm run build          # compile TypeScript → dist/
npm run dev            # run CLI via tsx without compiling
```

### Test

```bash
npm test               # run all test suites
npm run test:unit      # unit tests only
npm run test:bootstrap # bootstrap integration test
npm run test:commands  # command suite integration test
npm run test:security  # security / injection tests
npm run test:help      # help system tests
```

### Workflow

Use the mush-architect skill suite in Claude Code for all development:

- `/mush-build` — build installer from src/
- `/mush-test` — run tests
- `/mush-lint` — lint checks
- `/mush-release` — version bump and release

---

## Security

All user-supplied input that reaches `execscript` is sanitized by `FN_SAFE_PATH` and `FN_SAFE_PKG`
before use. The allowlisted subcommands in `FN_EXEC` prevent future callers from accidentally
passing user input as the subcommand. See [SECURITY.md](SECURITY.md) for the full threat model and
disclosure policy.

---

## Docs

- [Game setup](docs/game-setup.md) — full server-side setup walkthrough
- [Usage guide](docs/usage.md) — detailed CLI and in-game usage
- [AI providers](docs/ai-providers.md) — provider-specific configuration
- [Contributing to the registry](docs/contributing.md) — how to publish packages

---

## Contributing

1. Fork the repo and create a feature branch.
2. Write tests in `tests/` before writing code.
3. Run `npm test` and confirm all tests pass.
4. Open a PR — include test output in the PR description.

---

## License

MIT
