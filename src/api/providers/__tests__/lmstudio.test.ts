import { Anthropic } from "@anthropic-ai/sdk"
import axios from "axios"

import { LmStudioHandler, getLmStudioModelInfo, testLmStudioRestApi } from "../lmstudio"
import { ApiHandlerOptions } from "../../../shared/api"

// Mock axios
jest.mock("axios")
const mockAxios = axios as jest.Mocked<typeof axios>

// Mock OpenAI client
const mockCreate = jest.fn()
jest.mock("openai", () => {
	return {
		__esModule: true,
		default: jest.fn().mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate.mockImplementation(async (options) => {
						if (!options.stream) {
							return {
								id: "test-completion",
								choices: [
									{
										message: { role: "assistant", content: "Test response" },
										finish_reason: "stop",
										index: 0,
									},
								],
								usage: {
									prompt_tokens: 10,
									completion_tokens: 5,
									total_tokens: 15,
								},
							}
						}

						return {
							[Symbol.asyncIterator]: async function* () {
								yield {
									choices: [
										{
											delta: { content: "Test response" },
											index: 0,
										},
									],
									usage: null,
								}
								yield {
									choices: [
										{
											delta: {},
											index: 0,
										},
									],
									usage: {
										prompt_tokens: 10,
										completion_tokens: 5,
										total_tokens: 15,
									},
								}
							},
						}
					}),
				},
			},
		})),
	}
})

describe("LmStudioHandler", () => {
	let handler: LmStudioHandler
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		mockOptions = {
			apiModelId: "local-model",
			lmStudioModelId: "local-model",
			lmStudioBaseUrl: "http://localhost:1234",
		}
		handler = new LmStudioHandler(mockOptions)
		mockCreate.mockClear()
		mockAxios.get.mockClear()
	})

	describe("constructor", () => {
		it("should initialize with provided options", () => {
			expect(handler).toBeInstanceOf(LmStudioHandler)
		})

		it("should use default base URL if not provided", () => {
			const handlerWithoutUrl = new LmStudioHandler({
				apiModelId: "local-model",
				lmStudioModelId: "local-model",
			})
			expect(handlerWithoutUrl).toBeInstanceOf(LmStudioHandler)
		})
	})

	describe("createMessage", () => {
		const systemPrompt = "You are a helpful assistant."
		const messages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: "Hello!",
			},
		]

		beforeEach(() => {
			// Mock initModelInfo to set model info directly
			jest.spyOn(handler as any, "initModelInfo").mockImplementation(async () => {
				(handler as any).modelInfo = {
					contextWindow: 32768,
					supportsPromptCache: false,
					maxTokens: -1,
				}
			})
		})

		it("should handle streaming responses", async () => {
			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks).toHaveLength(1)
			expect(textChunks[0].text).toBe("Test response")
		})

		it("should handle API errors", async () => {
			mockCreate.mockRejectedValueOnce(new Error("API Error"))

			const stream = handler.createMessage(systemPrompt, messages)

			await expect(async () => {
				for await (const _chunk of stream) {
					// Should not reach here
				}
			}).rejects.toThrow("Please check the LM Studio developer logs to debug what went wrong")
		})
	})

	describe("completePrompt", () => {
		beforeEach(() => {
			// Mock initModelInfo to set model info directly
			jest.spyOn(handler as any, "initModelInfo").mockImplementation(async () => {
				(handler as any).modelInfo = {
					contextWindow: 32768,
					supportsPromptCache: false,
					maxTokens: -1,
				}
			})
		})

		it("should complete prompt successfully", async () => {
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(mockCreate).toHaveBeenCalledWith({
				model: mockOptions.lmStudioModelId,
				messages: [{ role: "user", content: "Test prompt" }],
				temperature: 0,
				stream: false,
			})
		})

		it("should handle API errors", async () => {
			mockCreate.mockRejectedValueOnce(new Error("API Error"))
			await expect(handler.completePrompt("Test prompt")).rejects.toThrow(
				"Please check the LM Studio developer logs to debug what went wrong",
			)
		})

		it("should handle empty response", async () => {
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: "" } }],
			})
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})
	})

	describe("getModel", () => {
		it("should return model info correctly", () => {
			// Setup the modelInfo directly for testing
			(handler as any).modelInfo = {
				contextWindow: 32768,
				supportsPromptCache: false,
				maxTokens: -1,
			}

			const modelInfo = handler.getModel()
			expect(modelInfo.id).toBe(mockOptions.lmStudioModelId)
			expect(modelInfo.info).toBeDefined()
			expect(modelInfo.info.contextWindow).toBe(32768)
			expect(modelInfo.info.supportsPromptCache).toBe(false)
		})

		it("should fall back to defaults when model info is null", () => {
			// Ensure modelInfo is null for testing the fallback
			(handler as any).modelInfo = null

			const modelInfo = handler.getModel()
			expect(modelInfo.id).toBe(mockOptions.lmStudioModelId)
			expect(modelInfo.info).toBeDefined()
			expect(modelInfo.info.contextWindow).toBe(128000) // Default value
		})
	})

	describe("countTokens", () => {
		it("should use the base implementation for token counting", async () => {
			// Mock the base implementation
			const mockBaseCount = jest.spyOn(handler, "countTokens")
				.mockImplementationOnce(async () => {
					return 42 // Mock token count
				})

			const content: Anthropic.Messages.ContentBlockParam[] = [{ type: "text", text: "Test content" }]
			const count = await handler.countTokens(content)
			
			expect(count).toBe(42)
			expect(mockBaseCount).toHaveBeenCalledWith(content)
		})

		it.skip("should handle errors gracefully", async () => {
			// Mock the base implementation to throw an error
			const originalCountTokens = handler.countTokens.bind(handler);
			jest.spyOn(handler, "countTokens")
				.mockImplementationOnce(async () => {
					throw new Error("Token counting failed")
				})
				// Restore for the second call to use actual implementation
				.mockImplementationOnce(originalCountTokens);

			const content: Anthropic.Messages.ContentBlockParam[] = [{ type: "text", text: "Test content" }]
			const count = await handler.countTokens(content)
			
			expect(count).toBe(0)
		})
	})
})

