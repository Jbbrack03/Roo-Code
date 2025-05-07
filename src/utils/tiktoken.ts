import { Anthropic } from "@anthropic-ai/sdk"
import path from "path"
import * as fs from "fs"
// Import vscode as a type only to avoid linting errors
// eslint-disable-next-line @typescript-eslint/naming-convention
import type * as _vscode from "vscode"

// Dynamically import tiktoken with proper error handling
let tiktokenModule: any = null
let encoder: any = null
let extensionPath: string | null = null

// Store extension path for WASM loading
export function setTiktokenExtensionPath(extPath: string): void {
	extensionPath = extPath
	console.log(`Tiktoken extension path set to: ${extPath}`)
}

const TOKEN_FUDGE_FACTOR = 1.0

// Define types is prefixed with underscore to indicate it's not used directly
// but needed for documentation
// eslint-disable-next-line @typescript-eslint/naming-convention
type _WebAssemblyInstantiateFn = typeof WebAssembly.instantiate;

// Load the tiktoken module with proper WebAssembly handling
async function loadTiktokenModule() {
	if (tiktokenModule) return tiktokenModule
	
	try {
		// Check if WASM file exists in extension path
		const wasmPath = extensionPath ? path.join(extensionPath, "dist", "tiktoken_bg.wasm") : null
		
		if (wasmPath) {
			const exists = fs.existsSync(wasmPath)
			console.log(`Checking tiktoken_bg.wasm (utils): ${wasmPath} - ${exists ? "Exists" : "Not found"}`)
			
			if (exists) {
				// Set environment variable for tiktoken to find the WASM file
				process.env.TIKTOKEN_WASM_PATH = wasmPath
				console.log(`Set TIKTOKEN_WASM_PATH in utils to: ${process.env.TIKTOKEN_WASM_PATH}`)
				
				// Verify file permissions and size for debugging
				try {
					const stats = fs.statSync(wasmPath)
					console.log(`WASM file size: ${stats.size} bytes, permissions: ${stats.mode.toString(8)}`)
					
					// Ensure file has proper read permissions
					if (stats.mode & 0o400) {
						console.log('WASM file has proper read permissions')
					} else {
						console.warn('WASM file may not have proper read permissions')
						// Try to fix permissions
						fs.chmodSync(wasmPath, 0o644)
					}
				} catch (statsErr) {
					console.error(`Error checking WASM file stats: ${statsErr}`)
				}
			} else {
				console.error(`Error: tiktoken_bg.wasm not found at ${wasmPath}`)
			}
		} else {
			console.warn("No extension path provided for tiktoken WASM file")
		}
		
		// Override WebAssembly.instantiate to handle missing file errors
		const originalInstantiate = WebAssembly.instantiate;
		
		// Use type assertion to bypass the strict typing issue
		// @ts-ignore - Using type assertion to avoid complex WebAssembly type issues
		WebAssembly.instantiate = function(
			bufferSource: BufferSource | WebAssembly.Module, 
			importObject?: WebAssembly.Imports
		) {
			// Handle ArrayBuffer case
			if (bufferSource instanceof ArrayBuffer && extensionPath) {
				try {
					// Try to load WASM file from extension directory if not found
					const wasmFile = path.join(extensionPath, "dist", "tiktoken_bg.wasm")
					console.log(`Attempting to load WASM from ${wasmFile} in WebAssembly.instantiate override`)
					
					if (fs.existsSync(wasmFile)) {
						const wasmBuffer = fs.readFileSync(wasmFile)
						console.log(`Successfully loaded tiktoken_bg.wasm, size: ${wasmBuffer.length} bytes`)
						return originalInstantiate(wasmBuffer, importObject)
					} else {
						console.error(`Failed to find tiktoken_bg.wasm at ${wasmFile}`)
					}
				} catch (e) {
					console.error("Failed to load tiktoken WASM from extension path:", e)
				}
			}
			
			// Pass through to original implementation
			return originalInstantiate(bufferSource, importObject)
		};
		
		// Now try to import tiktoken
		console.log('Attempting to import tiktoken module')
		tiktokenModule = await import("tiktoken/lite")
		console.log('Successfully imported tiktoken/lite')
		
		const o200kBase = await import("tiktoken/encoders/o200k_base")
		console.log('Successfully imported tiktoken encoder')
		
		// Create encoder if not already created
		if (!encoder) {
			const { Tiktoken } = tiktokenModule
			encoder = new Tiktoken(o200kBase.default.bpe_ranks, o200kBase.default.special_tokens, o200kBase.default.pat_str)
			console.log('Successfully created tiktoken encoder')
		}
		
		return tiktokenModule
	} catch (error) {
		console.error("Error loading tiktoken:", error)
		throw error
	}
}

export async function tiktoken(content: Anthropic.Messages.ContentBlockParam[]): Promise<number> {
	if (content.length === 0) {
		return 0
	}

	let totalTokens = 0

	try {
		// Try to load the tiktoken module and encoder
		await loadTiktokenModule()

		// Process each content block using the cached encoder.
		for (const block of content) {
			if (block.type === "text") {
				const text = block.text || ""

				if (text.length > 0) {
					const tokens = encoder.encode(text)
					// Debug: log token count per text block
					console.log(`Tiktoken debug: text block snippet="${text.substring(0,80).replace(/\n/g,' ')}..." tokens=${tokens.length}`)
					totalTokens += tokens.length
				}
			} else if (block.type === "image") {
				// For images, calculate based on data size.
				const imageSource = block.source

				if (imageSource && typeof imageSource === "object" && "data" in imageSource) {
					const base64Data = imageSource.data as string
					totalTokens += Math.ceil(Math.sqrt(base64Data.length))
				} else {
					totalTokens += 300 // Conservative estimate for unknown images
				}
			}
		}
	} catch (error) {
		console.error("Token counting error:", error)
		// Return a rough estimate based on character count if encoder fails
		let charCount = 0
		for (const block of content) {
			if (block.type === "text") {
				charCount += (block.text || "").length
			} else if (block.type === "image") {
				charCount += 1000 // Rough estimate for images
			}
		}
		// Very rough approximation: ~4 chars per token on average
		totalTokens = Math.ceil(charCount / 4)
	}

	// Add a fudge factor to account for the fact that tiktoken is not always
	// accurate.
	return Math.ceil(totalTokens * TOKEN_FUDGE_FACTOR)
}
