# VS Code Setup Guide

Configure the ServiceNow MCP server with VS Code using GitHub Copilot or Claude for VS Code.

## Prerequisites

- Node.js 20.19+
- VS Code 1.99+ with one of:
  - [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) extension
  - [Claude for VS Code](https://marketplace.visualstudio.com/items?itemName=Anthropic.claude-vscode) extension (if available)
- ServiceNow OAuth credentials (Client ID + Client Secret)

## Option A: Setup Wizard (Recommended)

Run the wizard in the workspace folder you will open in VS Code, then pick **VS Code (GitHub Copilot)**:

```bash
cd /path/to/your/workspace
npx @tedorigawa001/servicenow-mcp setup
```

The wizard writes `.vscode/mcp.json` in the format below — the client secret is **not** stored in the file; VS Code prompts for it on first start and stores it encrypted.

## Option B: Manual `.vscode/mcp.json`

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "servicenow-client-secret",
      "description": "ServiceNow OAuth client secret",
      "password": true
    }
  ],
  "servers": {
    "servicenow-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@tedorigawa001/servicenow-mcp", "server"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://yourinstance.service-now.com",
        "SERVICENOW_OAUTH_CLIENT_ID": "your_client_id",
        "SERVICENOW_OAUTH_CLIENT_SECRET": "${input:servicenow-client-secret}",
        "WRITE_ENABLED": "false",
        "MCP_TOOL_PACKAGE": "full"
      }
    }
  }
}
```

> **Note**: The VS Code MCP config format uses `"servers"` (not `"mcpServers"`) and requires `"type": "stdio"`. Secrets belong in `inputs` (prompted once, stored encrypted), never in plaintext — `.vscode/` is often committed to git.

If you need to run API calls as a specific ServiceNow user (password grant), add another input for the password and reference it:

```json
"SERVICENOW_OAUTH_USERNAME": "svc_mcp",
"SERVICENOW_OAUTH_PASSWORD": "${input:servicenow-oauth-password}"
```

### Running from a source build instead of npx

If you cloned the repo and ran `npm install && npm run build`, you can point at the build directly:

```json
"command": "node",
"args": ["/ABSOLUTE/PATH/TO/servicenow-mcp/dist/server.js"]
```

Avoid this form if you installed via `npx` — the path would point into the npx cache and break when the cache is pruned.

## Step 3: Install Recommended Extensions

```bash
cp /path/to/servicenow-mcp/clients/vscode/.vscode/extensions.json .vscode/extensions.json
```

VS Code will prompt you to install: GitHub Copilot, GitHub Copilot Chat.

## Step 4: Verify

With the Copilot extension installed:
1. Open VS Code Copilot Chat (Ctrl+Shift+I or Cmd+Shift+I)
2. The chat interface should now have access to ServiceNow tools

## Step 5: Test

In Copilot Chat or Claude chat, try:

```
@servicenow List my open incidents
```

```
@servicenow Search the knowledge base for VPN troubleshooting
```

## Using Environment Variables for Credentials

As an alternative to `inputs`, you can pull credentials from your shell environment:

```json
"SERVICENOW_OAUTH_CLIENT_ID": "${env:SN_CLIENT_ID}",
"SERVICENOW_OAUTH_CLIENT_SECRET": "${env:SN_CLIENT_SECRET}"
```

Set in your shell profile (`~/.zshrc`, `~/.bashrc`):
```bash
export SN_CLIENT_ID=your_client_id
export SN_CLIENT_SECRET=your_client_secret
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| MCP server not found | Ensure `npx` is on PATH (Node 20+); for source builds, check the absolute path to `dist/server.js` |
| Secret prompt not shown | Command Palette → `MCP: Reset Cached Inputs`, then restart the server |
| Auth errors | Verify instance URL has no trailing slash |
| Tools not available | Restart VS Code after editing `.vscode/mcp.json` |
| Extension not working | Ensure GitHub Copilot subscription is active |
