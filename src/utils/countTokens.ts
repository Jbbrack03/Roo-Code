import { Anthropic } from "@anthropic-ai/sdk"
import * as vscode from "vscode"

import { tiktoken } from "./tiktoken"

// No longer using a worker pool for token counting

// Store extension context for later use by workers
export function setExtensionContext(_context: vscode.ExtensionContext): void {
	// no-op stub (workerpool removed)
}

// Removed CountTokensOptions type; we always use in-process counting

/**
 * Count tokens by directly invoking the tiktoken implementation.
 */
export async function countTokens(
	content: Anthropic.Messages.ContentBlockParam[],
): Promise<number> {
	// Delegate to the tiktoken-based counter with fallback
	try {
		return await tiktoken(content)
	} catch (error) {
		console.error("Token counting error in util, falling back to char estimation:", error)
		// Rough estimate: 4 chars per token
		let charCount = 0
		for (const block of content) {
			if (block.type === "text") charCount += (block.text || "").length
			else if (block.type === "image") charCount += 1000
		}
		const FUDGE = 1.5
		return Math.ceil((charCount / 4) * FUDGE)
	}
}
