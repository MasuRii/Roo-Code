import * as vscode from "vscode"
import delay from "delay"
import type { CommandId } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"
import { Package } from "../shared/package"
import { getCommand } from "../utils/commands"
import { ClineProvider } from "../core/webview/ClineProvider"
import { ContextProxy } from "../core/config/ContextProxy"
import { registerHumanRelayCallback, unregisterHumanRelayCallback, handleHumanRelayResponse } from "./humanRelay"
import { handleNewTask } from "./handleTask"
import { CodeIndexManager } from "../services/code-index/manager"

// --- CORRECTED IMPORT PATH ---
import {
	generateCommitMessageWithRoo,
	generateCommitMessageWithCopilot,
	setScmInputBoxValue,
	getScmInputBoxValue,
} from "../utils/generateCommit" // Assuming generateCommit.ts is in src/utils/

export function getVisibleProviderOrLog(outputChannel: vscode.OutputChannel): ClineProvider | undefined {
	const visibleProvider = ClineProvider.getVisibleInstance()
	if (!visibleProvider) {
		outputChannel.appendLine("Cannot find any visible Roo Code instances.")
		return undefined
	}
	return visibleProvider
}

let sidebarPanel: vscode.WebviewView | undefined = undefined
let tabPanel: vscode.WebviewPanel | undefined = undefined

export function getPanel(): vscode.WebviewPanel | vscode.WebviewView | undefined {
	return tabPanel || sidebarPanel
}

export function setPanel(
	newPanel: vscode.WebviewPanel | vscode.WebviewView | undefined,
	type: "sidebar" | "tab",
): void {
	if (type === "sidebar") {
		sidebarPanel = newPanel as vscode.WebviewView
		tabPanel = undefined
	} else {
		tabPanel = newPanel as vscode.WebviewPanel
		sidebarPanel = undefined
	}
}

export type RegisterCommandOptions = {
	context: vscode.ExtensionContext
	outputChannel: vscode.OutputChannel
	provider: ClineProvider // This might not be used by SCM commands directly
}

