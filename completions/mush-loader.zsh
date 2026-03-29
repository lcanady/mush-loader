#compdef mush-loader
# zsh completion for mush-loader
# Place in a directory on $fpath, e.g. /usr/local/share/zsh/site-functions/_mush-loader

_mush-loader() {
  local state

  _arguments \
    '1: :->command' \
    '*: :->args' \
    && return 0

  case "$state" in
    command)
      local commands
      commands=(
        'load:Validate and install a .mush file'
        'vet:Vet a .mush file without installing it'
        'init:Scaffold a new .mush file and test stub'
        'registry:List all registry packages'
        'search:Search registry by name, tag, or description'
        'info:Show details for a registry package'
        'install:Fetch and install a registry package'
        'update:Diff and re-install a registry package'
        'history:Show local install history'
        'status:Check connectivity to the game server'
        'bootstrap:Install the in-game +mload command object'
      )
      _describe 'command' commands
      ;;

    args)
      case "$words[2]" in
        load)
          _arguments \
            '--vet[Run AI vetting before loading]' \
            '--dry-run[Print commands without connecting]' \
            '*:mush file:_files -g "*.mush"'
          ;;
        vet)
          _arguments \
            '*:mush file:_files -g "*.mush"'
          ;;
        init)
          _arguments \
            ':package name:'
          ;;
        search)
          _arguments \
            '*:search query:'
          ;;
        info|install|update)
          _arguments \
            ':package[@version]:'
          ;;
        history)
          _arguments \
            '--limit[Maximum entries to show]:count:' \
            '--host[Filter by game host]:host:' \
            '--json[Output raw JSON]'
          ;;
        status|bootstrap|registry)
          # No arguments
          ;;
      esac
      ;;
  esac
}

_mush-loader "$@"
