# pi-sandbox

[Pi](https://pi.dev/) 扩展，支持 **macOS** 和 **Linux**。使用 [`@anthropic-ai/sandbox-runtime`](https://www.npmjs.com/package/@anthropic-ai/sandbox-runtime) 隔离 Bash 命令，并为 Pi 的 `read`、`write`、`edit` 工具提供路径权限检查和交互式授权。

## 安装

需要 Node.js 22.12.0 或更高版本。

```bash
pi install git:github.com/saltfishpr/pi-sandbox
```

## 使用

正常运行 `pi` 即可。会话启动时使用如下默认配置：

- **读**：除 `.env`、`.env.*` 和 `~/.ssh` 需要交互式授权外，其他路径全部放行
- **写**：允许当前工作目录（`.`），禁止写入 `.env` 和 `.env.*`。
- **网络**：域名白名单默认为 `["*"]`。

若希望本次启动不启用沙箱，可加参数：

```bash
pi --no-sandbox
```

需要授权时，Pi 会提示选择授权范围：

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

选项含义：

| 选项      | 含义                                                 |
| --------- | ---------------------------------------------------- |
| `abort`   | 拒绝本次访问，工具调用被阻断                         |
| `session` | 仅本次会话放行，重启即失效（内存中记录，不写入配置） |
| `project` | 写入项目配置 `<cwd>/.pi/extensions/sandbox.json`     |
| `global`  | 写入全局配置 `~/.pi/agent/extensions/sandbox.json`   |

### 命令

| 命令               | 作用                                 |
| ------------------ | ------------------------------------ |
| `/sandbox`         | 查看当前配置、生效路径与会话临时授权 |
| `/enable-sandbox`  | 会话中途启用沙箱                     |
| `/disable-sandbox` | 会话中途关闭沙箱                     |

## 配置

pi-sandbox 从两个位置读取配置，**项目配置优先级更高**。数组会直接替换而非拼接；未指定的字段依次继承全局配置和默认配置：

- `~/.pi/agent/extensions/sandbox.json`（全局）
- `<cwd>/.pi/extensions/sandbox.json`（项目本地）

完整字段示例：

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

字段说明：

| 字段                      | 类型          | 说明                         |
| ------------------------- | ------------- | ---------------------------- |
| `enabled`                 | `boolean`     | 是否启用沙箱                 |
| `network.allowedDomains`  | `string[]`    | 域名白名单                   |
| `network.deniedDomains`   | `string[]`    | 域名黑名单                   |
| `network.allowMachLookup` | `string[]`    | macOS 上允许访问的 Mach 服务 |
| `filesystem.denyRead`     | `PathEntry[]` | 需要授权才能读取的路径       |
| `filesystem.allowRead`    | `PathEntry[]` | 直接允许读取的路径           |
| `filesystem.allowWrite`   | `PathEntry[]` | 直接允许写入的路径           |
| `filesystem.denyWrite`    | `PathEntry[]` | 禁止写入的路径               |

### 权限规则

- **读**：默认允许。`allowRead` 优先于 `denyRead`。
- **写**：`denyWrite` 优先于 `allowWrite`。两者均未命中时请求授权。
- **Linux**：文件的 Bash 写入授权按父目录申请。

### 路径匹配规则

`PathEntry` 可以是字符串，也可以是 `{ "path": "/work/report*.txt", "literal": true }` 这样的对象。如果通配符是路径名的一部分，使用对象形式。

配置中的路径经过以下处理：

- 支持 `~` 展开为用户主目录
- 相对路径基于当前工作目录解析
- 符号链接会被解析为真实路径（`realpath`）

在 macOS 上，要允许写入整个 `/tmp`，请在 `allowWrite` 中填写 `/private/tmp`。

## License

[MIT](./LICENSE)
