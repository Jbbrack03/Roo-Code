/**
 * Utility for loading and managing WebAssembly modules in VS Code extensions
 */

import * as vscode from "vscode"

// Define WebAssembly instantiate function type - using a more flexible type
// eslint-disable-next-line @typescript-eslint/naming-convention
type _WebAssemblyInstantiateFn = typeof WebAssembly.instantiate;

let extensionContext: vscode.ExtensionContext | null = null

/**
 * Initialize the WebAssembly loader with the extension context
 * @param context The VS Code extension context
 */
export function initWebAssemblyLoader(context: vscode.ExtensionContext): void {
    extensionContext = context
}

/**
 * Load a WebAssembly file from the extension directory
 * @param fileName The name of the WebAssembly file to load
 * @returns A promise that resolves to the WebAssembly module
 */
export async function loadWasmFromExtension(fileName: string): Promise<WebAssembly.Module> {
    if (!extensionContext) {
        throw new Error("WebAssembly loader not initialized with extension context")
    }
    
    // Determine the path to the WebAssembly file
    const wasmUri = vscode.Uri.joinPath(extensionContext.extensionUri, "dist", fileName)
    
    try {
        // Read the WebAssembly file from the extension directory
        const wasmBinary = await vscode.workspace.fs.readFile(wasmUri)
        
        // Compile the WebAssembly module
        return await WebAssembly.compile(wasmBinary)
    } catch (error) {
        console.error(`Error loading WebAssembly file ${fileName}:`, error)
        throw new Error(`Failed to load WebAssembly file ${fileName}: ${error}`)
    }
}

/**
 * Instantiate a WebAssembly module with the given imports
 * @param module The WebAssembly module to instantiate
 * @param imports The imports to provide to the module
 * @returns A promise that resolves to the WebAssembly instance
 */
export async function instantiateWasm(
    module: WebAssembly.Module, 
    imports?: WebAssembly.Imports
): Promise<WebAssembly.Instance> {
    try {
        // Instantiate the WebAssembly module
        return await WebAssembly.instantiate(module, imports || {})
    } catch (error) {
        console.error("Error instantiating WebAssembly module:", error)
        throw new Error(`Failed to instantiate WebAssembly module: ${error}`)
    }
}

/**
 * Helper function to create a memory buffer for a WebAssembly module
 * @param initialPages Initial number of memory pages (64KB each)
 * @param maximumPages Maximum number of memory pages
 * @param shared Whether the memory should be shared
 * @returns A WebAssembly.Memory object
 */
export function createWasmMemory(
    initialPages: number = 16,
    maximumPages?: number,
    shared: boolean = false
): WebAssembly.Memory {
    const memoryDescriptor: WebAssembly.MemoryDescriptor = {
        initial: initialPages,
        maximum: maximumPages,
        shared: shared,
    }
    
    return new WebAssembly.Memory(memoryDescriptor)
}

/**
 * Set up WebAssembly in the global scope to handle module loading
 * This is particularly useful for libraries that try to load their own WebAssembly files
 */
export function setupGlobalWasmLoader(): void {
    if (!extensionContext) {
        console.warn("Cannot set up global WebAssembly loader without extension context")
        return
    }
    
    // Store the original instantiate function
    const originalInstantiate = WebAssembly.instantiate
    
    // Override the instantiate function to handle file loading
    // @ts-ignore - Bypassing complex WebAssembly typing issues
    WebAssembly.instantiate = async function(
        bufferSource: BufferSource | WebAssembly.Module,
        importObject?: WebAssembly.Imports
    ) {
        try {
            // Call the original instantiate
            return await originalInstantiate(bufferSource, importObject)
        } catch (error) {
            // If there was an error and it might be related to a missing file
            if (error instanceof Error && error.message.includes("Missing") && error.message.includes(".wasm")) {
                const match = error.message.match(/Missing\s+([^:\s]+\.wasm)/)
                if (match && match[1]) {
                    const wasmFileName = match[1]
                    console.log(`Attempting to load missing WebAssembly file: ${wasmFileName}`)
                    
                    try {
                        // Try to load the WebAssembly file from the extension
                        const wasmModule = await loadWasmFromExtension(wasmFileName)
                        if (importObject) {
                            return await originalInstantiate(wasmModule, importObject)
                        } else {
                            // Create a new instance
                            return await originalInstantiate(wasmModule, {})
                        }
                    } catch (loadError) {
                        console.error(`Failed to load ${wasmFileName} from extension:`, loadError)
                    }
                }
            }
            
            // Rethrow the original error if we can't handle it
            throw error
        }
    }
} 