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
mush-loader registry
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

## Step 4 — Set the install path on the game object

Connect to your game as Wizard and run:

```
&MLOAD_INSTALL_PATH search(name=MushLoader <sys>)=/opt/mush-loader
```

This tells the in-game commands where to find the mush-loader CLI.

---

## Step 5 — Enable execscript (for in-game commands)

In-game commands use `execscript()` to call the mush-loader CLI. This requires execscript to be enabled for your Wizard character in `rhostmush.conf`:

```
# rhostmush.conf
execscript_allowed yes
execscript_wiz_only yes
```

Restart the game after changing `rhostmush.conf`.

> **Note:** If you only want to use the CLI (not in-game commands), execscript is not required.

---

## Step 6 — Test in-game

Log into your game as Wizard:

```
+mload/status
+mload/registry
```

You should see the status and registry listing.

---

## Permissions

The `MushLoader <sys>` object is locked to its owner (your Wizard character). Only the owning Wizard can run `+mload` commands. To grant access to another Wizard:

```
@lock search(name=MushLoader <sys>)=#<dbref1>|#<dbref2>
```
