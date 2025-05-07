import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { formatLargeNumber } from "@/utils/format"
import { calculateTokenDistribution } from "@/utils/model-utils"

interface ContextWindowProgressProps {
	contextWindow: number
	contextTokens: number
	maxTokens?: number
	onlyCurrent?: boolean
}

export const ContextWindowProgress = ({ contextWindow, contextTokens, maxTokens, onlyCurrent }: ContextWindowProgressProps) => {
	const { t } = useTranslation()

	// Use the shared utility function to calculate all token distribution values
	const tokenDistribution = useMemo(
		() => calculateTokenDistribution(contextWindow, contextTokens, maxTokens),
		[contextWindow, contextTokens, maxTokens],
	)

	// Destructure the values we need
	const { currentPercent, reservedPercent, availableSize, reservedForOutput, availablePercent } = tokenDistribution

	// For display purposes
	const safeContextWindow = Math.max(0, contextWindow)
	const safeContextTokens = Math.max(0, contextTokens)

	// If onlyCurrent is set, show only the current tokens bar against full width
	if (onlyCurrent) {
		return (
			<div className="flex items-center gap-2 flex-1 whitespace-nowrap px-2 text-[var(--vscode-foreground)]">
				{/* Tokens used count */}
				<div data-testid="context-tokens-count">
					{formatLargeNumber(safeContextTokens)}
				</div>
				{/* Progress bar */}
				<div className="flex items-center h-1 rounded-[2px] overflow-hidden flex-1 bg-[color-mix(in_srgb,var(--vscode-foreground)_20%,transparent)]">
					<div
						data-testid="context-tokens-used"
						title={t("chat:tokenProgress.tokensUsed", {
							used: formatLargeNumber(safeContextTokens),
							total: formatLargeNumber(safeContextWindow),
						})}
						className="h-full bg-[var(--vscode-foreground)]"
						style={{ width: `${currentPercent}%` }}
					/>
				</div>
				{/* Context window size */}
				<div data-testid="context-window-size">
					{formatLargeNumber(safeContextWindow)}
				</div>
			</div>
		)
	}

	return (
		<>
			<div className="flex items-center gap-2 flex-1 whitespace-nowrap px-2">
				<div data-testid="context-tokens-count">{formatLargeNumber(safeContextTokens)}</div>
				<div className="flex-1 relative">
					{/* Invisible overlay for hover area */}
					<div
						className="absolute w-full h-4 -top-[7px] z-5"
						title={t("chat:tokenProgress.availableSpace", { amount: formatLargeNumber(availableSize) })}
						data-testid="context-available-space"
					/>

					{/* Main progress bar container */}
					<div className="flex items-center h-1 rounded-[2px] overflow-hidden w-full bg-[color-mix(in_srgb,var(--vscode-foreground)_20%,transparent)]">
						{/* Current tokens container */}
						<div className="relative h-full" style={{ width: `${currentPercent}%` }}>
							{/* Invisible overlay for current tokens section */}
							<div
								className="absolute h-4 -top-[7px] w-full z-6"
								title={t("chat:tokenProgress.tokensUsed", {
									used: formatLargeNumber(safeContextTokens),
									total: formatLargeNumber(safeContextWindow),
								})}
								data-testid="context-tokens-used"
							/>
							{/* Current tokens used - darkest */}
							<div className="h-full w-full bg-[var(--vscode-foreground)] transition-width duration-300 ease-out" />
						</div>

						{/* Container for reserved tokens */}
						<div className="relative h-full" style={{ width: `${reservedPercent}%` }}>
							{/* Invisible overlay for reserved section */}
							<div
								className="absolute h-4 -top-[7px] w-full z-6"
								title={t("chat:tokenProgress.reservedForResponse", {
									amount: formatLargeNumber(reservedForOutput),
								})}
								data-testid="context-reserved-tokens"
							/>
							{/* Reserved for output section - medium gray */}
							<div className="h-full w-full bg-[color-mix(in_srgb,var(--vscode-foreground)_30%,transparent)] transition-width duration-300 ease-out" />
						</div>

						{/* Empty section (if any) */}
						{availablePercent > 0 && (
							<div className="relative h-full" style={{ width: `${availablePercent}%` }}>
								{/* Invisible overlay for available space */}
								<div
									className="absolute h-4 -top-[7px] w-full z-6"
									title={t("chat:tokenProgress.availableSpace", {
										amount: formatLargeNumber(availableSize),
									})}
									data-testid="context-available-space-section"
								/>
							</div>
						)}
					</div>
				</div>
				<div data-testid="context-window-size">{formatLargeNumber(safeContextWindow)}</div>
			</div>
		</>
	)
}
