#!/usr/bin/env bash
# Maestro + Android Emulator environment setup for Windows (Git Bash)
# Source this before running maestro/emulator: source scripts/maestro-env.sh
#
# Uses directory junctions to avoid non-ASCII characters in user path.
# Junctions: C:\AndroidSdk → SDK, C:\AndroidHome\.android → .android

export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.18.8-hotspot"
export ANDROID_HOME="/c/AndroidSdk"
export ANDROID_SDK_ROOT="/c/AndroidSdk"
export ANDROID_SDK_HOME="/c/AndroidHome"
export PATH="$JAVA_HOME/bin:/c/AndroidSdk/platform-tools:/c/tools/maestro/bin:$PATH"
export MAESTRO_OPTS="-Djava.io.tmpdir=C:/tools/temp"
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

echo "Maestro environment ready."
echo "  Java:     $(java -version 2>&1 | head -1)"
echo "  ADB:      $(adb version 2>&1 | head -1)"
echo "  Maestro:  $(maestro --version 2>/dev/null)"
echo "  Devices:  $(adb devices 2>&1 | grep -c 'device$') connected"
