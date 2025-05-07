import { useCallback, useEffect, useState } from "react"
import { useEvent } from "react-use"
import { Trans } from "react-i18next"
import { Checkbox } from "vscrui"
import { VSCodeLink, VSCodeRadio, VSCodeRadioGroup, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import { ApiConfiguration } from "@roo/shared/api"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { ExtensionMessage } from "@roo/shared/ExtensionMessage"
import { vscode } from "@src/utils/vscode"

import { inputEventTransform } from "../transforms"

type LMStudioProps = {
	apiConfiguration: ApiConfiguration
	setApiConfigurationField: (field: keyof ApiConfiguration, value: ApiConfiguration[keyof ApiConfiguration]) => void
}

type ModelInfo = {
	contextWindow: number | null
}

export const LMStudio = ({ apiConfiguration, setApiConfigurationField }: LMStudioProps) => {
	const { t } = useAppTranslation()

	const [lmStudioModels, setLmStudioModels] = useState<string[]>([])
	const [modelInfo, setModelInfo] = useState<ModelInfo>({ contextWindow: null })
	const [isModelInfoLoading, setIsModelInfoLoading] = useState<boolean>(false)

	const handleInputChange = useCallback(
		<K extends keyof ApiConfiguration, E>(
			field: K,
			transform: (event: E) => ApiConfiguration[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	// Request model information when model ID changes
	useEffect(() => {
		if (apiConfiguration?.lmStudioModelId && apiConfiguration.lmStudioBaseUrl) {
			setIsModelInfoLoading(true)
			// Send message to extension to fetch model info
			vscode?.postMessage({
				type: "getLmStudioModelInfo",
				baseUrl: apiConfiguration.lmStudioBaseUrl,
				modelId: apiConfiguration.lmStudioModelId,
			})
		} else {
			setModelInfo({ contextWindow: null })
		}
	}, [apiConfiguration?.lmStudioModelId, apiConfiguration?.lmStudioBaseUrl])

	const onMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data

		switch (message.type) {
			case "lmStudioModels":
				const newModels = message.lmStudioModels ?? []
				setLmStudioModels(newModels)
				break
			case "lmStudioModelInfo":
				setIsModelInfoLoading(false)
				if (message.modelInfo && typeof message.modelInfo.contextWindow === 'number') {
					setModelInfo({
						contextWindow: message.modelInfo.contextWindow,
					})
				} else {
					setModelInfo({ contextWindow: null })
				}
				break
		}
	}, [])

	useEvent("message", onMessage)

	return (
		<>
			<VSCodeTextField
				value={apiConfiguration?.lmStudioBaseUrl || ""}
				type="url"
				onInput={handleInputChange("lmStudioBaseUrl")}
				placeholder={t("settings:defaults.lmStudioUrl")}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.lmStudio.baseUrl")}</label>
			</VSCodeTextField>
			<VSCodeTextField
				value={apiConfiguration?.lmStudioModelId || ""}
				onInput={handleInputChange("lmStudioModelId")}
				placeholder={t("settings:placeholders.modelId.lmStudio")}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.lmStudio.modelId")}</label>
			</VSCodeTextField>
			
			{/* Display context window information */}
			{isModelInfoLoading && (
				<div className="text-sm mt-1 mb-2 text-vscode-descriptionForeground">
					Loading model information...
				</div>
			)}
			{!isModelInfoLoading && modelInfo.contextWindow && (
				<div 
					className="text-sm rounded-xs p-2 mt-1 mb-2" 
					style={{
						backgroundColor: "var(--vscode-inputValidation-infoBackground)",
						border: "1px solid var(--vscode-inputValidation-infoBorder)",
						color: "var(--vscode-inputValidation-infoForeground)",
					}}>
					Model context window: {modelInfo.contextWindow.toLocaleString()} tokens
				</div>
			)}
			
			{lmStudioModels.length > 0 && (
				<VSCodeRadioGroup
					value={
						lmStudioModels.includes(apiConfiguration?.lmStudioModelId || "")
							? apiConfiguration?.lmStudioModelId
							: ""
					}
					onChange={handleInputChange("lmStudioModelId")}>
					{lmStudioModels.map((model) => (
						<VSCodeRadio key={model} value={model} checked={apiConfiguration?.lmStudioModelId === model}>
							{model}
						</VSCodeRadio>
					))}
				</VSCodeRadioGroup>
			)}
			<Checkbox
				checked={apiConfiguration?.lmStudioSpeculativeDecodingEnabled === true}
				onChange={(checked) => {
					setApiConfigurationField("lmStudioSpeculativeDecodingEnabled", checked)
				}}>
				{t("settings:providers.lmStudio.speculativeDecoding")}
			</Checkbox>
			{apiConfiguration?.lmStudioSpeculativeDecodingEnabled && (
				<>
					<div>
						<VSCodeTextField
							value={apiConfiguration?.lmStudioDraftModelId || ""}
							onInput={handleInputChange("lmStudioDraftModelId")}
							placeholder={t("settings:placeholders.modelId.lmStudioDraft")}
							className="w-full">
							<label className="block font-medium mb-1">
								{t("settings:providers.lmStudio.draftModelId")}
							</label>
						</VSCodeTextField>
						<div className="text-sm text-vscode-descriptionForeground">
							{t("settings:providers.lmStudio.draftModelDesc")}
						</div>
					</div>
					{lmStudioModels.length > 0 && (
						<>
							<div className="font-medium">{t("settings:providers.lmStudio.selectDraftModel")}</div>
							<VSCodeRadioGroup
								value={
									lmStudioModels.includes(apiConfiguration?.lmStudioDraftModelId || "")
										? apiConfiguration?.lmStudioDraftModelId
										: ""
								}
								onChange={handleInputChange("lmStudioDraftModelId")}>
								{lmStudioModels.map((model) => (
									<VSCodeRadio key={`draft-${model}`} value={model}>
										{model}
									</VSCodeRadio>
								))}
							</VSCodeRadioGroup>
							{lmStudioModels.length === 0 && (
								<div
									className="text-sm rounded-xs p-2"
									style={{
										backgroundColor: "var(--vscode-inputValidation-infoBackground)",
										border: "1px solid var(--vscode-inputValidation-infoBorder)",
										color: "var(--vscode-inputValidation-infoForeground)",
									}}>
									{t("settings:providers.lmStudio.noModelsFound")}
								</div>
							)}
						</>
					)}
				</>
			)}
			<div className="text-sm text-vscode-descriptionForeground">
				<Trans
					i18nKey="settings:providers.lmStudio.description"
					components={{
						a: <VSCodeLink href="https://lmstudio.ai/docs" />,
						b: <VSCodeLink href="https://lmstudio.ai/docs/basics/server" />,
						span: (
							<span className="text-vscode-errorForeground ml-1">
								<span className="font-medium">Note:</span>
							</span>
						),
					}}
				/>
			</div>
		</>
	)
}
