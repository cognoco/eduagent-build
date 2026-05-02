#!/usr/bin/env bash
# Launch app via ADB (clean state) and run a Maestro flow WITHOUT seeding.
#
# Use this for pre-auth flows that need to sign up a new user via Clerk
# (e.g., coppa-flow, profile-creation-consent, sign-up-flow).
#
# This is a convenience wrapper around seed-and-run.sh --no-seed.
# All ADB automation (pm clear, Metro tap, bundle load, overlay dismiss)
# is handled by seed-and-run.sh — this script just adds the --no-seed flag.
#
# Usage:
#   ./run-without-seed.sh <flow-file> [maestro-args...]
#
# Examples:
#   ./run-without-seed.sh flows/onboarding/sign-up-flow.yaml
#   ./run-without-seed.sh flows/edge/animated-splash.yaml --debug-output

exec "$(dirname "$0")/seed-and-run.sh" --no-seed "$@"
