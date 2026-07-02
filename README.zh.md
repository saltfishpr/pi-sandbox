# pi-sandbox

[Pi](https://pi.dev/) 扩展，为 bash 命令和 read/write/edit 工具提供操作系统级沙箱隔离，实施文件系统路径策略管控，支持 session 内交互式授权。

底层基于 [`@anthropic-ai/sandbox-runtime`](https://www.npmjs.com/package/@anthropic-ai/sandbox-runtime)，仅在 **macOS** 和 **Linux** 上生效；其他平台会自动回退为不启用沙箱。

## 安装

```bash
pi install git:github.com/saltfishpr/pi-sandbox
```

## 使用

正常运行 `pi` 即可。会话启动时使用如下默认配置：

- **读**：除 `.env`、`.env.*` 外全部放行
- **写**：仅允许当前工作目录（`.`）
- **网络**：全部域名放行（可通过配置调整）

若希望本次启动不启用沙箱，可加参数：

```bash
pi --no-sandbox
```

当代理尝试访问被拒路径时会弹出交互式提示：

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

pi-sandbox 从两个位置读取配置，**项目配置优先级更高**（同字段直接覆盖全局）：

- `~/.pi/agent/extensions/sandbox.json`（全局）
- `<cwd>/.pi/extensions/sandbox.json`（项目本地）

完整字段示例：

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

字段说明：

| 字段                     | 类型       | 说明                                               |
| ------------------------ | ---------- | -------------------------------------------------- |
| `enabled`                | `boolean`  | 是否启用沙箱，`false` 时行为与 `--no-sandbox` 等效 |
| `network.allowedDomains` | `string[]` | 允许访问的域名，`"*"` 表示全部放行                 |
| `network.deniedDomains`  | `string[]` | 显式拒绝的域名                                     |
| `filesystem.denyRead`    | `string[]` | 命中则触发交互式授权（未命中默认放行）             |
| `filesystem.allowRead`   | `string[]` | 在 `denyRead` 命中范围内的“豁免”路径               |
| `filesystem.allowWrite`  | `string[]` | 允许写入的路径，未命中则触发交互式授权             |
| `filesystem.denyWrite`   | `string[]` | 硬性拒绝写入，**不会**弹出授权提示                 |

### 权限规则

- **读**：默认放行；命中 `denyRead` 会触发授权提示；`allowRead` 用于在 `denyRead` 命中范围内做例外豁免。
- **写**：命中 `denyWrite` 直接阻断且**不弹提示**；命中 `allowWrite` 放行；未命中则触发授权提示。

### 路径匹配规则

配置中的路径经过以下处理：

- 支持 `~` 展开为用户主目录
- 相对路径基于当前工作目录解析
- 符号链接会被解析为真实路径（`realpath`）

## License

[MIT](./LICENSE)