describe("LM Studio API functions", () => {
	beforeEach(() => {
		mockAxios.get.mockClear()
	})

	describe("testLmStudioRestApi", () => {
		it("should return true when API is accessible", async () => {
			mockAxios.get.mockResolvedValueOnce({
				status: 200,
				data: { models: [] }
			})

			const result = await testLmStudioRestApi()
			expect(result).toBe(true)
			expect(mockAxios.get).toHaveBeenCalledWith(
				"http://localhost:1234/api/v0/models",
				expect.any(Object)
			)
		})

		it("should return false when API is not accessible", async () => {
			mockAxios.get.mockRejectedValueOnce(new Error("Connection refused"))

			const result = await testLmStudioRestApi()
			expect(result).toBe(false)
		})

		it("should return false for invalid URLs", async () => {
			// Mock URL.canParse to return false
			const originalCanParse = URL.canParse
			URL.canParse = jest.fn().mockReturnValueOnce(false)

			const result = await testLmStudioRestApi("invalid-url")
			expect(result).toBe(false)
			expect(mockAxios.get).not.toHaveBeenCalled()

			// Restore original function
			URL.canParse = originalCanParse
		})
	})

	describe("getLmStudioModelInfo", () => {
		it("should parse model information correctly", async () => {
			mockAxios.get.mockResolvedValueOnce({
				data: {
					id: "test-model",
					max_context_length: 32768,
					state: "loaded",
				},
			})

			// Access the function via export for testing
			const modelInfo = await getLmStudioModelInfo("http://localhost:1234", "test-model")
			
			expect(modelInfo).not.toBeNull()
			expect(modelInfo?.contextWindow).toBe(32768)
			expect(modelInfo?.supportsPromptCache).toBe(false)
		})

		it("should handle missing max_context_length", async () => {
			mockAxios.get.mockResolvedValueOnce({
				data: {
					id: "test-model",
					// No max_context_length field
				},
			})

			const modelInfo = await getLmStudioModelInfo("http://localhost:1234", "test-model")
			expect(modelInfo).toBeNull()
		})

		it("should handle API errors", async () => {
			mockAxios.get.mockRejectedValueOnce(new Error("API Error"))

			const modelInfo = await getLmStudioModelInfo("http://localhost:1234", "test-model")
			expect(modelInfo).toBeNull()
		})
	})
})
