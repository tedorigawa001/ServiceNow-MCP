# Cursor Setup Guide

Configure the ServiceNow MCP server with Cursor IDE.

## Prerequisites

- Node.js 20.19+ and the server built (`npm install && npm run build` from repo root)
- Cursor IDE installed ([cursor.sh](https://cursor.sh))
- ServiceNow OAuth credentials (Client ID + Client Secret)

## Step 1: Create the MCP Config

```bash
mkdir -p .cursor
cp /path/to/servicenow-mcp/clients/cursor/.cursor/mcp.oauth.json .cursor/mcp.json
```

## Step 2: Edit the Config

Edit `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "servicenow": {
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

> **Important**: Use the absolute path to `dist/server.js` — relative paths may not work.

If you need to run API calls as a specific ServiceNow user (password grant), add:

```json
"SERVICENOW_OAUTH_USERNAME": "svc_mcp",
"SERVICENOW_OAUTH_PASSWORD": "your_password"
```

## Step 3: Add Cursor Rules (Optional)

```bash
cp /path/to/servicenow-mcp/clients/cursor/.cursorrules .cursorrules
```

This instructs Cursor to use ServiceNow tools when you ask about incidents, changes, knowledge, or IT operations.

## Step 4: Verify

Open Cursor → Settings → MCP (in the left sidebar).

You should see `servicenow` listed with a connected status.

## Step 5: Test

Open Cursor's AI chat (Ctrl+L or Cmd+L) and try:

```
List my open incidents
```

```
Show me the CMDB health dashboard
```

## Using Environment Variables for Credentials

To avoid putting credentials directly in the config file:

```json
"SERVICENOW_OAUTH_CLIENT_ID": "${env:SN_CLIENT_ID}",
"SERVICENOW_OAUTH_CLIENT_SECRET": "${env:SN_CLIENT_SECRET}"
```

Then set in your shell profile:
```bash
export SN_CLIENT_ID=your_client_id
export SN_CLIENT_SECRET=your_client_secret
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Server not connecting | Check absolute path to `dist/server.js` |
| Auth errors | Verify instance URL has no trailing slash |
| No MCP option in settings | Update Cursor to the latest version |
| Tools not appearing | Restart Cursor after editing the config |
