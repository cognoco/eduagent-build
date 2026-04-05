#!/usr/bin/env bash
# Maestro + Android Emulator environment setup for Windows (Git Bash)
# Source this before running maestro/emulator: source scripts/maestro-env.sh
#
# Uses directory junctions to avoid non-ASCII characters in user path.
# Junctions: C:\AndroidSdk → SDK, C:\AndroidHome\.android → .android

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export ANDROID_SDK_HOME="${ANDROID_SDK_HOME:-$HOME/.android}"
export MAESTRO_HOME="${MAESTRO_HOME:-$HOME/.maestro}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$MAESTRO_HOME/bin:$PATH"
export MAESTRO_OPTS="${MAESTRO_OPTS:--Djava.io.tmpdir=/tmp}"
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

echo "Maestro environment ready."
echo "  Java:     $(java -version 2>&1 | head -1)"
echo "  ADB:      $(adb version 2>&1 | head -1)"
echo "  Maestro:  $(maestro --version 2>/dev/null)"
echo "  Devices:  $(adb devices 2>&1 | grep -c 'device$') connected"
