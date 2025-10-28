---
Created: 2025-10-16T19:01
Modified: 2025-10-17T15:56
---
# NX Monorepo Template Setup

- [X] Create NX monorepo (w/Next.JS project)
- [X] Connect NX Cloud
- [X] Switch CC config from /alternative to /nx-monorepo
- [X] Configure Claude Code in Github
- [X] Configure Claude Code plugins
    - Core MCP servers
    - NX MCP
    - TestSprite
- [x] Configure Dependabot
- [x] Configure Cursor BugBot
- [X] Install & configure Ruler
- [X] Configure CodeRabbit to not trigger wildly during PoC build
- [ ] Merge in stack discussion from
- [ ] Merge in AgentOS
- [P] Create scaffolding plan
- [ ] Create PoC PRD
- [ ] Create PoC Plan


# APPENDICES

## NX Workspace Creation Log
npx create-nx-workspace@latest

 NX   Let's create a new workspace [https://nx.dev/getting-started/intro]

√ Where would you like to create your workspace? · nx-monorepo
√ Which stack do you want to use? · react
√ What framework would you like to use? · nextjs
√ Application name · web
√ Would you like to use the App Router (recommended)? · Yes
√ Would you like to use the src/ directory? · Yes
√ Which unit test runner would you like to use? · jest
√ Test runner to use for end to end (E2E) tests · playwright
√ Default stylesheet format · tailwind
√ Would you like to use ESLint? · Yes
√ Would you like to use Prettier for code formatting? · Yes
√ Which AI agents would you like to set up? (space to select, enter to confirm) · No items were selected
√ Which CI provider would you like to use? · github

 NX   Creating your v21.6.5 workspace.

✔ Installing dependencies with npm
✔ Successfully created the workspace: nx-monorepo
✔ Nx Cloud has been set up successfully
✔ CI workflow has been generated successfully
√ Would you like to push this workspace to Github? · Yes
√ Repository name (format: username/repo-name): · cognoco/nx-monorepo
✓ Created repository cognoco/nx-monorepo on github.com
  https://github.com/cognoco/nx-monorepo
✓ Added remote https://github.com/cognoco/nx-monorepo.git
Enumerating objects: 56, done.
Counting objects: 100% (56/56), done.
Delta compression using up to 12 threads
Compressing objects: 100% (47/47), done.
Writing objects: 100% (56/56), 224.17 KiB | 7.47 MiB/s, done.
Total 56 (delta 0), reused 0 (delta 0), pack-reused 0 (from 0)
To https://github.com/cognoco/nx-monorepo.git
 * [new branch]      HEAD -> main
branch 'main' set up to track 'origin/main'.
✓ Pushed commits to https://github.com/cognoco/nx-monorepo.git

 NX   Successfully pushed to GitHub repository: https://github.com/cognoco/nx-monorepo

 NX   Your CI setup is almost complete.

Go to Nx Cloud and finish the setup: https://cloud.nx.app/connect/DoQjNt9dTD

