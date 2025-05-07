#!/usr/bin/env bash

# A script to apply the full Roo-Code patch, rebuild, and reinstall the VSIX
set -e

PATCH_FILE="roo-code-full-fix.patch"
if [ ! -f "$PATCH_FILE" ]; then
    echo "Error: Patch file not found: $PATCH_FILE"
    exit 1
fi

echo "Applying patch: $PATCH_FILE"
# Apply the patch to the source
git apply --whitespace=fix "$PATCH_FILE"

echo "Installing dependencies and building extension..."
npm install
npm run build

# Locate the generated VSIX
VSIX_PATH=$(ls bin/roo-cline-*.vsix | tail -n1)
if [ -z "$VSIX_PATH" ]; then
    echo "Error: VSIX file not found in bin/"
    exit 1
fi

echo "Installing VSIX: $VSIX_PATH"
if command -v code >/dev/null 2>&1; then
    code --install-extension "$VSIX_PATH" --force
    echo "✔ Extension installed: $VSIX_PATH"
else
    echo "⚠ VS Code CLI 'code' not found. Please install manually: $VSIX_PATH"
fi

echo "✔ Patch applied and extension updated. Please restart VS Code." 