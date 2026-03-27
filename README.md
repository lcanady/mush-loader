# mush-loader

![Coverage](https://img.shields.io/badge/coverage-99.69%25%20line%20%7C%2095.71%25%20branch-brightgreen)

Safe MUSHcode loader for RhostMUSH. Load softcode via CLI or in-game commands, with optional AI vetting before anything touches your game.

## Install

```bash
git clone https://github.com/lcanady/mush-loader
cd mush-loader
npm install && npm run build
cp config/loader.conf.example config/loader.conf
# fill in your game connection details
```

## Bootstrap your game

```bash
source config/loader.conf
mush-loader bootstrap
```

Then in-game as Wizard:
```
&MLOAD_INSTALL_PATH search(name=MushLoader <sys>)=/path/to/mush-loader
```

## CLI

```bash
mush-loader load my-system.mush          # static validation + install
mush-loader load --vet my-system.mush    # AI vet first, then install
mush-loader vet my-system.mush           # vet only, no install
mush-loader registry                     # list registry packages
mush-loader install bboard@1.0.0         # fetch from registry + install
```

## In-game (Wizard only)

```
+mload <file>          load a local file
+mload/vet <file>      AI vet → queue for approval
+mload/approve         approve queued load
+mload/reject          discard queued load
+mload/registry        list registry packages
+mload/install <pkg>   fetch + install from registry
+mload/status          last logged operation
+mload/log             full load history
+mload/help [<topic>]  in-game help
```

## AI vetting

Set `AI_PROVIDER` in `loader.conf` to enable. Supports Anthropic, OpenAI, Gemini, Ollama, or any custom endpoint. Leave unset to use static validation only.

Vetted code is automatically contributed to [mush-patterns](https://github.com/lcanady/mush-patterns). Failed vets are recorded as anti-patterns.

## Docs

- [Game setup](docs/game-setup.md)
- [Usage guide](docs/usage.md)
- [AI providers](docs/ai-providers.md)
- [Contributing to the registry](docs/contributing.md)

## License

MIT
