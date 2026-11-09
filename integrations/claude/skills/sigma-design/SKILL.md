---
name: sigma-design
description: Create and edit designs in a SIGMA instance (screens, layouts, mockups, wireframes) through the SIGMA MCP tools. Use when the user asks to design, mock up, wireframe, or change something in SIGMA, or to export or share a SIGMA file.
---

# Designing in SIGMA

SIGMA is a self-hosted design tool. The `sigma` MCP server exposes it through tools named
`sigma_*`. If those tools are missing, tell the user to connect the server (see "Setup" below)
instead of describing a design in prose.

## Workflow

1. **Find or create the file.** `sigma_list_workspaces` → `sigma_list_projects` →
   `sigma_list_documents`, or `sigma_create_document` for new work. Tell the user the file URL the
   tool returns so they can watch the design appear.
2. **Read before writing.** `sigma_get_outline` returns every layer with its id, type, name,
   position and size. Edit only ids that came from an outline or from a previous `sigma_apply_ops`
   result.
3. **Checkpoint before large or destructive edits** with `sigma_save_version`.
4. **Edit with `sigma_apply_ops`.** Send related operations in one call.
5. **Look at the result.** `sigma_export_png` returns an image of the page or one frame. Check
   alignment, overlap and text overflow, then fix what is off.
6. **Hand over.** Summarise what you built, give the file URL, and offer
   `sigma_create_share_link` when the user wants to show it to someone without an account.

## Operations

Each operation is an object with `op`:

- `add`: `type` is one of `FRAME`, `RECTANGLE`, `ELLIPSE`, `LINE`, `POLYGON`, `STAR`, `TEXT`,
  `GROUP`, `COMPONENT`, `PAGE`. Optional `parent` (node id or `$ref`; defaults to the first
  page), `ref` (a name later operations can use as `$name`), and the fields below.
- `update`: `id` plus any fields below.
- `move`: `id`, `parent`, optional `index`.
- `delete`: `id`.
- `rename_document`: `name`.

Fields: `name`, `x`, `y`, `width`, `height`, `rotation`, `fill` and `stroke` (hex like `#2563eb`,
or `"none"`), `strokeWidth`, `opacity` (0–1), `visible`, `cornerRadius`, and for text `text`,
`fontSize`, `fontWeight`.

Coordinates are pixels relative to the parent; y grows downward. A failed operation is skipped
and reported in the results; the others still run.

```json
[
  {
    "op": "add",
    "type": "FRAME",
    "ref": "home",
    "name": "Home",
    "x": 0,
    "y": 0,
    "width": 390,
    "height": 844,
    "fill": "#ffffff"
  },
  {
    "op": "add",
    "type": "TEXT",
    "parent": "$home",
    "name": "Title",
    "x": 24,
    "y": 64,
    "text": "Good morning",
    "fontSize": 28,
    "fontWeight": 700,
    "fill": "#111827"
  },
  {
    "op": "add",
    "type": "RECTANGLE",
    "parent": "$home",
    "name": "Primary button",
    "x": 24,
    "y": 760,
    "width": 342,
    "height": 52,
    "cornerRadius": 12,
    "fill": "#2563eb"
  },
  {
    "op": "add",
    "type": "TEXT",
    "parent": "$home",
    "name": "Button label",
    "x": 150,
    "y": 776,
    "text": "Continue",
    "fontSize": 16,
    "fontWeight": 600,
    "fill": "#ffffff"
  }
]
```

## Design conventions

- One `FRAME` per screen; put all of a screen's content inside it. Common sizes: phone 390×844,
  tablet 834×1194, desktop 1440×900. Place screens side by side with 100 px between them.
- Use an 8 px spacing grid and at most two type families and five text sizes per file.
- Name layers by role ("Primary button", "Card / title"), not by shape.
- Keep text contrast readable: dark text on light fills, or the reverse.
- Text layers size to their content; position them by their top-left corner.

## Setup

```bash
claude mcp add sigma \
  --env SIGMA_URL=http://localhost:3387 --env SIGMA_TOKEN=sgm_… \
  -- node /path/to/sigma/packages/mcp/bin/sigma-mcp.mjs
```

The token comes from **Account → API tokens** in SIGMA and carries that user's permissions.
