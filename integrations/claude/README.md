# Using SIGMA from Claude

Two pieces let Claude work inside SIGMA:

1. **The MCP server** (`packages/mcp`) gives Claude tools to list, create, read, edit, render and
   share SIGMA files.
2. **The `sigma-design` skill** (`integrations/claude/skills/sigma-design`) teaches Claude the
   workflow and conventions, so a request like "mock up a settings screen in SIGMA" produces a
   real file.

## Claude Code

```bash
# 1. In SIGMA: Account → API tokens → New token (copy the sgm_… value)
# 2. Register the server (run from the repository root)
claude mcp add sigma \
  --env SIGMA_URL=http://localhost:3387 --env SIGMA_TOKEN=sgm_… \
  -- node packages/mcp/bin/sigma-mcp.mjs

# 3. Install the skill for this project (or copy it to ~/.claude/skills for every project)
mkdir -p .claude/skills && cp -r integrations/claude/skills/sigma-design .claude/skills/
```

Alternatively copy `.mcp.json.example` to `.mcp.json` and fill in the token; Claude Code picks it
up when started in this directory.

## Claude Desktop

Add the `sigma` entry from `.mcp.json.example` to the `mcpServers` section of
`claude_desktop_config.json`, using absolute paths for `node` and `sigma-mcp.mjs`.

## Other MCP clients

Any client that speaks MCP over stdio can start `node packages/mcp/bin/sigma-mcp.mjs` with
`SIGMA_URL` and `SIGMA_TOKEN` in the environment.

## What Claude can and cannot do

The token carries the permissions of the user who created it: Claude sees and edits exactly what
that user can. Edits go through the same validated operations API as the in-app assistant
(`POST /api/v1/documents/:id/ops`), are saved as normal revisions, appear live for people with the
file open, and can be rolled back from Version history. Revoke the token to cut access.
