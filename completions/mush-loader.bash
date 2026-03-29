# bash completion for mush-loader
# Source this file or place it in /etc/bash_completion.d/mush-loader

_mush_loader() {
  local cur prev words cword
  _init_completion || return

  local commands="load vet init registry search info install update history status bootstrap"

  case "$prev" in
    mush-loader)
      COMPREPLY=( $(compgen -W "$commands --help -h" -- "$cur") )
      return
      ;;
    load|vet)
      # Complete .mush files and flags
      case "$cur" in
        -*)
          local flags="--vet --dry-run"
          COMPREPLY=( $(compgen -W "$flags" -- "$cur") )
          ;;
        *)
          COMPREPLY=( $(compgen -f -X '!*.mush' -- "$cur") )
          compopt -o filenames
          ;;
      esac
      return
      ;;
    init)
      # No useful completion for new package name
      return
      ;;
    search)
      # Free-form query — no completions
      return
      ;;
    info|install|update)
      # Could complete from registry cache; not implemented
      return
      ;;
    history)
      case "$cur" in
        -*)
          COMPREPLY=( $(compgen -W "--limit --host --json" -- "$cur") )
          ;;
      esac
      return
      ;;
    --limit|--host)
      # Argument values — no completion
      return
      ;;
    status|bootstrap|registry)
      # No args
      return
      ;;
  esac

  # Multi-word: handle flags mid-command
  case "${words[1]}" in
    load)
      case "$cur" in
        -*)
          COMPREPLY=( $(compgen -W "--vet --dry-run" -- "$cur") )
          ;;
        *)
          COMPREPLY=( $(compgen -f -X '!*.mush' -- "$cur") )
          compopt -o filenames
          ;;
      esac
      ;;
    history)
      case "$cur" in
        -*)
          COMPREPLY=( $(compgen -W "--limit --host --json" -- "$cur") )
          ;;
      esac
      ;;
  esac
}

complete -F _mush_loader mush-loader
