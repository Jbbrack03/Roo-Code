// Import the WebAssembly loader utilities
import { setupGlobalWasmLoader } from './utils/wasmloader'

// Add before rendering the React app:
// Initialize WebAssembly support
// This will be picked up when the webview receives the extension context
try {
  console.log("Setting up WebAssembly loader in webview")
  setupGlobalWasmLoader()
} catch (error) {
  console.error("Failed to set up WebAssembly loader:", error)
} 