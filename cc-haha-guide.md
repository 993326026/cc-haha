# cc-haha 运维指南

## 环境

- 安装路径: `/opt/aibot/cc-haha/cc-haha-v0.2.3/`
- 运行时: Bun v1.3.13
- 模型: DeepSeek API (`api.deepseek.com/anthropic`)

## 服务管理

```bash
# 启动/重启/停止
sudo systemctl restart cc-haha-server
sudo systemctl restart cc-haha-wechat
sudo systemctl status cc-haha-server

# 查看日志
sudo journalctl -u cc-haha-server -f
sudo journalctl -u cc-haha-server --since "5 min ago"
```

## 配置文件

- `~/.claude/cc-haha/settings.json` — 认证和模型配置
- `~/.claude/adapters.json` — WeChat 适配器绑定
- `/opt/aibot/cc-haha/cc-haha-v0.2.3/.env` — 环境变量

## 恢复步骤

```bash
cd /opt/aibot/cc-haha/cc-haha-v0.2.3
git log --oneline -5          # 查看最近提交
git reset --hard HEAD         # 恢复文件
sudo systemctl restart cc-haha-server
```

## 路径同步清单

版本升级时需要检查:
- systemd 服务文件路径
- settings.json 中的 env 配置
- adapters.json 绑定数据
- .env 环境变量

## API 接口

### 基础 API (端口 3456)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/sessions | 列出会话 |
| POST | /api/sessions | 创建会话 |
| DELETE | /api/sessions/:id | 删除会话 |
| GET | /api/sessions/:id/inspection | 会话详情和诊断 |
| WS | /ws/:id | WebSocket 客户端连接 |

### Session MCP 注入 API (v0.2.3+)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/sessions/:id/mcp-servers | 设置/注入动态 MCP 配置 |
| GET | /api/sessions/:id/mcp-servers | 查询已注入的 MCP 配置 |
| DELETE | /api/sessions/:id/mcp-servers/:name | 移除单个 MCP server |

POST 请求体:
```json
{
  "servers": {
    "fire-mgmt": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-stdio.cjs"],
      "env": { "FIRE_AI_TOKEN": "token" }
    }
  },
  "applyNow": true,
  "replace": false
}
```

- `replace=false` 合并到现有配置，`replace=true` 替换全部
- `applyNow=true` 立即下发到运行中的 CLI 会话
- 首版仅内存存储，服务重启后需由外部重新注入

### 自动权限批准

注入了动态 MCP 的 session，对应 MCP 工具（`mcp__<server>__*`）自动批准，
不进入 pending permission 队列。其他工具不受影响。

## 内存管理

- 建议只开 1 个 CLI 终端
- 跑 4-6 小时后 RSS 可能达到 600-800MB，建议重启 CLI
- `/compact` 可释放约 100MB

## 版本记录

### v0.2.3
- Session 级动态 MCP 注入 (fire-mgmt 集成)
- 自动权限批准
- MCP 重启后自动重新注入