export const registerCommands = (options: RegisterCommandOptions) => {
	const { context, outputChannel /*, provider */ } = options // Destructure outputChannel here

	// Register existing commands from the map
	for (const [id, callback] of Object.entries(getCommandsMap(options))) {
		const command = getCommand(id as CommandId)
		context.subscriptions.push(vscode.commands.registerCommand(command, callback))
	}

	// --- SCM COMMANDS MOVED INSIDE registerCommands FUNCTION ---

	const generateWithRooCmd = vscode.commands.registerCommand("roo-cline.generateCommitWithRoo", async () => {
		vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.SourceControl,
				title: "Roo: Generating commit message...", // TODO: Localize
			},
			async (progress) => {
				try {
					const currentMessage = await getScmInputBoxValue()
					const newMessage = await generateCommitMessageWithRoo(currentMessage)
					if (newMessage !== undefined) {
						await setScmInputBoxValue(newMessage)
					} else {
						vscode.window.showWarningMessage("Roo could not generate a commit message.") // TODO: Localize
					}
				} catch (error: any) {
					// Use the outputChannel from the options
					outputChannel.appendLine(`Error generating commit message with Roo: ${error.message}`)
					vscode.window.showErrorMessage(`Error generating commit message with Roo: ${error.message}`) // TODO: Localize
				}
			},
		)
	})

	const generateWithCopilotCmd = vscode.commands.registerCommand("roo-cline.generateCommitWithCopilot", async () => {
		vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.SourceControl,
				title: "Copilot: Generating commit message...", // TODO: Localize
			},
			async (progress) => {
				try {
					const currentMessage = await getScmInputBoxValue()
					const newMessage = await generateCommitMessageWithCopilot(currentMessage)
					if (newMessage !== undefined) {
						await setScmInputBoxValue(newMessage)
					} else {
						vscode.window.showWarningMessage("Copilot could not generate a commit message.") // TODO: Localize
					}
				} catch (error: any) {
					// Use the outputChannel from the options
					outputChannel.appendLine(`Error generating commit message with Copilot: ${error.message}`)
					vscode.window.showErrorMessage(`Error generating commit message with Copilot: ${error.message}`) // TODO: Localize
				}
			},
		)
	})

	const selectProviderCmd = vscode.commands.registerCommand("roo-cline.selectCommitProvider", async () => {
		// TODO: Potentially load these strings from your localization system
		const rooOptionLabel = "Generate Commit Message with Roo"
		const copilotOptionLabel = "Generate Commit Message with Copilot"

		const items: vscode.QuickPickItem[] = [
			{
				label: rooOptionLabel,
				description: "Use Roo AI for commit messages",
			},
			{
				label: copilotOptionLabel,
				description: "Use Copilot for commit messages", // Or your equivalent
			},
		]

		const selectedItem = await vscode.window.showQuickPick(items, {
			placeHolder: "Choose the AI provider for generating commit messages", // TODO: Localize
		})

		if (selectedItem) {
			const configuration = vscode.workspace.getConfiguration("roo-cline")
			let providerId: "roo" | "copilot" | undefined

			if (selectedItem.label === rooOptionLabel) {
				providerId = "roo"
			} else if (selectedItem.label === copilotOptionLabel) {
				providerId = "copilot"
			}

			if (providerId) {
				await configuration.update("commitMessageProvider", providerId, vscode.ConfigurationTarget.Global)
				vscode.window.showInformationMessage(
					`Commit message provider set to ${providerId === "roo" ? "Roo" : "Copilot"}.`, // TODO: Localize
				)
			}
		}
	})

	// Push SCM command disposables to context.subscriptions
	context.subscriptions.push(generateWithRooCmd, generateWithCopilotCmd, selectProviderCmd)
} // End of registerCommands function

// The getCommandsMap function remains outside, as it's a helper to define a map.
const getCommandsMap = ({ context, outputChannel, provider }: RegisterCommandOptions): Record<CommandId, any> => ({
	activationCompleted: () => {},
	accountButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) {
			return
		}
		TelemetryService.instance.captureTitleButtonClicked("account")
		visibleProvider.postMessageToWebview({ type: "action", action: "accountButtonClicked" })
	},
	plusButtonClicked: async () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) {
			return
		}
		TelemetryService.instance.captureTitleButtonClicked("plus")
		await visibleProvider.removeClineFromStack()
		await visibleProvider.postStateToWebview()
		await visibleProvider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	},
	mcpButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) {
			return
		}
		TelemetryService.instance.captureTitleButtonClicked("mcp")
		visibleProvider.postMessageToWebview({ type: "action", action: "mcpButtonClicked" })
	},
	promptsButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) {
			return
		}
		TelemetryService.instance.captureTitleButtonClicked("prompts")
		visibleProvider.postMessageToWebview({ type: "action", action: "promptsButtonClicked" })
	},
	popoutButtonClicked: () => {
		TelemetryService.instance.captureTitleButtonClicked("popout")
		// Pass context and outputChannel correctly
		return openClineInNewTab({ context, outputChannel })
	},
	// Pass context and outputChannel correctly
	openInNewTab: () => openClineInNewTab({ context, outputChannel }),
	settingsButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) {
			return
		}
		TelemetryService.instance.captureTitleButtonClicked("settings")
		visibleProvider.postMessageToWebview({ type: "action", action: "settingsButtonClicked" })
		visibleProvider.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
	},
	historyButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) {
			return
		}
		TelemetryService.instance.captureTitleButtonClicked("history")
		visibleProvider.postMessageToWebview({ type: "action", action: "historyButtonClicked" })
	},
	showHumanRelayDialog: (params: { requestId: string; promptText: string }) => {
		const panel = getPanel()
		if (panel) {
			panel?.webview.postMessage({
				type: "showHumanRelayDialog",
				requestId: params.requestId,
				promptText: params.promptText,
			})
		}
	},
	registerHumanRelayCallback: registerHumanRelayCallback,
	unregisterHumanRelayCallback: unregisterHumanRelayCallback,
	handleHumanRelayResponse: handleHumanRelayResponse,
	newTask: handleNewTask,
	setCustomStoragePath: async () => {
		const { promptForCustomStoragePath } = await import("../utils/storage") // Ensure this path is correct
		await promptForCustomStoragePath()
	},
	focusInput: async () => {
		try {
			const panel = getPanel()
			if (!panel) {
				await vscode.commands.executeCommand(`workbench.view.extension.${Package.name}-ActivityBar`)
			} else if (panel === tabPanel) {
				panel.reveal(vscode.ViewColumn.Active, false)
			} else if (panel === sidebarPanel) {
				await vscode.commands.executeCommand(`${ClineProvider.sideBarId}.focus`)
				// 'provider' here refers to the one passed into getCommandsMap,
				// which is correct for this command's original intent.
				provider.postMessageToWebview({ type: "action", action: "focusInput" })
			}
		} catch (error) {
			outputChannel.appendLine(`Error focusing input: ${error}`)
		}
	},
	acceptInput: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) {
			return
		}
		visibleProvider.postMessageToWebview({ type: "acceptInput" })
	},
})

