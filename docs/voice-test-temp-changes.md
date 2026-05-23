# 语音测试临时改动（需还原）

## 待还原清单

### 1. .env 新增变量
文件: `/opt/aibot/cc-haha/cc-haha-v0.2.3/.env`
```
SERVER_HOST=0.0.0.0       # 对外暴露，测试完改回 127.0.0.1 或删除
```
还原: 删除这行

### 2. server 监听地址
server 从 127.0.0.1 改为 0.0.0.1，测试完需恢复。

### 3. nginx voice proxy
文件: `/www/server/panel/vhost/nginx/extension/cozeall_com/voice.conf`
```
location /voice { proxy_pass http://127.0.0.1:3456; }
location /ws/voice/ { proxy_pass http://127.0.0.1:3456; ... }
location /api/voice/ { proxy_pass http://127.0.0.1:3456; }
```
还原: `sudo rm /www/server/panel/vhost/nginx/extension/cozeall_com/voice.conf && sudo nginx -s reload`

### 4. cc-haha index.ts 新增 /voice 路由
文件: `src/server/index.ts`
还原: 删除 `/voice` 路由那段（约8行）

### 5. voice.html 测试页面
文件: `desktop/public/voice.html`
还原: 删除即可

### 6. voice API 鉴权豁免
文件: `src/server/index.ts` (约 line 251)
改动: `if (authRequired)` → `if (authRequired && !url.pathname.startsWith('/api/voice/'))`
还原: 删除 ` && !url.pathname.startsWith('/api/voice/')`

## 不需要还原的正常改动
- `src/server/voice/` 整个目录 — 语音 Runtime 正式代码
- `src/server/services/voice*` — 正式代码
- `docs/features/` — 正式文档
