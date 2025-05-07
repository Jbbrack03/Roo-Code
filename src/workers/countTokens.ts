import workerpool from "workerpool"
import * as path from "path"
import * as fs from "fs"
import { Anthropic } from "@anthropic-ai/sdk"

import { tiktoken } from "../utils/tiktoken"

import { type CountTokensResult } from "./types"

// Define types for overriding WebAssembly.instantiate
// eslint-disable-next-line @typescript-eslint/naming-convention
type _WebAssemblyInstantiateFn = typeof WebAssembly.instantiate;

// Store extension path from worker initialization
let extensionPath: string | undefined
workerpool.worker({
	countTokens: async function(content: Anthropic.Messages.ContentBlockParam[]): Promise<CountTokensResult> {
		try {
			// Use path from worker options if available
			extensionPath = (workerpool.workerEmit as any)?.options?.extensionPath

			// Log extension path for debugging
			if (extensionPath) {
				console.log(`Worker received extension path: ${extensionPath}`)
			} else {
				console.warn("Extension path not provided to worker")
			}

			// Check if the WASM file exists before attempting to load it
			if (extensionPath) {
				const wasmPath = path.join(extensionPath, "dist", "tiktoken_bg.wasm")
				const exists = fs.existsSync(wasmPath)
				console.log(`Checking tiktoken_bg.wasm at ${wasmPath}: ${exists ? "Found" : "Not found"}`)
				
				if (exists) {
					// Set environment variable for tiktoken to find the wasm file
					process.env.TIKTOKEN_WASM_PATH = wasmPath
				} else {
					throw new Error(`tiktoken_bg.wasm not found at expected path: ${wasmPath}`)
				}
			}

			// Intercept WebAssembly.instantiate to handle custom path resolution
			const originalInstantiate = WebAssembly.instantiate
			
			// Use @ts-ignore to bypass strict type checking issues
			// @ts-ignore - Bypassing complex WebAssembly typing issues
			WebAssembly.instantiate = function(
				bufferSource: BufferSource | WebAssembly.Module,
				importObject?: WebAssembly.Imports
			) {
				// Check if the error is related to missing wasm file
				const stackTrace = new Error().stack || ""
				if (stackTrace.includes("tiktoken") && extensionPath) {
					console.log("Intercepting WebAssembly.instantiate for tiktoken")
					
					// Try to load WASM file from extension directory if not found
					const wasmFile = path.join(extensionPath, "dist", "tiktoken_bg.wasm")
					if (fs.existsSync(wasmFile)) {
						try {
							const wasmBuffer = fs.readFileSync(wasmFile)
							console.log(`Successfully loaded tiktoken_bg.wasm from ${wasmFile}, size: ${wasmBuffer.length} bytes`)
							return originalInstantiate(wasmBuffer, importObject)
						} catch (e) {
							console.error(`Error reading tiktoken_bg.wasm: ${e}`)
						}
					} else {
						console.error(`tiktoken_bg.wasm not found at ${wasmFile}`)
					}
				}
				
				// Return the original instantiate call
				return originalInstantiate(bufferSource, importObject)
			}

			// Custom require function to intercept tiktoken loading
			const originalRequire = require
			// @ts-ignore
			global.require = function(id: string) {
				if (id === "tiktoken" && extensionPath) {
					// Set an environment variable for tiktoken to find the wasm file
					process.env.TIKTOKEN_WASM_PATH = path.join(extensionPath, "dist", "tiktoken_bg.wasm")
					console.log(`Set TIKTOKEN_WASM_PATH to ${process.env.TIKTOKEN_WASM_PATH}`)
				}
				return originalRequire(id)
			}

			const count = await tiktoken(content)
			return { success: true, count }
		} catch (error) {
			console.error(`Error counting tokens: ${error}`)
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			}
		}
	}
});
