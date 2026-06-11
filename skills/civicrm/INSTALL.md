# Installing the CiviCRM skill

This skill is the optional companion to the `civi-mcp` MCP server. The
MCP server gives the agent typed tool contracts; this skill gives it
workflow heuristics and domain knowledge.

## Recommended: install the plugin

The skill and the MCP server are bundled in a single Claude Code plugin
in the [`yo61/claude-skills`](https://github.com/yo61/claude-skills)
marketplace. One command installs both:

```
/plugin marketplace add yo61/claude-skills
/plugin install civi-mcp
```

Skip the rest of this document if you went this route.

## Manual install

Use this path if you cannot use the plugin marketplace (e.g. air-gapped
environment) or if you've already wired up the MCP server by hand and
only want the skill files.

### Prerequisites

- The `civi-mcp` MCP server is configured in your Claude Desktop /
  Claude Code MCP config (see `docs/install-mcp.md` in this repo).
- Claude Code is installed and looks at `~/.claude/skills/` by default.

### Install

From a clone of this repo:

```sh
mkdir -p ~/.claude/skills
cp -r skills/civicrm ~/.claude/skills/civicrm
```

## Verify

In Claude Code, run:

```
/skills
```

`civicrm` should appear in the list. Ask a CiviCRM question (e.g. "how
many active members do we have?") — Claude should invoke the skill before
calling the MCP tools.

## Update

When you `git pull` this repo, re-copy:

```sh
rm -rf ~/.claude/skills/civicrm
cp -r skills/civicrm ~/.claude/skills/civicrm
```

The `CHANGELOG.md` in this directory records what changed and whether you
need to also update the MCP server.
