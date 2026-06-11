# Installing the CiviCRM Claude Code skill

The skill is the optional companion to the MCP server. The MCP server
gives the agent typed tool contracts; the skill gives it workflow
heuristics and domain knowledge for CiviCRM.

## Recommended: install as a plugin

The plugin in the [`yo61/claude-skills`](https://github.com/yo61/claude-skills)
marketplace bundles **both** the MCP server and the skill, and prompts
for your CiviCRM URL and API key at install time:

```
/plugin marketplace add yo61/claude-skills
/plugin install civi-mcp
```

This is the same command described in
[`docs/install-mcp.md`](install-mcp.md). One install, both components.

## Manual install (skill only)

If you've already wired up the MCP server by hand (per the manual
section of `docs/install-mcp.md`) and just want the skill, copy it from
this repo:

```sh
mkdir -p ~/.claude/skills
cp -r skills/civicrm ~/.claude/skills/civicrm
```

Then check `/skills` in Claude Code lists `civicrm`. The
[`skills/civicrm/INSTALL.md`](../skills/civicrm/INSTALL.md) file has the
full procedure including how to verify and update.
