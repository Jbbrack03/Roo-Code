// Import the initWebAssemblyLoader function
import { initWebAssemblyLoader } from './utils/wasmloader'

// Define a message type interface
interface ExtensionMessage {
  extensionContext?: any;
  type?: string;
  // Add other properties that might be in messages
}

/**
 * Handle messages received from the extension
 * @param message The message received from the extension
 */
export function handleExtensionMessage(message: ExtensionMessage): void {
  // Pass extension context to WebAssembly loader
  if (message.extensionContext) {
    console.log("Initializing WebAssembly loader with extension context")
    initWebAssemblyLoader(message.extensionContext)
  }
}

// Example of how to set up the message listener
export function initMessageListener(): void {
  window.addEventListener('message', (event) => {
    const message = event.data as ExtensionMessage;
    handleExtensionMessage(message);
  });
} 