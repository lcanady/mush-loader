# Changelog

All notable changes to mush-loader are documented here.
Follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) conventions.

---

## [1.0.0] — 2026-03-29

### Added

#### CLI commands
- `mush-loader init <name>` — scaffold a new `.mush` file and parallel `tests/<name>.test.ts` stub
- `mush-loader history` — surface `~/.mush-loader/history.json` with `--limit`, `--host`, and `--json` flags
- `mush-loader search <query>` — search registry by name, tag, or description
- `mush-loader info <pkg[@version]>` — show details for a registry package before installing
- `mush-loader status` — check latency for both the HTTP API and telnet paths
- `mush-loader update <pkg>` — fetch new registry version, diff against installed code, confirm before applying
- `--dry-run` flag on `mush-loader load` — parse, validate, and print all commands without connecting

#### Install history (`src/history.ts`)
- Every successful `load` and `install` writes an entry to `~/.mush-loader/history.json`
- Entries store: timestamp, source (file/registry), package name, version, host, port, raw code, success flag, object dbref
- `mush-loader update` reads history to produce the diff

#### In-game help system (`softcode/help-system.mush`)
- Full `+help` command suite: `+help <topic>`, `+help/list [cat]`, `+help/set`, `+help/delete`, `+help/addcat`, `+help/rmcat`, `+help/setcat`, `+help/lock`
- Category-based organisation with hidden (wizard-only) topics
- Read locks: preset shortcuts (`public`, `staff`, `wizard`, `royalty`) or arbitrary MUSH lock expressions
- Wizard-only write path; public read path gated per-topic by lock

#### HTTP API transport (`src/api.ts`)
- When `API_PORT`, `API_DBREF`, and `API_PASSWORD` are all set, installs go over HTTP instead of telnet
- `mush-loader status` reports both paths
- MUSH-level error detection via GET translation on the API path

#### Rockjobs softcode (`softcode/rockjobs.mush`)
- Full job/request system for RhostMUSH: `+job/*`, `+jobs/*`, `+request/*`, `+requests`
- SR4 hook attributes: `HOOK_ON_COMPLETE`, `HOOK_ON_APPROVE`, `HOOK_ON_DENY`, `HOOK_ON_COMMENT`
- Tier-based access control with configurable `tier`<N> UDFs

#### Expanded static validator (`src/validate.ts`)
- 9 new patterns: `@switch` case injection, `#1` destroy targeting, `@pemit` unsanitised input, `@function` without `/safe`, `get()`/`xget()` with user-controlled object, `@tel` user-controlled destination, `@set !safe`/`!inherit`, bare `execscript()`, `@boot`/`@nuke`

#### FN_EXEC subcommand allowlist (`softcode/commands.mush`)
- Only `load`, `vet`, `install`, `registry`, `status` are accepted; anything else is rejected before exec

### Fixed

#### Security — rockjobs.mush
- **B3** `+job/tier` — only tier names that exist in TIER_LIST are accepted; numeric IDs rejected
- **B5** `+jobs/mine` — replaced `@assert` (which aborted the chain on empty result) with `@skip/ifelse`
- **B6** `+job/status` — status values are now mapped to canonical codes before storage
- **B10** `+request/comment` — non-numeric request IDs now return a clear error instead of silently failing
- **M-RJ-01** `+job/rename` — bracket-rejection guard on new job name (stored injection via `fn\`showjob`)
- **M-RJ-02** `+job/comment` — bracket-rejection guard on comment body (stored injection via `fn\`showjob`)
- **H1** `+request` / `+request/cancel` — changed `isnum()` to `isint()` so decimal values like `1.5` are rejected
- **C1** `+request/create` — added bracket-rejection guard on category argument (`%0`) which was previously unguarded
- **C2** `+request/comment` — bracket-rejection guard on comment body
- **M2** `@lock/use` on Job Database — changed `haspower(me,Wizard)` to `hasflag(%#,wizard)`; `me` in a lock expression refers to the locked object, not the enactor

#### Security — commands.mush
- `TR_EXEC_VET`, `TR_EXEC_INSTALL`, `TR_EXEC_LOAD` — replaced `isdbref(%q9)` error check with `strmatch(%q9, #-*)` to reliably detect `#-1 INVALID PATH` / `#-1 INVALID PACKAGE NAME` on strict implementations
- `patterns.ts` — hardened against shell injection and path-traversal info disclosure

#### Bugs — commands.mush
- `+mload/status` — was using `last(iter(…, |))` which returned the last space-separated word of the last pipe-delimited entry; fixed to `last(get(MLOAD_LOG), |)` which correctly returns the last log entry

#### Bugs — help-system.mush
- `CMD_HELP_LIST_CAT` — `@trigger` was targeting `CMD_HELP_LIST_BARE` (a `$`-command attribute), whose body includes the `$+help/list:` prefix; extracted shared body to `TR_HELP_LIST_BARE` and both entry points now call that
- `TR_HELP_SETCAT` (`+help/setcat`) — now checks that the target category exists in `CAT__INDEX` before writing `HELPCAT_<topic>`; previously silently assigned topics to non-existent categories

### Tests
- `tests/rockjobs.test.ts` — 32 integration tests across wizard and player runners covering all 25 commands, documented security fixes (B3/B5/B6/B10/M-RJ-01/M-RJ-02/H1/C1/C2), and SR4 hook callbacks
- `tests/help-system.test.ts` — help system integration tests
- `tests/security.test.ts` — static validator and injection-guard tests
- `tests/commands.test.ts` — +mload command suite integration tests
- `tests/bootstrap.test.ts` — bootstrap object presence and attribute tests

---

## [0.1.0] — Initial release

- `mush-loader load [--vet] <file.mush>` — validate and install a local `.mush` file
- `mush-loader vet <file.mush>` — vet without installing (exit 1 on fail)
- `mush-loader registry` — list available packages
- `mush-loader install <pkg[@version]>` — fetch and install from registry
- `mush-loader bootstrap` — install the `MushLoader <sys>` game object and `+mload` command suite
- In-game `+mload` command suite via RhostMUSH `execscript()`
- Static validator with 9 initial patterns
- AI vetting via configurable provider (Anthropic, OpenAI, Gemini, Ollama, custom)
- Telnet transport for game communication
