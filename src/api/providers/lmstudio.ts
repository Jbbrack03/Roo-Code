import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"
import axios from "axios"

import { SingleCompletionHandler } from "../"
import { ApiHandlerOptions, ModelInfo, openAiModelInfoSaneDefaults } from "../../shared/api"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"

const LMSTUDIO_DEFAULT_TEMPERATURE = 0

// Cache for model metadata to reduce API calls
const modelMetadataCache = new Map<string, {info: ModelInfo, timestamp: number}>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Fetches detailed model information from LM Studio's native REST API
 * @param baseUrl The base URL for LM Studio server
 * @param modelId The ID of the model to fetch information for
 * @returns ModelInfo object with context window size or null if retrieval failed
 */
export async function getLmStudioModelInfo(baseUrl: string, modelId: string): Promise<ModelInfo | null> {
	try {
		// Validate URL
		if (!URL.canParse(baseUrl)) {
			console.warn("Invalid LM Studio base URL")
			return null
		}
		
		// Format the REST API URL properly
		const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
		const apiUrl = `${normalizedBaseUrl}/api/v0/models/${encodeURIComponent(modelId)}`
		
		// Make the request
		const response = await axios.get(apiUrl, { timeout: 5000 })
		
		// Map the response to ModelInfo
		if (response.data && typeof response.data.max_context_length === 'number') {
			return {
				contextWindow: response.data.max_context_length,
				// Required fields from ModelInfo interface
				supportsPromptCache: false,
				// Other optional fields
				maxTokens: -1,
				supportsImages: false,
				inputPrice: 0,
				outputPrice: 0,
			}
		}
		
		console.warn("LM Studio model info missing max_context_length:", response.data)
		return null
	} catch (error) {
		console.warn("Failed to fetch LM Studio model info:", error)
		return null
	}
}

/**
 * Gets model info with caching to reduce API calls
 * @param baseUrl The base URL for LM Studio server
 * @param modelId The ID of the model to fetch information for
 * @returns ModelInfo object with context window size or null if retrieval failed
 */
async function getCachedModelInfo(baseUrl: string, modelId: string): Promise<ModelInfo | null> {
	const cacheKey = `${baseUrl}:${modelId}`
	const cached = modelMetadataCache.get(cacheKey)
	
	// Return cached value if valid
	if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
		return cached.info
	}
	
	// Fetch new data
	const info = await getLmStudioModelInfo(baseUrl, modelId)
	
	// Update cache if successful
	if (info) {
		modelMetadataCache.set(cacheKey, {
			info,
			timestamp: Date.now()
		})
	}
	
	return info
}

export class LmStudioHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI
	private modelInfo: ModelInfo | null = null

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.client = new OpenAI({
			baseURL: (this.options.lmStudioBaseUrl || "http://localhost:1234") + "/v1",
			apiKey: "noop",
		})
        
		// Initialize the model info in constructor
		this.initModelInfo()
	}
    
	// Initialize model info asynchronously but don't block constructor
	private async initModelInfo(): Promise<void> {
		const baseUrl = this.options.lmStudioBaseUrl || "http://localhost:1234"
		const id = this.options.lmStudioModelId || ""
		this.modelInfo = await getCachedModelInfo(baseUrl, id)
	}

	override async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...convertToOpenAiMessages(messages),
		]

		try {
			// Try to update model info if it's not set yet
			if (!this.modelInfo) {
				await this.initModelInfo()
			}
			
			// Get model information (synchronous now)
			const model = this.getModel()
			
			// Create params object with optional draft model
			const params: any = {
				model: model.id,
				messages: openAiMessages,
				temperature: this.options.modelTemperature ?? LMSTUDIO_DEFAULT_TEMPERATURE,
				stream: true,
			}

			// Add draft model if speculative decoding is enabled and a draft model is specified
			if (this.options.lmStudioSpeculativeDecodingEnabled && this.options.lmStudioDraftModelId) {
				params.draft_model = this.options.lmStudioDraftModelId
			}

			const results = await this.client.chat.completions.create(params)

			// Stream handling
			// @ts-ignore
			for await (const chunk of results) {
				const delta = chunk.choices[0]?.delta
				if (delta?.content) {
					yield {
						type: "text",
						text: delta.content,
					}
				}
				
				// Check for usage data in the chunk
				if (chunk.usage) {
					yield {
						type: "usage",
						inputTokens: chunk.usage.prompt_tokens || 0,
						outputTokens: chunk.usage.completion_tokens || 0,
						totalCost: 0, // Local models don't have a cost
					}
				}
			}
		} catch (error) {
			// LM Studio doesn't return an error code/body for now
			throw new Error(
				"Please check the LM Studio developer logs to debug what went wrong. You may need to load the model with a larger context length to work with Roo Code's prompts.",
			)
		}
	}

	override getModel(): { id: string; info: ModelInfo } {
		const id = this.options.lmStudioModelId || ""
		
		// Use cached model info if available, otherwise use defaults
		const info = this.modelInfo || openAiModelInfoSaneDefaults
		
		return { id, info }
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			// Try to update model info if it's not set yet
			if (!this.modelInfo) {
				await this.initModelInfo()
			}
			
			// Get model information (synchronous now)
			const model = this.getModel()
			
			// Create params object with optional draft model
			const params: any = {
				model: model.id,
				messages: [{ role: "user", content: prompt }],
				temperature: this.options.modelTemperature ?? LMSTUDIO_DEFAULT_TEMPERATURE,
				stream: false,
			}

			// Add draft model if speculative decoding is enabled and a draft model is specified
			if (this.options.lmStudioSpeculativeDecodingEnabled && this.options.lmStudioDraftModelId) {
				params.draft_model = this.options.lmStudioDraftModelId
			}

			const response = await this.client.chat.completions.create(params)
			return response.choices[0]?.message.content || ""
		} catch (error) {
			throw new Error(
				"Please check the LM Studio developer logs to debug what went wrong. You may need to load the model with a larger context length to work with Roo Code's prompts.",
			)
		}
	}

	override async countTokens(content: Anthropic.Messages.ContentBlockParam[]): Promise<number> {
		// For LM Studio, we'll use the base implementation since there's no dedicated token counting endpoint
		try {
			return await super.countTokens(content)
		} catch (error) {
			console.warn("Token counting failed for LM Studio:", error)
			return 0 // Fallback to 0 if token counting fails
		}
	}
}

export async function getLmStudioModels(baseUrl = "http://localhost:1234") {
	try {
		if (!URL.canParse(baseUrl)) {
			return []
		}

		const response = await axios.get(`${baseUrl}/v1/models`)
		const modelsArray = response.data?.data?.map((model: any) => model.id) || []
		const uniqueModelIds = Array.from(new Set<string>(modelsArray))
		return uniqueModelIds
	} catch (error) {
		return []
	}
}

/**
 * Tests the connection to LM Studio's native REST API
 * @param baseUrl The base URL for LM Studio server
 * @returns True if the API is accessible, false otherwise
 */
export async function testLmStudioRestApi(baseUrl = "http://localhost:1234"): Promise<boolean> {
	try {
		if (!URL.canParse(baseUrl)) {
			return false
		}
		
		const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
		// Try to access the models endpoint which should be available if the API is running
		const response = await axios.get(`${normalizedBaseUrl}/api/v0/models`, { 
			timeout: 3000 
		})
		
		// If we get a response with status 200 and models array, the API is working
		return response.status === 200 && Array.isArray(response.data)
	} catch (error) {
		console.warn("Failed to connect to LM Studio REST API:", error)
		return false
	}
}
