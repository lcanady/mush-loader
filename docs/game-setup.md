# Game Setup Guide

How to configure your RhostMUSH game to work with mush-loader.

## Prerequisites

- RhostMUSH server (any recent version)
- A Wizard-level character
- Node.js 18+ on the server running the game (for execscript-based in-game commands)
- mush-loader cloned on the server: `git clone https://github.com/lcanady/mush-loader`

---

## Step 1 — Install mush-loader on the server

```bash
git clone https://github.com/lcanady/mush-loader /opt/mush-loader
cd /opt/mush-loader
npm install
npm run build
```

---

## Step 2 — Configure your connection

```bash
cp /opt/mush-loader/config/loader.conf.example /opt/mush-loader/config/loader.conf
```

Edit `loader.conf` with your game's connection details:

```bash
export RHOST_HOST=localhost
export RHOST_PORT=4201
export RHOST_USER=Wizard
export RHOST_PASS=yourpassword
```

Test the connection:

```bash
source /opt/mush-loader/config/loader.conf
mush-loader status
```

---

## Step 3 — Install the bootstrap object

This creates the `MushLoader <sys>` object on your game and installs the `+mload` command suite:

```bash
source /opt/mush-loader/config/loader.conf
mush-loader bootstrap
```

You should see:
```
Installing mush-loader bootstrap object...
Installing +mload commands...
Bootstrap complete. The +mload command suite is now available in-game.
```

---

## Step 4 — Mark setup as complete on the game object

Connect to your game as Wizard and run:

```
&MLOAD_INSTALL_PATH search(name=MushLoader <sys>)=/opt/mush-loader
```

This attribute tells the in-game commands that setup is complete. Commands
check for its presence and show an error until it is set.

> **Note:** The actual path used to locate mush-loader at runtime comes from
> the `MLOAD_PATH` environment variable in the `scripts/mload` wrapper
> (configured in Step 5b), not from this attribute.

---

## Step 5 — Install the execscript wrapper

In-game commands call the CLI via `execscript()`.  RhostMUSH's `execscript()` runs a **script file** from the game's `execscripthome` directory — it does not execute arbitrary binaries directly.

### 5a — Configure execscripthome

In `rhostmush.conf`, set the directory where execscript looks for scripts.  The game's `scripts/` subdirectory is the conventional choice:

```
execscripthome /opt/rhost/Server/game/scripts
```

Restart the game after changing `rhostmush.conf`.

### 5b — Install the mload wrapper

Copy (or symlink) the `scripts/mload` wrapper from this repo into your game's execscripthome and make it executable:

```bash
cp /opt/mush-loader/scripts/mload /opt/rhost/Server/game/scripts/mload
chmod +x /opt/rhost/Server/game/scripts/mload
```

Edit the wrapper (or export `MLOAD_PATH` in your game server's startup environment) so it knows where mush-loader lives:

```bash
# Option A — edit the wrapper directly
sed -i 's|/opt/mush-loader|/your/actual/path|g' \
  /opt/rhost/Server/game/scripts/mload

# Option B — export before starting the game server
export MLOAD_PATH=/opt/mush-loader
```

### 5c — Grant the execscript power

The bootstrap already runs this, but if you need to do it manually:

```
@power search(name=MushLoader <sys>)=@a execscript
```

The `@a` (ARCHITECT) bitlevel is required to allow arguments to be passed to the script.  See `wizhelp POWER EXECSCRIPT` in-game.

> **Note:** If you only want the CLI (not in-game commands), skip Steps 5a–5c.

---

## Step 6 — (Optional) Enable the HTTP API port

The RhostMUSH API port lets mush-loader send commands over HTTP instead of
opening a telnet connection.  It's faster, requires no login/logout cycle,
and works cleanly when mush-loader runs on a separate machine.

### 6a — Enable the API port in rhostmush.conf

```
api_port 2222       # any free port; must not match your telnet port
```

Restart the game after changing `rhostmush.conf`.

### 6b — Enable the MushLoader object for API access

Connect as Wizard and run the following, substituting the real dbref of
your `MushLoader <sys>` object (use `search(name=MushLoader <sys>)` to find it):

```
@api/enable #<dbref>
@api/password #<dbref>=<choose-a-strong-password>
```

If mush-loader runs on a machine other than the game server, also allow
its IP address (defaults to localhost only):

```
@api/ip #<dbref>=<your.server.ip.address>
```

Verify everything is ready:

```
@api/status #<dbref>
```

### 6c — Add API credentials to loader.conf

```bash
export API_PORT=2222
export API_DBREF=#<dbref>
export API_PASSWORD=<the-password-you-set>
```

When all three are set, mush-loader automatically uses the API port for all
installs.  Leave them unset to keep using the telnet path.

> **Note:** POST responses confirm the command was _queued_.  MUSH-level
> errors (bad syntax, insufficient permissions in softcode) are not visible
> in the HTTP response.  The telnet path catches those via output scanning;
> the API path does not.

---

## Step 7 — Test in-game

Log into your game as Wizard:

```
+mload/status
+mload/registry
```

You should see the status and registry listing.

---

## Permissions

`MushLoader <sys>` carries two locks, both set during bootstrap:

| Lock | Purpose |
|------|---------|
| Default (`@lock`) | Controls `@force` and object control |
| UseLock (`@lock/use`) | Gates all `$+mload` command triggering |

Both default to `hasflag(%#,wizard)` — any wizard passes, non-wizards are denied at the lock level before any command code runs.

To grant access to a specific additional wizard by dbref:

```
@lock search(name=MushLoader <sys>)=hasflag(%#,wizard)|#<dbref>
@lock/use search(name=MushLoader <sys>)=hasflag(%#,wizard)|#<dbref>
```
