# +help System

A self-contained in-game help system for RhostMUSH with layered visibility
controls (hidden attributes + per-topic lock expressions), category grouping,
lock presets, and optional hooks for external database integration.

## Installation

```bash
mush-loader install softcode/help-system.mush
```

Creates `HelpSystem <sys>` with `inherit safe`.

---

## Commands

### Public (all players)

| Command | Description |
|---------|-------------|
| `+help` | Index of all accessible topics, grouped by category |
| `+help <topic>` | Display a topic. Not found or locked → "No help found" |
| `+help/list` | All accessible topics, grouped by category with counts |
| `+help/list <cat>` | Topics in one category |
| `+help/search <kw>` | Keyword search across topic names and text |
| `+help/cats` | List all accessible categories with descriptions |

### Wizard-only

| Command | Description |
|---------|-------------|
| `+help/set <topic>=<text>` | Create or update a public topic |
| `+help/set/hidden <topic>=<text>` | Create or update a hidden topic (wizard-only visibility) |
| `+help/set/lock <topic>=<preset\|expr>` | Set a read lock |
| `+help/set/unlock <topic>` | Clear a read lock |
| `+help/delete <topic>` | Remove a topic and all its metadata |
| `+help/reload <topic>` | Force-fetch from `HOOK_FETCH` and cache result |
| `+help/addcat <cat>=<desc>` | Create a category |
| `+help/delcat <cat>` | Delete a category (topics become Uncategorized) |
| `+help/setcat <topic>=<cat>` | Assign a topic to a category |
| `+help/list/all` | Audit view — all topics with lock expression and category |

---

## Visibility layers

Access control is layered. Both layers must pass for a player to read a topic.

### Layer 1 — Hidden attribute (`_HELP_*`)

Topics created with `+help/set/hidden` are stored as `_HELP_<TOPIC>` instead
of `HELP_<TOPIC>`. Only wizards can see them — they are completely invisible
to non-wizards in `+help`, `+help/list`, `+help/search`, and `+help/cats`.

```
+help/set/hidden staffnotes=Internal staff procedures.
```

Non-wizards typing `+help staffnotes` receive "No help found for staffnotes" —
the same response as a missing topic. No information is leaked.

### Layer 2 — Lock expressions (`HELPLOCK_*`)

Any topic (public or hidden) can additionally have a MUSH lock expression.
Players who fail the lock see the same "No help found" response.

Lock expressions are stored in `HELPLOCK_<TOPIC>` and evaluated with `elock()`
against the reading player. Any valid MUSH lock key works.

---

## Lock presets

Four presets are defined on `HelpSystem <sys>`. Pass the preset name to
`+help/set/lock` instead of writing a raw expression:

| Preset | Default expression | Who can read |
|--------|--------------------|--------------|
| `public` | `1` | Everyone |
| `staff` | `haspower(%#,staff)` | Players with the `staff` power |
| `royalty` | `hasflag(%#,royalty)` | Players with the ROYALTY flag |
| `wizard` | `hasflag(%#,wizard)` | Wizards |

```
+help/set/lock combat=public
+help/set/lock staffguide=staff
+help/set/lock secretlore=royalty
```

### Customizing presets

Presets are just attributes on `HelpSystem <sys>`. Override them to match your
game's staff structure:

```mushcode
&PRESET_STAFF <HelpSystem dbref>=haspower(%#,admin)
&PRESET_STAFF <HelpSystem dbref>=hasflag(%#,staff)|hasflag(%#,royalty)
```

### Freeform lock expressions

Pass any MUSH lock expression directly when no preset matches:

```
+help/set/lock secretroom==<dbref of specific player>
+help/set/lock builders=haspower(%#,builder)|hasflag(%#,wizard)
+help/set/lock viponly=hasattrval(me,VIP,1)
```

Expressions containing semicolons are rejected to prevent command injection.

---

## Categories

Categories group topics in `+help` and `+help/list` output. Uncategorized
topics appear last.