export const openClineInNewTab = async ({ context, outputChannel }: Omit<RegisterCommandOptions, "provider">) => {
	const contextProxy = await ContextProxy.getInstance(context)
	const codeIndexManager = CodeIndexManager.getInstance(context)
	const tabProvider = new ClineProvider(context, outputChannel, "editor", contextProxy, codeIndexManager)
	const lastCol = Math.max(0, ...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0)) // Ensure lastCol is at least 0
	const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0

	let targetCol: vscode.ViewColumn
	if (hasVisibleEditors) {
		targetCol =
			lastCol === vscode.ViewColumn.One && vscode.window.visibleTextEditors.length === 1
				? vscode.ViewColumn.Two // If only one editor in col one, open in col two
				: lastCol + 1 // Otherwise, open in next column
		if (targetCol === lastCol && lastCol !== vscode.ViewColumn.One) {
			// Avoid opening in the same non-first column
			targetCol = lastCol + 1
		}
	} else {
		// No visible editors, create a new group to the right of a conceptual first group
		// Or simply open in ViewColumn.One if that's preferred when no editors are open.
		await vscode.commands.executeCommand("workbench.action.newGroupRight") // This creates a second group
		targetCol = vscode.ViewColumn.Two // Target the newly created group
		// If you prefer ViewColumn.One when no editors are open:
		// targetCol = vscode.ViewColumn.One;
	}

	const newPanel = vscode.window.createWebviewPanel(
		ClineProvider.tabPanelId,
		"Roo Code", // Title
		targetCol,
		{
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [context.extensionUri],
		},
	)
	setPanel(newPanel, "tab")
	newPanel.iconPath = {
		light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "panel_light.png"),
		dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "panel_dark.png"),
	}
	await tabProvider.resolveWebviewView(newPanel) // This should set up the webview's HTML content
	newPanel.onDidChangeViewState(
		(e) => {
			const panel = e.webviewPanel
			if (panel.visible) {
				panel.webview.postMessage({ type: "action", action: "didBecomeVisible" })
			}
		},
		null,
		context.subscriptions,
	)
	newPanel.onDidDispose(
		() => {
			setPanel(undefined, "tab")
			// tabProvider might have its own disposal logic if needed
		},
		null,
		context.subscriptions,
	)
	// Delay might not be strictly necessary if resolveWebviewView fully sets up the view
	// await delay(100);
	// Consider if locking the editor group is always desired
	// await vscode.commands.executeCommand("workbench.action.lockEditorGroup");
	return tabProvider
}
