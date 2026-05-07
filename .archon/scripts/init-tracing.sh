#!/usr/bin/env bash
set -euo pipefail

# Argument: optional PR identifier (e.g. "PR-16")
pr_arg="${1:-}"

run_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"

cwd="$(pwd)"

archon_repo="$(basename "$(dirname "$(dirname "$(dirname "$cwd")")")")"

task_dir="$(basename "$cwd")"
if [[ "$task_dir" =~ ^task-(.+)-[0-9]{10,}$ ]]; then
    archon_workflow="${BASH_REMATCH[1]}"
else
    archon_workflow="unknown-workflow"
fi

env_label="archon-${archon_workflow}"

mkdir -p .claude
jq -n --arg env "$env_label" '{"env":{"LOGFIRE_ENVIRONMENT":$env}}' > .claude/settings.json

if [[ -n "$pr_arg" ]]; then
    jq -n \
        --arg rid "$run_id" \
        --arg wf "$archon_workflow" \
        --arg repo "$archon_repo" \
        --arg pr "$pr_arg" \
        '{"archon.run_id":$rid,"archon.workflow":$wf,"archon.repo":$repo,"archon.pr":$pr}' \
        > .claude/logfire-resource-attributes.json
else
    jq -n \
        --arg rid "$run_id" \
        --arg wf "$archon_workflow" \
        --arg repo "$archon_repo" \
        '{"archon.run_id":$rid,"archon.workflow":$wf,"archon.repo":$repo}' \
        > .claude/logfire-resource-attributes.json
fi

mkdir -p .codex
printf '[otel]\nenvironment = "%s"\n' "$env_label" > .codex/config.toml

echo "archon.run_id=${run_id}"
echo "archon.workflow=${archon_workflow}"
echo "environment=${env_label}"
echo "wrote: ${cwd}/.claude/settings.json"
echo "wrote: ${cwd}/.claude/logfire-resource-attributes.json"
echo "wrote: ${cwd}/.codex/config.toml"
