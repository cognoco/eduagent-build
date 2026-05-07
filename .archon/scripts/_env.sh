# shellcheck shell=bash
# Defensive PATH preamble for .archon/scripts/*.sh.
#
# Why this exists: Archon runs bash nodes via `bash -c` (non-interactive),
# so ~/.zshrc / ~/.bash_profile are NOT sourced and PATH only contains what
# Archon's parent process inherited. User-installed tools like pnpm and gh
# may not be on that PATH.
#
# Each script in .archon/scripts/ should source this file at the top:
#
#     source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"
#
# We prepend common pnpm / Node / Homebrew install dirs to PATH if they
# exist on disk and aren't already on PATH. This handles standard
# layouts on macOS and Linux without hardcoding any user's home dir.
#
# If pnpm is in a non-standard location, set PNPM_HOME before launching
# Archon and this script will honor it.

for _archon_env_dir in \
    "${PNPM_HOME:-$HOME/Library/pnpm}" \
    "$HOME/.local/share/pnpm" \
    /opt/homebrew/bin /opt/homebrew/sbin \
    /usr/local/bin \
    "$HOME/.local/bin" \
    "$HOME/.npm-global/bin"; do
    if [[ -d "$_archon_env_dir" && ":$PATH:" != *":$_archon_env_dir:"* ]]; then
        PATH="$_archon_env_dir:$PATH"
    fi
done
unset _archon_env_dir
export PATH
