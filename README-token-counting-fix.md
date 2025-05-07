# Roo-Code Extension: LM Studio Context Window & Token UI Enhancements

## Overview
This document describes the full set of changes made to the Roo-Code VS Code extension (version 3.15.6) to:

1. Retrieve and expose LM Studio model `contextWindow` via its REST API `/v1/models/{model}`, addressing the fact that its OpenAI-compatible provider did not supply this information to Roo-Code.
2. Improve token counting accuracy and the context window progress bar UI.

By following these steps, other developers can reproduce the fix in their own installations or extension builds.

## Problem Statement
- **Missing LM Studio Context Window**: Roo-Code originally did not retrieve nor expose the `contextWindow` parameter from LM Studio models, preventing the UI from accurately representing how many tokens remain or are used.
- **OpenAI vs LM Studio Context Info**: Roo-Code's OpenAI provider includes `context_window` information directly, but LM Studio's OpenAI-compatible API did not supply the `contextWindow` parameter to `api.getModel()`, so the extension was unaware of the true context limit.
- **Explicit LM Studio REST API Fetch**: We now issue a REST API call to LM Studio's `/v1/models/{model}` endpoint to retrieve and expose the `contextWindow` property for LM Studio models.
- **Token Counting Inaccuracies**: The extension's token counter included non-chat content (JSON, XML, commit hashes), inflating token usage and misrepresenting the actual context load.

---

## 1. LM Studio Context Window Integration

### Background
LM Studio models provide a `contextWindow` property indicating the maximum number of tokens they support. Without this value, Roo-Code cannot display an accurate progress bar or enforce limits.

### Key Changes
1. **Async/Synchronous Model Fetch** (`ClineProvider.ts`)
   - Unified handling of `api.getModel()` calls that may return either a value or a promise.
   - Extracted `contextWindow` from `model.info` and stored in `lmStudioModelInfo`.
2. **Explicit REST API Model Info Fetch** (`ClineProvider.ts`)
   - Fetched the `contextWindow` from LM Studio's REST API `/v1/models/{model}` endpoint when `api.getModel()` did not include it.
3. **Extension WASM Initialization** (`extension.ts`)
   - Early-set `TIKTOKEN_WASM_PATH` so `tiktoken/lite` can load its WebAssembly module.
   - Verified `ensureWasmFilesExist` uses the correct package name.
4. **Extension State Updates**
   - Extended the shared `ExtensionState` interface to include:
     - `contextWindow` (number)
     - `lmStudioModelInfo` (object)
   - Wired these values into `ExtensionStateContext.tsx` for consumption in the webview.
5. **Webview UI Propagation**
   - In `TaskHeader.tsx`, passed an `onlyCurrent` flag when `apiProvider === 'lmstudio'`.
   - Updated `ContextWindowProgress.tsx` to consume `contextWindow` and `contextTokens` and render only the "used" slice for LM Studio models.
   - Replaced `path.basename` calls in `context-mentions.ts` with a split-based fallback to ensure compatibility with Vite builds.

---

## 2. Token Counting & Progress Bar Fixes

### Background
Counting every block of content (including JSON/XML and commit hashes) led to inflated token usage and a misleading three-segment progress bar.

### Key Changes
1. **Accurate Token Counting** (`src/utils/countTokens.ts`)
   - Switched to direct import of `tiktoken/lite` (fudge factor = 1.0).
   - Added per-block debug logs to trace input text and resulting token counts.
2. **Filtering Non-Chat Content** (`ClineProvider.ts`)
   - Swapped `currentCline.apiConversationHistory` for `currentCline.clineMessages`.
   - Filtered messages by type (`ask`/`say`) and trimmed out:
     - Empty strings
     - Strings starting with "{" or "<" (JSON/XML)
     - Hexadecimal commit hashes (7+ characters)
   - Logged counts at each stage (`raw`, `filtered`, `computed`).
3. **UI Progress Bar Refinement** (`ContextWindowProgress.tsx`)
   - Introduced an `onlyCurrent` mode for LM Studio models that draws a single bar representing used tokens vs. the full context window.
   - Displayed numeric values (`used / total`) alongside the bar for clarity.
   - Ensured consistent styling and accessibility attributes.

---

## Files Included
- **roo-code-full-fix.patch**: Unified diff covering LM Studio context window integration, token counting filters, UI enhancements, and related fixes.
- **apply-roo-full-fix.sh**: Shell script that:
  - Applies `roo-code-full-fix.patch` to the source
  - Installs dependencies and builds the extension
  - Locates and installs the new VSIX via VS Code CLI

---

## Installation & Patch Application

### Automated (Recommended)
1. Copy `roo-code-full-fix.patch` and `apply-roo-full-fix.sh` to your project root (where `package.json` lives).
2. Make the script executable:
   ```bash
   chmod +x apply-roo-full-fix.sh
   ```
3. Run the script:
   ```bash
   ./apply-roo-full-fix.sh
   ```
4. Restart VS Code to load the updated extension.

### Manual
1. Apply the patch:
   ```bash
   patch -p1 < roo-code-full-fix.patch
   ```
2. Install dependencies and build the extension:
   ```bash
   npm install
   npm run build
   ```
3. Install the generated VSIX:
   ```bash
   code --install-extension bin/roo-cline-*.vsix --force
   ```
4. Restart VS Code to activate the changes.

---

## Verification
1. Trigger a chat exchange and watch the debug console:
   - Should log only chat turns and filtered blocks.
   - Token counts should match expectations for "real" dialogue.
2. Observe the progress bar in task headers:
   - LM Studio models show a single bar with a numeric fraction (`used/total`).
   - Other models continue to use the three-segment display.

---

## Troubleshooting & Reversion
- **Patch fails to apply**:
  - Verify you're in project root and version number matches.
  - Check file permissions.
- **Revert to original**:
  ```bash
  mv src/core/webview/ClineProvider.ts.bak src/core/webview/ClineProvider.ts
  npm run build
  ```
- **UI not updating**:
  - Fully reload VS Code (Developer: Reload Window).

---

## Notes
- This patch is specific to version 3.15.6 of Roo-Code.
- Always keep a backup before patching.
- Feel free to adjust the filtering regex or UI styling as project needs evolve.

---

For questions or further improvements, refer to the comments in the patch files or reach out to the extension maintainers. 