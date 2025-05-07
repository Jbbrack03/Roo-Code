# Cursor Rules

## VS Code Extension WebAssembly Patterns
When working with WebAssembly in VS Code extensions, follow these important patterns:

1. **Extension Context Path**: Always pass the extension context to code that needs to load WebAssembly files. The key piece is `context.extensionUri.fsPath` which provides the absolute path to the extension.

2. **Security Model Awareness**: VS Code restricts where extensions can load files from. Always use the extension path to load WebAssembly files rather than expecting them to load from relative paths.

3. **Worker Communication**: When using worker pools, pass the extension path via worker options like:
   ```typescript
   const options = {
     workerOptions: { 
       extensionPath: extensionContext?.extensionUri.fsPath 
     }
   };
   ```

4. **File Permissions**: Always ensure WebAssembly files have proper permissions after copying. Use `fs.chmodSync(wasmDest, 0o644)` after copying files to ensure they're readable.

5. **Error Fallbacks**: Implement fallback mechanisms when WebAssembly files fail to load, such as approximation algorithms that don't rely on the binary modules.

6. **Webview Loading**: For webviews, use the VS Code API to read files from the extension via the URI API:
   ```typescript
   const wasmUri = vscode.Uri.joinPath(extensionContext.extensionUri, "dist", fileName);
   const wasmBinary = await vscode.workspace.fs.readFile(wasmUri);
   ```

7. **WebAssembly.instantiate Overrides**: When needed, create proper typed overrides for WebAssembly.instantiate that handle both module and buffer source cases.

## LM Studio Integration
1. **Context Window Tracking**: When working with the LM Studio API, we need token counting to accurately track context window usage.

2. **Generator Events**: The context window should be updated during generation, not just at the beginning.

3. **Error Resilience**: Always implement fallbacks when token counting fails.

## Project Patterns
1. **Extension Activation**: Important initialization happens in extension.ts, including setting up WebAssembly paths.

2. **Build Process**: WebAssembly files are copied during the build process in esbuild.js.

3. **Error Handling**: Always log errors but avoid breaking user experience when non-critical features like token counting fail. 