```
+help/addcat combat=Fighting, abilities, and tactics
+help/addcat crafting=Item creation and material gathering
+help/setcat combat-basics=combat
+help/setcat swords=combat
```

### Hidden categories

Category names starting with `_` follow the same convention as hidden topics —
only wizards see them in `+help/cats` and as grouping headers in lists.

```
+help/addcat _staffonly=Internal staff reference
+help/setcat arrestprocedure=_staffonly
```

### Deleting categories

`+help/delcat <cat>` removes the category. All topics that were assigned to it
become Uncategorized automatically — their text is not deleted.

---

## Audit view

`+help/list/all` (wizard only) shows every topic — including hidden — with its
current lock expression and category assignment:

```
Help Topics (audit)
------------------------------------------------------------
combat          [Combat]        public
staffnotes      [_staffonly]    [lock: hasflag(%#,wizard)]
secretlore      [Uncategorized] [lock: hasflag(%#,royalty)]
```

---

## External DB hooks

Two hook attributes on `HelpSystem <sys>` let you bridge in-game help to an
external web service. Both default to no-ops.

### `HOOK_FETCH`

Called when `+help <topic>` has no local text (cache miss) and by
`+help/reload`.

- **`%0`** — normalized topic name (lowercase)
- **Return** — help text string, or empty if not found

```mushcode
&HOOK_FETCH <dbref>=[execscript(helpfetch, %0)]
```

### `HOOK_SYNC`

Called after every `+help/set` and `+help/delete`.

- **`%0`** — operation: `set` or `delete`
- **`%1`** — normalized topic name
- **`%2`** — help text (empty for `delete`)
- **Return** — ignored

```mushcode
&HOOK_SYNC <dbref>=[execscript(helpsync, %0, %1, %2)]
```

Both hooks require `execscript` enabled and
`@power <HelpSystem dbref>=@a execscript`. See `docs/game-setup.md`.

---

## HTTPS integration patterns

### Pattern A — Push on write (web mirror)

1. Write `scripts/helpsync` to accept `(op, topic, text)` and write to your
   web database (PostgreSQL, SQLite, etc.).
2. Set `HOOK_SYNC` to call the script.
3. Your web app serves `https://yoursite.com/help/<topic>` from that DB.

Changes made in-game are pushed to the web automatically.

### Pattern B — Pull on read (web as source of truth)

1. Write `scripts/helpfetch` to GET `https://yoursite.com/api/help/<topic>`
   and print the result.
2. Set `HOOK_FETCH`.
3. `+help/reload <topic>` pulls from the web and caches locally.
4. `+help <topic>` uses the local cache; `HOOK_FETCH` fires only on a miss.

Use `+help/reload <topic>` to refresh a cached topic after editing it on the web.

---

## Storage layout

All data lives on `HelpSystem <sys>`:

| Attribute | Holds |
|-----------|-------|
| `HELP_<TOPIC>` | Public topic text |
| `_HELP_<TOPIC>` | Hidden topic text (wizard-only) |
| `HELPLOCK_<TOPIC>` | MUSH lock expression (absent = public) |
| `HELPCAT_<TOPIC>` | Category name (absent = Uncategorized) |
| `CAT_<NAME>` | Category description |
| `CAT__INDEX` | Pipe-separated list of category names |
| `PRESET_PUBLIC` | Lock expression for "public" preset |
| `PRESET_STAFF` | Lock expression for "staff" preset |
| `PRESET_ROYALTY` | Lock expression for "royalty" preset |
| `PRESET_WIZARD` | Lock expression for "wizard" preset |
| `HOOK_FETCH` | UDF called on cache miss |
| `HOOK_SYNC` | UDF called after every write |

---

## Running the tests

Requires a live RhostMUSH server with `help-system.mush` loaded:

```bash
RHOST_PASS=yourpassword npm run test:help
```

Optional: `RHOST_HOST` (default `localhost`), `RHOST_PORT` (default `4201`),
`RHOST_USER` (default `Wizard`).
