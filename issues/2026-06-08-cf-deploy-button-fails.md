# 「Deploy to Cloudflare」一键部署按钮失败

- **日期**：2026-06-08
- **类型**：使用问题 / README 误导（按钮对本项目不适用）
- **影响**：用户点击 README 顶部的「Deploy to Cloudflare」按钮，Workers Builds 构建在 deploy 阶段失败。

## 现象

```
Executing user deploy command: npx wrangler deploy
...
Detected Project Settings:
  Worker Name: cf-outlook-email
  Framework: Hono
  Build Command: pnpm run build
  Output Directory: dist
? Do you want to modify these settings?
  Using fallback value in non-interactive context: no
✘ [ERROR] The detected framework ("Hono") cannot be automatically configured.
Failed: error occurred while running deploy command
```

## 根本原因

1. 仓库**没有提交 `wrangler.toml`**（已 gitignore，只留 `wrangler.toml.example`）。
   Workers Builds 找不到 wrangler 配置，退而**自动探测框架**。
2. 从 `package.json` 探测到 `hono` 依赖 → 套用「Hono」框架预设（期望 Vite 构建、输出到 `dist`）。
3. 本项目是自定义 Worker：`main = src/index.ts` + 静态资源（`[assets] directory=./public`），
   `build` 脚本是 `tsc --noEmit`（不产出 `dist`）。与 Hono 预设完全不符 →
   `The detected framework ("Hono") cannot be automatically configured` → 失败。

更根本的是：**即使框架检测通过，按钮也无法一键部署本项目**——它无法替新用户
创建 D1 数据库、回填 `database_id`、执行 migrations、设置 `ADMIN_PASSWORD` /
`COOKIE_SECRET`。这些账号专属资源与密钥必须手动配置。

## 处理

保留按钮（视觉/引流），但在 README 按钮下方**加醒目警示**，明确告知无法一键部署、
请按部署教程手动操作。中英文 README 均已添加。

- `README.md` / `README_EN.md`：按钮下新增 ⚠️ 说明 + 指向 `docs/GUIDE.md`。

## 备注 / 未做

- 未提交 `wrangler.toml`：即便提交（用占位 `database_id`），也只是把失败点从「框架检测」
  推迟到「D1 绑定不存在 / 密钥缺失」，仍非真正一键，且会泄露真实 database_id，故不做。
- 正确部署路径始终是 `docs/GUIDE.md` 的手动步骤（约 5 分钟）。
