# 一键授权报 `redirect_uri is not valid`

- **日期**：2026-06-08
- **类型**：使用问题 / 文档与提示改进（非代码逻辑 bug）
- **影响**：他人部署本项目后，点击「一键授权」弹出微软登录页即报错，无法通过网页完成 OAuth 授权。

## 现象

弹出的微软登录窗口报错：

```
invalid_request: The provided value for the input parameter 'redirect_uri' is not valid.
The expected value is a URI which matches a redirect URI registered for this client application.
```

授权 URL 形如：
`login.live.com/oauth20_authorize.srf?client_id=9e5f94bc-e8a4-4e73-b8be-6336...`
（`9e5f94bc-...` 即 Mozilla Thunderbird 公开 Client ID）

## 根本原因

一键授权流程在 `src/routes/oauth.ts` 中用 Worker 自身域名拼接回调地址：

```
redirect_uri = https://<worker-host>/api/oauth/callback
```

并使用默认的 **Thunderbird 公开 Client ID** 发起授权。但微软要求 `redirect_uri` 必须是
**该应用注册时登记过的回调地址**。Thunderbird 应用由 Mozilla 注册，登记的是桌面端回调
（`https://localhost` / nativeclient），**不可能包含任意部署者的 Worker 域名**，因此被拒。

关键约束：**你无法给一个不属于你的应用（Thunderbird）添加自己的回调地址。**

### 为什么作者本人没遇到

作者的账号是领来的、本身自带 refresh_token，走的是「批量导入」把现成 token 填入，
从未真正触发过网页一键授权，因此该问题一直潜伏未被发现。

## 解决方案（用户侧）

有两条路，二选一：

### 方案一（推荐给嫌麻烦的人）：手动授权，免注册 Azure

`https://localhost` 本就是 Thunderbird 公开应用登记过的回调地址，因此用默认 Client ID
也能授权。添加账号弹窗已内置「方式二：手动授权」做成半自动：

1. 点「① 打开授权页」→ 登录并授权
2. 浏览器跳到打不开的 `https://localhost?code=...`（正常现象），复制地址栏完整网址
3. 粘回输入框 → 点「③ 获取 Token」→ 后端用 `redirect_uri=https://localhost` 换取
   refresh_token 并自动填入

### 方案二：注册自己的 Azure 应用（一步到位的网页一键授权）

需由**部署者注册自己的 Azure 应用**：

1. Azure 门户 → 应用注册 → 新注册
2. 账户类型选「任何组织目录 + 个人 Microsoft 账户」（必须含个人账户）
3. 平台选 **Web**，重定向 URI 填 `https://<你的-worker-域名>/api/oauth/callback`
4. API 权限添加 Microsoft Graph 委托权限 `Mail.Read`、`offline_access`
5. 复制「应用程序(客户端) ID」，填入添加账号弹窗的 **Client ID** 框，再点一键授权

代码本身支持自定义 client_id，并通过 `state` 参数把它正确传回回调
（`public/assets/app.js` 的 `startOAuth`），链路无误，差的只是 Azure 注册与回调登记。

## 本次改动（代码 / 文档侧）

目的：让这个坑不再坑人——明确提示 + 降低操作门槛。分支 `feat/oauth-guidance`。

- **`src/routes/oauth.ts`**
  - 新增 `POST /api/oauth/exchange`：用 `redirect_uri=https://localhost` + 传入/默认 client_id
    服务端换取 refresh_token，支撑「免注册 Azure」的手动授权方案。
- **`public/assets/app.js`**
  - `toast()` 新增可选 `duration` 参数，便于错误提示停留更久。
  - 添加账号弹窗的「一键授权」区：明确标注默认 ID 不支持网页授权；新增**回调地址只读框 + 「复制回调地址」按钮**（值为 `location.origin + '/api/oauth/callback'`）；附部署教程链接。
  - 新增「方式二：手动授权（免注册 Azure）」区块 + `openManualAuth()` / `exchangeManualCode()`：
    打开 `https://localhost` 授权页 → 粘贴跳转网址 → 自动提取 code 并调 `/api/oauth/exchange` 填入。
  - OAuth 回调消息处理：识别 `redirect_uri` / `invalid_request` 错误，给出中文可操作提示（提示注册 Azure 应用、登记回调、填入自己的 Client ID）。
- **`docs/GUIDE.md`**
  - 「默认 Client ID」补充警告：默认 Thunderbird ID 无法用于网页一键授权，仅适用于批量导入/手动 token 与 `https://localhost` 手动流程。
  - 「自己注册 Azure 应用」：重定向 URI 改为 Worker 回调地址 `…/api/oauth/callback`（平台 Web），强调账户类型必须含个人账户。
  - 故障排查新增条目：`invalid_request … redirect_uri is not valid` 的原因与解决步骤。

## 备注 / 未做

- 未改变默认仍使用 Thunderbird Client ID（批量导入场景仍然适用，改默认会影响现有用户）。
- 可选的进一步增强（未做）：在「系统设置」里支持配置一个全局默认 Client ID，省去每次在弹窗手填。
