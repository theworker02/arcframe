# Cursor API limitations (documented)

Arcframe's Cursor plugin uses **only documented VS Code extension APIs**:

| Used | API |
|------|-----|
| Yes | `commands.registerCommand` |
| Yes | `window.registerWebviewViewProvider` (sidebar webview) |
| Yes | `workspace.workspaceFolders`, `openTextDocument`, `showTextDocument` |
| Yes | `window.showInformationMessage` / `showErrorMessage` |

## Not assumed / not invented

- No undocumented Cursor-only agent UI injection APIs
- No proprietary “Composer panel” hooks
- No automatic write-back into the agent transcript
- Heavy intelligence is **not** reimplemented in the extension — it shells out to the Arcframe CLI (`cli/dist/bin.js`) and expects MCP for agent tooling

If Cursor adds stable public APIs for deeper host integration, Arcframe can adopt them behind capability checks without forking the core engine.
