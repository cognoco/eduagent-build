## Claude Optimization
1. Updates (UniGetUI, Store, VS Code, Claude Code)
2. Installed Command Centre
    - To start: `C:\.tools\command-centre\start.ps1`
    - Location: http://localhost:8765
    - To stop: `C:\.tools\command-centre\start.ps1 stop`
3. Claude config
    - in Claude Code Desktop (which affects CC CLI and VS Code)
        - Allowed "Auto permissions mode"  
        - Set full permissions on Notion connector
        - Removed Gmail, Google Calendar and Google Drive connectors (context bloat)
        - Deleted Github MCP server (forcing Github CLI use instead - much faster, no token usage)
        - Set full permissions on Windows (may affect how Claude can access Windows processes like other running apps - eg. emulator). Unsure about effect
        - Removed Memory and File system MCP servers (obsolete, replaced by internal Claude capabilities)
4. Installed "modern" CLI tools
    - (see below for details)
5. Updated ZDX Marketplace
    - Enabled "Meta" plugin and "Modern CLI" plugin
    - Cleaned up outdated / unused plugins
6. Claude Code native Memory handling
    - Changed to point to repo: `"autoMemoryDirectory": "C:/Dev/Projects/Products/Apps/eduagent-build/.claude/memory",`
    - Copied across all memories from global (`C:\Users\ZuzanaKopečná\.claude\projects\C--Dev-Projects-Products-Apps-eduagent-build\memory\`)
    - *** NOT DELETED AT SOURCE ***
7. Cleaned up global CLAUDE.md (`~/.claude/CLAUDE.md`)
    - Moved all Mentomate specific stuff down to local CLAUDE.md - kept only truly global settings (reduced from ~200 to 14 lines)
    - Reconciled conflicting instructions and removed duplicates.
8. *** IN PROGRESS *** Cascading guidance files from Claude.md downwards (seesion: dupes)
    - Attempting to sort rules into agent behavioral, product requirements, lessons learned/troubelshooting info, general feedback etc.
    - Establishing cross-consistency and determining obsolesence
9. General sweep - obsolete & stale (session: Stale Docs)
    - Processed all non-code/config files in the entire repo to identify obsolete documentation and leftover files, temporary stubs, etc. 
    Reviewed and decide: `docs/audit/2026-04-30-cleanup-triage.md`
    - 
10. Executed `/context-audit` - Pass 1 (session:context-audit)
    Added:
    - compaction instructions to project `CLAUDE.md`              
    - `autocompact: true` and `maxBashOutputLines` to global settings
    - `.claudeignore` with sane defaults for this Expo/NX monorepo
    Installed typescript-language-server (LSP) and installed related plugin.
11. Executed `/context-audit` - Pass 2
     - Stripped stale Bash(mv ...) permissions from settings.local.json                                       
    - Removed duplicate typescript-lsp from project settings (kept in global)                               
    - Set subagentStatusLine to surface the model each subagent is using                                     
    - Moved the lint-staged note from CLAUDE.md:58 to a code comment.
12. Commit command
    - Moved from global to `.claude/commands/my`
    - Refactored for quality and performance
13. Skill cleanup
    - Sorted personal skills in under `.claude/commands/my` (and also moved BMAD to subfolder)
    - Removed 3 duplicate skills between `commands/` and `commands/my`

### Backlog

Quote: The systematic-debugging skill warns against "each fix reveals a new symptom in a different place." That's exactly the pattern this codebase  has lived through: the 2026-04-22 post-mortem documents a 3-hour debugging spiral where each issue masked the next. That's a strong signal the architecture of the guidance/tooling itself is wrong, not just any individual fix
    

## Emulator (session: emulator-fix)
*** IN PROGRESS *** Working in separate worktree
    - "Stashing" all documentation, memories, playbooks etc. with instruction for "how" in a vault - ie. removing everything that's confusing the agent
    - Attempting to execute emulator work from scrath and potentially using the vault as "inspiration" for troubleshooting.
1. Turned off Windows Memory Integrity setting (requires reboot to take effect). Performance improvement, targeting timouts, but also other effects.
- Next steps:
    - Reboot
    - Follow up agent suggestions
    - Test agent self-starting emulator
    - Resume `emulator-fix`and
        1) retest with new mem integrity settings
        2) stresstest
        3) recreate/refactor rules/playbooks etc. from learnings (+vault)


## APPENDIX 

### Modern CLI tools
| Task | Prefer | Instead of |
|---|---|---|
| Search file contents | `rg` | `grep`, `findstr`, recursive `Select-String` |
| Find files/directories | `fd` | `find`, `dir /s`, recursive `Get-ChildItem` |
| Read code/text for humans | `bat` | `cat`, `type`, raw `Get-Content` |
| List directories | `eza` | `ls`, `dir` |
| Parse/edit JSON | `jq` | `grep`/`sed`/regex over JSON |
| Parse/edit YAML/TOML/XML | `yq` | ad hoc string parsing |
| Git diffs | `delta` | raw `git diff` when reviewing manually |
| Fuzzy selection | `fzf` | manual scanning long lists |
| Benchmark commands | `hyperfine` | hand-rolled timing loops |
| Run project commands | `just` | undocumented one-off command chains |
| GitHub operations | `gh` | browser/API hand work |
| Smart directory jumps | `zoxide` | repeated manual `cd` |