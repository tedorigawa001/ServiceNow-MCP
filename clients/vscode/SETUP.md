# VS Code Setup Guide

Configure the ServiceNow MCP server with VS Code using GitHub Copilot or Claude for VS Code.

## Prerequisites

- Node.js 20.19+ and the server built (`npm install && npm run build` from repo root)
- VS Code with one of:
  - [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) extension
  - [Claude for VS Code](https://marketplace.visualstudio.com/items?itemName=Anthropic.claude-vscode) extension (if available)
- ServiceNow OAuth credentials (Client ID + Client Secret)

## Step 1: Create the MCP Config

```bash
mkdir -p .vscode
```

## Step 2: Create `.vscode/mcp.json`

```json
{
  "servers": {
    "servicenow": {
      "type": "stdio",
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/servicenow-mcp/dist/server.js"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://yourinstance.service-now.com",
        "SERVICENOW_OAUTH_CLIENT_ID": "your_client_id",
        "SERVICENOW_OAUTH_CLIENT_SECRET": "your_client_secret",
        "WRITE_ENABLED": "false",
        "MCP_TOOL_PACKAGE": "full"
      }
    }
  }
}
```

> **Note**: The VS Code MCP config format uses `"servers"` (not `"mcpServers"`) and requires `"type": "stdio"`.

If you need to run API calls as a specific ServiceNow user (password grant), add:

```json
"SERVICENOW_OAUTH_USERNAME": "svc_mcp",
"SERVICENOW_OAUTH_PASSWORD": "your_password"
```

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

## Using Workspace Variables

```json
"args": ["${workspaceFolder}/dist/server.js"]
```

## Using Environment Variables for Credentials

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
| MCP server not found | Check the absolute path to `dist/server.js` |
| Auth errors | Verify instance URL has no trailing slash |
| Tools not available | Restart VS Code after editing `.vscode/mcp.json` |
| Extension not working | Ensure GitHub Copilot subscription is active |
