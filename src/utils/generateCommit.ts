import * as vscode from "vscode"
// Adjust path to support-prompt.ts (now in src/shared)
import { supportPrompt } from "../shared/support-prompt"

// Helper function to get the Git extension API
function getGitAPI(): any | undefined {
	const extension = vscode.extensions.getExtension("vscode.git")
	if (!extension) {
		vscode.window.showErrorMessage("Git extension is not available. Please install or enable it.")
		return undefined
	}
	if (!extension.isActive) {
		// Consider activating if necessary, though it usually is when SCM view is open.
		// await extension.activate();
		console.warn("Git extension is not active. Attempting to use anyway.")
	}
	try {
		return extension.exports.getAPI(1)
	} catch (err) {
		console.error("Failed to get Git API:", err)
		vscode.window.showErrorMessage("Failed to get Git API. Git features may not work.")
		return undefined
	}
}

export async function getScmInputBoxValue(): Promise<string> {
	const gitAPI = getGitAPI()
	if (!gitAPI || gitAPI.repositories.length === 0) {
		console.warn("No Git repository found or Git API not available for getScmInputBoxValue.")
		return ""
	}
	const repo = gitAPI.repositories[0]
	return repo.inputBox.value || ""
}

export async function setScmInputBoxValue(message: string): Promise<void> {
	const gitAPI = getGitAPI()
	if (!gitAPI || gitAPI.repositories.length === 0) {
		console.warn("No Git repository found or Git API not available for setScmInputBoxValue.")
		return
	}
	const repo = gitAPI.repositories[0]
	repo.inputBox.value = message
}

/**
 * Gets the diff of staged changes.
 * @returns A promise that resolves to the diff string or an error message string.
 */
async function getStagedDiff(): Promise<string> {
	const gitAPI = getGitAPI()
	if (!gitAPI || gitAPI.repositories.length === 0) {
		return "Error: No Git repository found."
	}
	const repo = gitAPI.repositories[0]
	try {
		// repo.diffIndexWithHEAD() returns diff of staged changes against HEAD.
		const diff = await repo.diffIndexWithHEAD()
		return diff || "No staged changes detected."
	} catch (error: any) {
		console.error("Error getting staged diff:", error)
		return `Error fetching staged changes: ${error.message || error.toString()}`
	}
}

/**
 * Gets the current branch name.
 * @returns A promise that resolves to the branch name or 'unknown'.
 */
async function getCurrentBranchName(): Promise<string> {
	const gitAPI = getGitAPI()
	if (!gitAPI || gitAPI.repositories.length === 0) {
		return "unknown_branch"
	}
	const repo = gitAPI.repositories[0]
	try {
		const head = repo.state.HEAD
		return head?.name || "unknown_branch"
	} catch (error) {
		console.error("Error getting current branch name:", error)
		return "unknown_branch"
	}
}

export async function generateCommitMessageWithRoo(currentCommitInput: string): Promise<string | undefined> {
	const stagedDiff = await getStagedDiff()
	const branchName = await getCurrentBranchName()

	// You might have custom prompts stored in configuration or elsewhere
	const customSupportPrompts = undefined // Example: vscode.workspace.getConfiguration('roo-cline').get('customSupportPrompts');

	const promptText = supportPrompt.create(
		"GENERATE_COMMIT_ROO",
		{
			stagedDiff,
			currentCommitInput,
			branchName,
		},
		customSupportPrompts,
	)

	console.log("Roo Prompt to be sent:\n", promptText)

	// --- ACTUAL ROO AI SERVICE CALL WOULD GO HERE ---
	// Example:
	// try {
	//   const aiResponse = await callRooAIService(promptText);
	//   return aiResponse; // Assuming aiResponse is the commit message string
	// } catch (error) {
	//   vscode.window.showErrorMessage("Roo AI: Failed to generate commit message.");
	//   console.error("Roo AI Error:", error);
	//   return undefined;
	// }
	// -----------------------------------------------

	// Placeholder simulation
	await new Promise((resolve) => setTimeout(resolve, 1500))
	return `Roo AI Generated: (Based on prompt with ${stagedDiff.length} diff chars on branch ${branchName})`
}

export async function generateCommitMessageWithCopilot(currentCommitInput: string): Promise<string | undefined> {
	const stagedDiff = await getStagedDiff()
	const branchName = await getCurrentBranchName()
	const customSupportPrompts = undefined

	const promptText = supportPrompt.create(
		"GENERATE_COMMIT_COPILOT",
		{
			stagedDiff,
			currentCommitInput,
			branchName,
		},
		customSupportPrompts,
	)

	console.log("Copilot (stub) Prompt to be sent:\n", promptText)

	// --- ACTUAL COPILOT-LIKE AI SERVICE CALL WOULD GO HERE ---
	// Example:
	// try {
	//   const aiResponse = await callCopilotLikeAIService(promptText);
	//   return aiResponse;
	// } catch (error) {
	//   vscode.window.showErrorMessage("Copilot AI: Failed to generate commit message.");
	//   console.error("Copilot AI Error:", error);
	//   return undefined;
	// }
	// -------------------------------------------------------

	// Placeholder simulation
	await new Promise((resolve) => setTimeout(resolve, 1000))
	return `Copilot-like Generated: (Based on prompt with ${stagedDiff.length} diff chars on branch ${branchName})`
}
