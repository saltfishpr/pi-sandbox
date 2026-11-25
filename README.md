# pi-sandbox

A [Pi](https://pi.dev/) extension for **macOS** and **Linux**. It sandboxes Bash commands with [`@anthropic-ai/sandbox-runtime`](https://www.npmjs.com/package/@anthropic-ai/sandbox-runtime) and provides path permissions and interactive approval for Pi's `read`, `write`, and `edit` tools.

## Installation

Requires Node.js 22.12.0 or later.

```bash
pi install git:github.com/saltfishpr/pi-sandbox
```

## Usage

Just run `pi` normally. When a session starts, the following defaults are applied:

- **Read**: allow everything except `.env`, `.env.*`, and `~/.ssh`, which require interactive authorization
- **Write**: allow the current working directory (`.`) and deny writes to `.env` and `.env.*`.
- **Network**: the domain allowlist defaults to `["*"]`.

To disable the sandbox for a single launch:

```bash
pi --no-sandbox
```

When approval is required, Pi prompts for the scope of the grant:

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

pi-sandbox reads config from two locations. **Project config has higher priority**. `network` and `filesystem` are merged field-by-field, while array values are replaced rather than concatenated; omitted fields inherit the global config and then the defaults:

- `~/.pi/agent/extensions/sandbox.json` (global)
- `<cwd>/.pi/extensions/sandbox.json` (project-local)

Full example:

```json
{
  "enabled": true,
  "network": {
    "allowedDomains": ["*"],
    "deniedDomains": [],
    "allowMachLookup": ["com.apple.SystemConfiguration.DNSConfiguration", "com.apple.SystemConfiguration.configd"]
  },
  "filesystem": {
    "denyRead": [".env", ".env.*", "~/.ssh"],
    "allowRead": [],
    "allowWrite": ["."],
    "denyWrite": [".env", ".env.*"]
  }
}
```

Field reference:

| Field | Type | Description |
| --- | --- | --- |
| `enabled` | `boolean` | Enable the sandbox |
| `network.allowedDomains` | `string[]` | Domain allowlist |
| `network.deniedDomains` | `string[]` | Domain denylist |
| `network.allowMachLookup` | `string[]` | Mach services accessible on macOS |
| `filesystem.denyRead` | `PathEntry[]` | Paths that require approval to read |
| `filesystem.allowRead` | `PathEntry[]` | Paths readable without approval |
| `filesystem.allowWrite` | `PathEntry[]` | Paths writable without approval |
| `filesystem.denyWrite` | `PathEntry[]` | Paths where writes are blocked |

### Permission rules

- **Read**: allowed by default. `allowRead` takes precedence over `denyRead`.
- **Write**: `denyWrite` takes precedence over `allowWrite`. If neither matches, Pi prompts for approval.
- **Linux**: Bash write access to a file is requested for its parent directory.

### Path matching rules

A `PathEntry` is a string or an object such as `{ "path": "/work/report*.txt", "literal": true }`. Use the object form to treat wildcard characters as part of the path name.

Paths in config are processed as follows:

- `~` is expanded to the user's home directory
- Relative paths are resolved against the current working directory
- Symbolic links are resolved to their real paths (`realpath`)

On macOS, use `/private/tmp` in `allowWrite` to allow writes anywhere under `/tmp`.

## License

[MIT](./LICENSE)
