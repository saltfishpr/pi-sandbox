# pi-sandbox

A [Pi](https://pi.dev/) extension that provides OS-level sandbox isolation for bash commands and read/write/edit tools, enforces filesystem path policies, and supports interactive authorization within a session.

Built on top of [`@anthropic-ai/sandbox-runtime`](https://www.npmjs.com/package/@anthropic-ai/sandbox-runtime). It only takes effect on **macOS** and **Linux**; on other platforms it automatically falls back to no sandbox.

## Installation

```bash
pi install git:github.com/saltfishpr/pi-sandbox
```

## Usage

Just run `pi` normally. When a session starts, the following defaults are applied:

- **Read**: allow everything except `.env` and `.env.*`
- **Write**: only allow the current working directory (`.`)
- **Network**: all domains allowed (configurable)

To disable the sandbox for a single launch:

```bash
pi --no-sandbox
```

When the agent tries to access a denied path, an interactive prompt is shown:

```
Write file

Write access requested for: {path}

Grant this permission?
→ 1. Abort (keep blocked)
  2. Allow for this session only
  3. Allow for this project
  4. Allow for all projects

 ↑↓ navigate • enter select • esc cancel
```

Option meanings:

| Option    | Meaning                                                                   |
| --------- | ------------------------------------------------------------------------- |
| `abort`   | Deny this access; the tool call is blocked                                |
| `session` | Allow only for the current session; lost on restart (kept in memory only) |
| `project` | Write to project config `<cwd>/.pi/extensions/sandbox.json`               |
| `global`  | Write to global config `~/.pi/agent/extensions/sandbox.json`              |

### Commands

| Command            | Purpose                                                  |
| ------------------ | -------------------------------------------------------- |
| `/sandbox`         | Show current config, effective paths, and session grants |
| `/enable-sandbox`  | Enable the sandbox mid-session                           |
| `/disable-sandbox` | Disable the sandbox mid-session                          |

## Configuration

pi-sandbox reads config from two locations. **Project config has higher priority** and overrides the global config field-by-field:

- `~/.pi/agent/extensions/sandbox.json` (global)
- `<cwd>/.pi/extensions/sandbox.json` (project-local)

Full example:

```json
{
  "enabled": true,
  "network": {
    "allowedDomains": ["*"],
    "deniedDomains": []
  },
  "filesystem": {
    "denyRead": [".env", ".env.*"],
    "allowRead": [],
    "allowWrite": ["."],
    "denyWrite": [".env", ".env.*"]
  }
}
```

Field reference:

| Field                    | Type       | Description                                                                   |
| ------------------------ | ---------- | ----------------------------------------------------------------------------- |
| `enabled`                | `boolean`  | Whether the sandbox is enabled; `false` behaves the same as `--no-sandbox`    |
| `network.allowedDomains` | `string[]` | Domains allowed for network access; `"*"` allows all                          |
| `network.deniedDomains`  | `string[]` | Domains explicitly denied                                                     |
| `filesystem.denyRead`    | `string[]` | Matching paths trigger an interactive prompt (non-matching paths are allowed) |
| `filesystem.allowRead`   | `string[]` | Exemptions carved out of `denyRead`                                           |
| `filesystem.allowWrite`  | `string[]` | Paths allowed for writes; non-matching paths trigger an interactive prompt    |
| `filesystem.denyWrite`   | `string[]` | Hard-deny writes; **no** authorization prompt is shown                        |

### Permission rules

- **Read**: allowed by default; matching `denyRead` triggers the authorization prompt; `allowRead` carves out exemptions inside `denyRead`.
- **Write**: matching `denyWrite` blocks immediately with **no prompt**; matching `allowWrite` is allowed; anything else triggers the authorization prompt.

### Path matching rules

Paths in config are processed as follows:

- `~` is expanded to the user's home directory
- Relative paths are resolved against the current working directory
- Symbolic links are resolved to their real paths (`realpath`)

## License

[MIT](./LICENSE)
