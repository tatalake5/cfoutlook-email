// i18n for the frontend SPA (gettext style: the Chinese source string IS the key).
// - zh (default): t() returns the key itself, only {param} substitution is applied.
// - en: t() looks up I18N_EN; a missing entry falls back to the Chinese key, so an
//   untranslated string degrades gracefully instead of breaking the page.
// Backend API messages stay Chinese on the wire (external API contract unchanged);
// tServer() translates the known ones on display via exact match + regex patterns.
// NOTE for app.js authors: `t` is a global — never name a local/arrow param `t`.

var LANG = localStorage.getItem('lang') === 'en' ? 'en' : 'zh';

// ========== UI strings (key = Chinese source text) ==========
var I18N_EN = {
  // --- Shell: document titles, sidebar, topbar ---
  'Outlook 邮件管理': 'Outlook Email Manager',
  '登录 - Outlook 邮件管理': 'Sign in - Outlook Email Manager',
  '邮件管理': 'Mail Manager',
  '收起/展开菜单': 'Collapse / expand menu',
  '仪表盘': 'Dashboard',
  '邮箱账号': 'Accounts',
  '分组管理': 'Groups',
  '标签管理': 'Tags',
  '邮件查看': 'Emails',
  '临时邮箱': 'Temp Mail',
  '系统设置': 'Settings',
  'GitHub 开源地址': 'GitHub repository',
  'GitHub 开源': 'GitHub',
  '退出登录': 'Log out',
  '浅色': 'Light',
  '深色': 'Dark',
  '跟随系统': 'System',
  '切换语言': 'Switch language',
  '正在验证登录状态...': 'Verifying login...',

  // --- Login page ---
  '请输入密码登录系统': 'Enter your password to sign in',
  '登录密码': 'Password',
  '请输入密码': 'Enter password',
  '登 录': 'Sign In',
  '登录中...': 'Signing in...',
  '登录失败': 'Sign-in failed',
  '网络错误，请重试': 'Network error, please retry',
  '切换主题': 'Toggle theme',

  // --- Common ---
  '加载中...': 'Loading...',
  '操作成功': 'Done',
  '操作失败': 'Operation failed',
  '删除失败': 'Delete failed',
  '更新失败': 'Update failed',
  '保存失败': 'Save failed',
  '获取失败': 'Fetch failed',
  '取消': 'Cancel',
  '确定': 'OK',
  '处理中...': 'Processing...',
  '编辑': 'Edit',
  '删除': 'Delete',
  '复制': 'Copy',
  '已复制': 'Copied',
  '复制失败': 'Copy failed',
  '保存': 'Save',

  // --- Dashboard ---
  '分组数量': 'Groups',
  '活跃': 'Active',
  '异常': 'Error',
  '停用': 'Disabled',
  '点击进入': 'Open',
  '还没有添加邮箱账号': 'No email accounts yet',
  '前往添加': 'Add one now',
  '账号健康度': 'Account health',
  '待修复账号（点击直达编辑）': 'Accounts needing attention (click to edit)',
  '点击打开编辑，重新授权修复': 'Open the editor and re-authorize to fix',
  '去修复 →': 'Fix →',
  '还有 {n} 个异常账号，': '{n} more accounts with errors, ',
  '查看全部': 'view all',
  '✓ 所有账号授权状态正常': '✓ All accounts are authorized and healthy',
  '分组账号分布': 'Accounts per group',
  '暂无分组数据': 'No group data yet',
  '其余 {g} 个分组共 {n} 个账号': '{n} accounts in {g} more groups',
  '{n} 个账号': '{n} accounts',

  // --- Groups page ---
  '{n} 个分组': '{n} groups',
  '+ 新建分组': '+ New Group',
  '暂无分组': 'No groups yet',
  '名称': 'Name',
  '颜色': 'Color',
  '描述': 'Description',
  '账号数': 'Accounts',
  '操作': 'Actions',
  '默认分组': 'Default group',
  '编辑分组': 'Edit Group',
  '新建分组': 'New Group',
  '名称不能为空': 'Name is required',
  '确认删除该分组？该分组下的邮箱将移至默认分组。': 'Delete this group? Its accounts will be moved to the default group.',
  '分组已删除': 'Group deleted',

  // --- Tags page ---
  '{n} 个标签': '{n} tags',
  '+ 新建标签': '+ New Tag',
  '暂无标签。标签可给一个账号打多个，用于跨分组筛选。': 'No tags yet. An account can carry multiple tags, useful for filtering across groups.',
  '标签': 'Tags',
  '编辑标签': 'Edit Tag',
  '新建标签': 'New Tag',
  '确认删除该标签？已打此标签的账号会移除该标签（不影响账号本身）。': 'Delete this tag? It will be removed from tagged accounts (the accounts themselves are not affected).',
  '标签已删除': 'Tag deleted',

  // --- Accounts page ---
  '全部分组': 'All groups',
  '全部状态': 'All statuses',
  '全部标签': 'All tags',
  '搜索邮箱或备注...': 'Search email or remark...',
  '+ 添加账号': '+ Add Account',
  '批量导入': 'Bulk Import',
  '导出全部': 'Export All',
  '已选 {n} 个': '{n} selected',
  '未选中': 'None selected',
  '批量测试': 'Batch Test',
  '移动分组': 'Move to Group',
  '批量启用': 'Enable',
  '批量停用': 'Disable',
  '导出选中': 'Export Selected',
  '批量删除': 'Delete',
  '取消选择': 'Clear',
  '暂无账号，点击"添加账号"开始': 'No accounts yet - click "Add Account" to get started',
  '邮箱': 'Email',
  '分组': 'Group',
  '状态': 'Status',
  '备注': 'Remark',
  '每页': 'Per page',
  '条': 'rows',
  '上一页': 'Prev',
  '下一页': 'Next',
  '查看该账号邮件': 'View emails of this account',
  '复制邮箱': 'Copy email address',
  '测试': 'Test',
  '测试中...': 'Testing...',
  '连接失败': 'Connection failed',
  'Graph API 连接正常': 'Graph API connection OK',
  '单次最多测试 {n} 个账号，请分批选择': 'Max {n} accounts per batch - please select in batches',
  '全部连接正常 ({n} 个)': 'All connections OK ({n})',
  '{ok} 个成功，{fail} 个失败': '{ok} succeeded, {fail} failed',
  'API': 'API',
  '对外 API 未启用，请先在「系统设置」生成 API Key': 'External API not enabled - generate an API key in Settings first',
  'API 调用命令已复制': 'API command copied',
  '导出': 'Export',
  '启用': 'Enable',
  '确认批量删除 {n} 个账号？此操作不可撤销。': 'Delete {n} accounts? This cannot be undone.',
  '移动到分组': 'Move to Group',
  '目标分组': 'Target group',
  '请先选择账号': 'Select accounts first',
  '没有可导出的账号': 'No accounts to export',
  '导出账号 ({n} 个)': 'Export accounts ({n})',
  '导出内容（格式：邮箱----密码----client_id----refresh_token）': 'Exported data (format: email----password----client_id----refresh_token)',
  '复制全部': 'Copy All',
  '下载 TXT': 'Download TXT',
  '状态已更新': 'Status updated',
  '确认删除该账号？此操作不可撤销。': 'Delete this account? This cannot be undone.',
  '账号已删除': 'Account deleted',
  '更新成功': 'Updated',

  // --- Add account modal ---
  '添加账号': 'Add Account',
  '快捷方式：一键授权 Outlook 邮箱': 'Quick way: one-click OAuth for your Outlook account',
  '输入邮箱地址（可选，用于自动登录）': 'Email address (optional, used as login hint)',
  '一键授权': 'One-Click Auth',
  '点击后弹出微软登录窗口，授权成功后自动填入 Client ID 和 Refresh Token。<br><b style="color:var(--warning)">⚠️ 网页一键授权需注册自己的 Azure 应用</b>：默认 Thunderbird 公开 ID 仅用于桌面端，无法在网页授权（会报 redirect_uri 错误）。请把下面这个<b>回调地址</b>登记到你的 Azure 应用，并在下方 Client ID 填入你自己的应用 ID。':
    'Opens a Microsoft sign-in popup; on success the Client ID and Refresh Token are filled in automatically.<br><b style="color:var(--warning)">⚠️ Web one-click auth requires your own Azure app</b>: the default Thunderbird public ID is desktop-only and cannot authorize on the web (redirect_uri error). Register the <b>callback URL</b> below in your Azure app, and put your own app ID in the Client ID field.',
  '复制回调地址': 'Copy callback URL',
  '注册步骤见 {link}。若已有现成的 refresh_token，直接用「批量导入」或在下方手动填入即可，无需授权。': 'See the {link} for registration steps. If you already have a refresh_token, use Bulk Import or fill it in below - no authorization needed.',
  '部署教程': 'Deployment Guide',
  '方式二：手动授权（免注册 Azure，用默认 Thunderbird ID）': 'Method 2: manual auth (no Azure app needed, uses the default Thunderbird ID)',
  '① 点「打开授权页」登录并授权 → 浏览器会跳到一个打不开的 <code>https://localhost</code> 页面（<b>正常现象</b>）<br>② 复制浏览器<b>地址栏的完整网址</b>（含 <code>?code=...</code>）粘到下面 → ③ 点「提取并获取 Token」自动填入':
    '① Click "Open Auth Page", sign in and authorize → the browser lands on an unreachable <code>https://localhost</code> page (<b>this is expected</b>)<br>② Copy the <b>full URL from the address bar</b> (with <code>?code=...</code>) and paste it below → ③ Click "Get Token" to fill in automatically',
  '① 打开授权页': '① Open Auth Page',
  '② 粘贴跳转后的完整地址（或仅 code）': '② Paste the full redirected URL (or just the code)',
  '③ 获取 Token': '③ Get Token',
  '密码 (可选)': 'Password (optional)',
  '什么是 Client ID？': 'What is a Client ID?',
  'Client ID 是在 Azure 注册的应用标识。不同的 Client ID 有不同的权限配置：': 'A Client ID identifies an app registered in Azure. Different Client IDs carry different permission setups:',
  '<b>默认值</b>为 Mozilla Thunderbird 的公开 ID，已配置 Graph Mail.Read 权限，推荐使用': 'The <b>default value</b> is the public Mozilla Thunderbird ID with Graph Mail.Read permission - recommended',
  '如果你有<b>其他来源的 Client ID</b>（自己注册的 Azure 应用、或别人提供的），也可以替换': 'You may replace it with a <b>Client ID from another source</b> (your own Azure app, or one provided to you)',
  '注意：仅有 IMAP 权限的 Client ID <b>无法读取邮件</b>（测试连接会成功，但查看邮件报 401）': 'Note: a Client ID with only IMAP permission <b>cannot read mail</b> (connection test passes, but reading mail returns 401)',
  '遇到这种情况，请在编辑页面点"重新授权"切换到 Thunderbird 授权': 'If that happens, open the account editor and re-authorize with the Thunderbird ID',
  '邮箱、Client ID、Refresh Token 不能为空': 'Email, Client ID and Refresh Token are required',
  '添加成功': 'Added',
  '添加失败': 'Add failed',
  '获取授权链接失败': 'Failed to get the authorization URL',
  '请允许弹窗，或检查浏览器是否拦截了弹窗': 'Please allow popups - the browser may have blocked the window',
  '请粘贴跳转后的完整地址或 code': 'Paste the redirected URL or the code first',
  '获取中...': 'Fetching...',
  '获取 Token 失败': 'Failed to get the token',
  '已获取 Refresh Token 并自动填入': 'Refresh token fetched and filled in',
  '授权成功，已自动填入 Client ID 和 Refresh Token': 'Authorized - Client ID and refresh token filled in',
  '授权失败': 'Authorization failed',
  '授权失败：默认 Client ID 不支持网页授权。请注册自己的 Azure 应用，把弹窗里的回调地址登记进去，并在 Client ID 填入你的应用 ID（详见添加账号弹窗的说明）。':
    'Authorization failed: the default Client ID does not support web auth. Register your own Azure app, add the callback URL shown in the dialog, and put your app ID in the Client ID field (see the notes in the Add Account dialog).',

  // --- Import modal ---
  '账号数据 (每行一个: 邮箱----密码----client_id----refresh_token)': 'Account data (one per line: email----password----client_id----refresh_token)',
  '请输入账号数据': 'Enter account data first',
  '导入成功': 'Imported',
  '导入失败': 'Import failed',

  // --- Edit account modal ---
  '编辑账号': 'Edit Account',
  '获取账号详情失败': 'Failed to load account details',
  '该账号状态异常，Token 可能已过期': 'This account is in error state - its token may have expired',
  '点击下方"重新授权"获取新 Token。重新授权会使用 Thunderbird Client ID，这是推荐的方式。': 'Use "Re-authorize" below to get a new token. It uses the Thunderbird Client ID, which is the recommended way.',
  '重新授权（刷新 Token / 获取读写权限以删除邮件）': 'Re-authorize (refresh the token / gain read-write access to delete emails)',
  '⚠️ 默认 Thunderbird ID <b>不支持网页一键授权</b>（会报 redirect_uri 错误），请用「手动授权」：<br>① 点「打开授权页」登录授权 → ② 复制跳转后打不开的 <code>https://localhost?code=...</code> 完整网址 → ③ 点「获取 Token」自动填入下方。':
    '⚠️ The default Thunderbird ID <b>does not support web one-click auth</b> (redirect_uri error) - use manual auth instead:<br>① Click "Open Auth Page" and authorize → ② Copy the full unreachable <code>https://localhost?code=...</code> URL → ③ Click "Get Token" to fill in below.',
  '② 粘贴跳转后的完整地址': '② Paste the full redirected URL',
  '有自己的 Azure 应用（已登记回调地址）才可用': 'Only works with your own Azure app (callback URL registered)',
  '当前使用的 Client ID。不同来源的账号可能用不同的 ID，只要有 Graph Mail.Read 权限即可正常读取邮件。仅有 IMAP 权限的 ID 会导致测试成功但读邮件 401。':
    'The Client ID currently in use. Accounts from different sources may use different IDs; any ID with Graph Mail.Read permission can read mail. IMAP-only IDs pass the connection test but fail with 401 when reading mail.',
  '留空保持原值': 'Leave blank to keep the current value',
  '当前: {v}（已脱敏）。留空表示不修改，填入新值会覆盖。': 'Current: {v} (masked). Leave blank to keep it; a new value overwrites it.',
  '密码': 'Password',
  '暂无标签，可去「标签管理」创建': 'No tags yet - create them on the Tags page',

  // --- Emails page ---
  '暂无邮箱账号，请先添加账号': 'No email accounts yet - add one first',
  '点击选择 / 输入关键字筛选账号': 'Click to pick / type to filter accounts',
  '展开账号列表': 'Show account list',
  '无匹配账号': 'No matching accounts',
  '复制当前邮箱地址': 'Copy the current email address',
  '收件箱': 'Inbox',
  '垃圾箱': 'Junk',
  '已删除': 'Deleted',
  '全部（收件箱+垃圾箱）': 'All (Inbox + Junk)',
  '搜索邮件...': 'Search emails...',
  '重新拉取当前文件夹': 'Refetch the current folder',
  '刷新': 'Refresh',
  '请选择一个邮箱账号': 'Select an email account',
  '选择一封邮件查看详情': 'Select an email to view details',
  '加载邮件...': 'Loading emails...',
  '该文件夹暂无邮件': 'No emails in this folder',
  '加载更多': 'Load More',
  '已加载 {n} 封': '{n} loaded',
  '请先选择邮箱账号': 'Select an email account first',
  '加载详情...': 'Loading details...',
  '获取详情失败': 'Failed to load details',
  '发件人:': 'From:',
  '收件人:': 'To:',
  '抄送:': 'Cc:',
  '时间:': 'Date:',
  '已选 {n}': '{n} selected',
  '删除选中': 'Delete Selected',
  '确认删除这封邮件？（移至「已删除」文件夹）': 'Delete this email? (It moves to the Deleted Items folder.)',
  '确认删除选中的 {n} 封邮件？（移至「已删除」文件夹）': 'Delete the {n} selected emails? (They move to the Deleted Items folder.)',
  '加载附件...': 'Loading attachments...',
  '附件 ({n})': 'Attachments ({n})',
  '获取邮件失败': 'Failed to fetch emails',

  // --- Temp emails ---
  '{n} 个临时邮箱': '{n} temp mailboxes',
  '+ 生成临时邮箱': '+ New Temp Email',
  '暂无临时邮箱': 'No temp mailboxes yet',
  '选择一个临时邮箱查看邮件': 'Select a temp mailbox to view its messages',
  '生成成功': 'Created',
  '生成失败': 'Create failed',
  '确认删除该临时邮箱？': 'Delete this temp mailbox?',
  '暂无邮件': 'No messages',
  '← 返回列表': '← Back to list',

  // --- Settings page ---
  '登录密码 (当前: {v})': 'Login password (current: {v})',
  '未设置': 'not set',
  '输入新密码（留空不修改）': 'New password (leave blank to keep)',
  'GPTMail API Key (当前: {v})': 'GPTMail API Key (current: {v})',
  '输入 API Key': 'Enter API key',
  '站点标题': 'Site title',
  '保存设置': 'Save Settings',
  '对外 API': 'External API',
  '用 API Key 免登录拉取邮件（适合脚本自动取验证码）。详见 {link}。': 'Fetch emails with an API key, no login needed (great for scripts that grab verification codes). See the {link}.',
  'API 文档': 'API Docs',
  '未启用（点下方「生成 API Key」）': 'Not enabled (click "Generate API Key" below)',
  '调用示例': 'Example request',
  '你的邮箱': 'your@email.com',
  '重新生成': 'Regenerate',
  '生成 API Key': 'Generate API Key',
  '重新生成会使旧 Key 立即失效，确认？': 'Regenerating invalidates the old key immediately. Continue?',
  '停用后对外 API 将无法使用，确认？': 'The external API stops working once disabled. Continue?',
  '已生成': 'Generated',
  '已停用': 'Disabled',
  '定时刷新 Token': 'Scheduled Token Refresh',
  '定时自动刷新账号 Token，让长期不用的号也不过期。Cloudflare 每 6 小时唤醒一次，实际是否执行由下面的「间隔」决定。':
    'Refreshes account tokens on a schedule so rarely-used accounts never expire. Cloudflare wakes the worker every 6 hours; whether a run actually executes is decided by the Interval below.',
  '启用定时刷新': 'Enable scheduled refresh',
  '间隔（小时）': 'Interval (hours)',
  '每批数量（≤40）': 'Batch size (≤40)',
  '上次执行：{v}': 'Last run: {v}',
  '⚠️ 频率风险（请勿设太频繁）': '⚠️ Frequency risks (do not set it too often)',
  '<b>微软风控（最重要）</b>：refresh_token 每次刷新都会被微软轮换，高频自动刷新可能触发 Graph 限流（429），对「领来的」账号还可能被微软判定异常活动而<b>锁号</b>。Token 只要每隔几天被用到就不会过期，<b>没必要高频刷，建议间隔 ≥ 12 小时，默认 24 小时足够</b>。':
    '<b>Microsoft risk control (most important)</b>: Microsoft rotates the refresh_token on every refresh. High-frequency auto-refresh can trigger Graph throttling (429), and for third-party-sourced accounts may be flagged as abnormal activity and get the account <b>locked</b>. A token stays valid as long as it is used every few days - <b>there is no need to refresh often; interval ≥ 12 hours recommended, the default 24 hours is plenty</b>.',
  '<b>子请求限制</b>：免费层单次最多 50 个子请求，每个账号刷新占 1 个，故「每批」上限 40，超出的账号下一轮再刷。':
    '<b>Subrequest limit</b>: the free tier allows up to 50 subrequests per invocation and each account refresh uses one, so the batch cap is 40; remaining accounts are refreshed in the next round.',
  '<b>账号多时</b>：账号数 > 每批数量，会分多轮轮换刷新（按最久未刷新优先），不会一次刷完。':
    '<b>Many accounts</b>: when accounts exceed the batch size, they are refreshed in rotating rounds (least-recently-refreshed first), not all at once.',
  '<b>请求配额</b>：免费层 10 万次/天，定时任务本身消耗极小，正常用不会触顶。':
    '<b>Request quota</b>: the free tier allows 100K requests/day; the cron job itself uses very little, so normal use never hits the cap.',
  '立即刷新一批': 'Refresh Now',
  '刷新中...': 'Refreshing...',
  '已刷新': 'Refreshed',
  '刷新失败': 'Refresh failed',
  'Telegram 推送新邮件': 'Telegram Push for New Emails',
  '新邮件到达时推送到 Telegram（适合实时收验证码）。需先 {bot} 拿到 Bot Token，再给机器人发条消息后用 {userinfo} 获取 Chat ID。Cloudflare 每 5 分钟唤醒一次，推送延迟取决于邮件到达时刻与下一次唤醒的间隔，平均约 2~3 分钟、最长约 5 分钟；下面的「间隔」默认 1（每次唤醒都推，即最快），设得比 5 大则进一步拉长。':
    'Pushes new emails to Telegram (great for receiving verification codes in near real time). First {bot} to get a Bot Token, then message your bot once and use {userinfo} to get your Chat ID. Cloudflare wakes the worker every 5 minutes, so push delay depends on when an email arrives relative to the next wake-up - about 2-3 minutes on average, 5 minutes at most; the Interval below defaults to 1 (push on every wake-up, i.e. fastest), values above 5 stretch it further.',
  '用 @BotFather 创建机器人': 'create a bot with @BotFather',
  '启用推送': 'Enable push',
  '例如 123456789': 'e.g. 123456789',
  '间隔（分钟）': 'Interval (minutes)',
  '⚠️ 说明': '⚠️ Notes',
  '通过<b>轮询</b>实现（非微软实时推送），延迟取决于邮件到达与下次唤醒的间隔，<b>平均约 2~3 分钟、最长约 5 分钟</b>；间隔设得比 5 大则进一步拉长。':
    'Implemented by <b>polling</b> (not Microsoft push), so the delay depends on when an email arrives relative to the next wake-up - <b>about 2-3 minutes on average, 5 minutes at most</b>; intervals above 5 stretch it further.',
  '受子请求限制，每轮最多扫描 8 个账号、每账号最多推 3 条；账号多时按最久未扫优先轮换。':
    'Due to the subrequest limit, each round scans at most 8 accounts and pushes at most 3 emails per account; with many accounts it rotates least-recently-scanned first.',
  '首次为每个账号只记录水位、<b>不补推历史邮件</b>，之后只推新到达的邮件。':
    'The first run only records a watermark per account and <b>does not backfill old emails</b>; afterwards only newly arrived emails are pushed.',
  '发送测试消息': 'Send Test Message',
  '发送中...': 'Sending...',
  '已发送': 'Sent',
  '发送失败': 'Send failed',
  '立即推送一轮': 'Push Now',
  '推送中...': 'Pushing...',
  '已执行': 'Done',
  '推送失败': 'Push failed',
  '已保存': 'Saved',
  '没有需要更新的设置': 'Nothing to update',
  '设置已保存': 'Settings saved',
};

// ========== Backend message translations (display-side only) ==========
// Exact-match table. Anything not found here (or in the patterns below) is
// shown as-is, so an unmapped backend message just stays Chinese.
var SERVER_EN = {
  '请先登录': 'Please log in first',
  '资源不存在': 'Resource not found',
  '服务器内部错误': 'Internal server error',
  '数据库未就绪：远程库可能没迁移。请运行 wrangler d1 migrations apply outlook-email-db --remote':
    'Database not ready: the remote DB may not be migrated. Run: wrangler d1 migrations apply outlook-email-db --remote',
  '服务端密钥未配置：请用 wrangler secret put 设置 COOKIE_SECRET（和 ADMIN_PASSWORD）':
    'Server secrets missing: set COOKIE_SECRET (and ADMIN_PASSWORD) via wrangler secret put',
  '服务器内部错误，请检查部署配置（数据库迁移 / Secrets）': 'Internal server error - check deployment config (DB migrations / secrets)',
  '服务端未配置 COOKIE_SECRET：请运行 wrangler secret put COOKIE_SECRET': 'COOKIE_SECRET not configured: run wrangler secret put COOKIE_SECRET',
  '请输入密码': 'Please enter a password',
  '密码错误': 'Incorrect password',
  '密码长度至少为 4 位': 'Password must be at least 4 characters',
  '没有新账号被添加（可能格式错误或已存在）': 'No new accounts were added (bad format or already exist)',
  '邮箱、Client ID 和 Refresh Token 不能为空': 'Email, Client ID and Refresh Token are required',
  '邮箱格式不正确': 'Invalid email format',
  '账号添加成功': 'Account added',
  '邮箱已存在': 'Email already exists',
  '请选择账号': 'Select accounts first',
  '未知操作': 'Unknown action',
  '账号不存在': 'Account not found',
  '标签已更新': 'Tags updated',
  '状态更新成功': 'Status updated',
  '账号更新成功': 'Account updated',
  '更新失败，邮箱可能已存在': 'Update failed - the email may already exist',
  '账号已删除': 'Account deleted',
  'Graph API 连接正常': 'Graph API connection OK',
  'Graph API 连接失败': 'Graph API connection failed',
  '该账号已停用': 'This account is disabled',
  'Graph API 认证失败': 'Graph API authentication failed',
  '获取邮件失败': 'Failed to fetch emails',
  '邮件不存在': 'Email not found',
  '附件不存在': 'Attachment not found',
  '该附件不是文件附件，无法下载': 'This attachment is not a file attachment and cannot be downloaded',
  '请选择要删除的邮件': 'Select emails to delete first',
  '已删除': 'Deleted',
  '删除失败': 'Delete failed',
  '无删除权限：该账号是只读授权。请在「编辑账号 → 重新授权」重新授权以获取读写权限':
    'No delete permission: this account was authorized read-only. Re-authorize via Edit Account → Re-authorize to gain read-write access',
  '(无主题)': '(no subject)',
  '无主题': '(no subject)',
  '未知': 'Unknown',
  '未知发件人': 'Unknown sender',
  '分组名称不能为空': 'Group name is required',
  '分组创建成功': 'Group created',
  '分组名称已存在': 'Group name already exists',
  '分组不存在': 'Group not found',
  '分组更新成功': 'Group updated',
  '默认分组不能删除': 'The default group cannot be deleted',
  '分组已删除，邮箱已移至默认分组': 'Group deleted - its accounts were moved to the default group',
  '默认分组': 'Default Group',
  '请提供授权码 code': 'Missing authorization code',
  '未收到授权码': 'No authorization code received',
  '已生成新的 API Key': 'New API key generated',
  '已停用对外 API': 'External API disabled',
  '请先填写并保存 Bot Token 和 Chat ID': 'Fill in and save the Bot Token and Chat ID first',
  '测试消息已发送，请检查 Telegram': 'Test message sent - check Telegram',
  '没有需要更新的设置': 'Nothing to update',
  '标签名不能为空': 'Tag name is required',
  '标签已创建': 'Tag created',
  '创建失败，标签名可能已存在': 'Create failed - the tag name may already exist',
  '标签不存在': 'Tag not found',
  '更新失败，标签名可能已存在': 'Update failed - the tag name may already exist',
  '标签已删除': 'Tag deleted',
  'GPTMail API Key 未配置': 'GPTMail API key not configured',
  '生成临时邮箱失败': 'Failed to create the temp mailbox',
  '生成临时邮箱失败，API 返回异常': 'Failed to create the temp mailbox - unexpected API response',
  '临时邮箱创建成功': 'Temp mailbox created',
  '临时邮箱不存在': 'Temp mailbox not found',
  '临时邮箱已删除': 'Temp mailbox deleted',
  '尚未执行': 'Not run yet',
};

// Pattern table for backend messages with dynamic parts. Each entry is
// [regex, replacement] where replacement is a string ($1...) or a function.
var SERVER_EN_PATTERNS = [
  [/^成功添加 (\d+) 个账号$/, 'Added $1 accounts'],
  [/^已删除 (\d+) 个账号$/, 'Deleted $1 accounts'],
  [/^已移动 (\d+) 个账号$/, 'Moved $1 accounts'],
  [/^已启用 (\d+) 个账号$/, 'Enabled $1 accounts'],
  [/^已停用 (\d+) 个账号$/, 'Disabled $1 accounts'],
  // Batch email deletion summary: "已删除 N 封" + optional failure/skip/permission suffixes
  [/^已删除 (\d+) 封(?:，失败 (\d+) 封)?(?:，超出单次上限未处理 (\d+) 封（请分批）)?(。该账号为只读授权，请「编辑账号 → 重新授权」获取读写权限)?$/,
    function (m, del, failed, skipped, forbidden) {
      var s = 'Deleted ' + del;
      if (failed) s += ', ' + failed + ' failed';
      if (skipped) s += ', ' + skipped + ' skipped (over the per-run cap, retry in batches)';
      if (forbidden) s += '. This account is read-only - re-authorize via Edit Account to gain read-write access';
      return s;
    }],
  [/^删除失败: (.+)$/, 'Delete failed: $1'],
  [/^获取附件列表失败: (.+)$/, 'Failed to list attachments: $1'],
  [/^获取附件失败: (.+)$/, 'Failed to fetch the attachment: $1'],
  [/^数据库操作失败：([\s\S]*)$/, 'Database error: $1'],
  [/^换取令牌失败: ([\s\S]*)$/, 'Token exchange failed: $1'],
  [/^网络错误: ([\s\S]*)$/, 'Network error: $1'],
  [/^授权失败: ([\s\S]*)$/, 'Authorization failed: $1'],
  [/^发送失败：([\s\S]*)$/, 'Send failed: $1'],
  // Settings update summary: translate the known Chinese item labels in the list
  [/^已更新：(.*)$/, function (m, list) {
    var mapped = list.split(', ').map(function (item) {
      if (item === '登录密码') return 'login password';
      if (item === '站点标题') return 'site title';
      return item.replace(/^定时刷新-/, 'token-refresh-');
    });
    return 'Updated: ' + mapped.join(', ');
  }],
  // Cron result summaries (stored in DB, shown on the settings page)
  [/^(.+) 刷新 (\d+) 个：成功 (\d+)，失败 (\d+)$/, '$1 refreshed $2 accounts: $3 ok, $4 failed'],
  [/^(.+) 推送：扫描 (\d+) 个账号，发送 (\d+) 条，失败账号 (.*)$/, '$1 push: scanned $2 accounts, sent $3 messages, failed accounts: $4'],
];

// ========== Core API ==========

// Translate a UI string authored in this codebase. `params` fills {name} slots
// in both languages, e.g. t('已选 {n} 个', { n: 3 }).
function t(key, params) {
  var s = LANG === 'en' && Object.prototype.hasOwnProperty.call(I18N_EN, key) ? I18N_EN[key] : key;
  if (params) {
    for (var k in params) {
      if (Object.prototype.hasOwnProperty.call(params, k)) {
        s = s.split('{' + k + '}').join(String(params[k]));
      }
    }
  }
  return s;
}

// Translate a message that came from the backend API (or mixed sources).
// Safe to call on any string: unknown values pass through unchanged.
function tServer(msg) {
  if (LANG !== 'en' || typeof msg !== 'string' || !msg) return msg;
  if (Object.prototype.hasOwnProperty.call(SERVER_EN, msg)) return SERVER_EN[msg];
  for (var i = 0; i < SERVER_EN_PATTERNS.length; i++) {
    if (SERVER_EN_PATTERNS[i][0].test(msg)) return msg.replace(SERVER_EN_PATTERNS[i][0], SERVER_EN_PATTERNS[i][1]);
  }
  return msg;
}

// Apply translations to static DOM: data-i18n (textContent), data-i18n-title,
// data-i18n-placeholder. The attribute value is the Chinese key, so switching
// languages back and forth stays idempotent.
function applyI18nDom(root) {
  var scope = root || document;
  document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-CN';
  scope.querySelectorAll('[data-i18n]').forEach(function (el) {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  scope.querySelectorAll('[data-i18n-title]').forEach(function (el) {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  // Highlight the active language button (both toggles share data-lang)
  document.querySelectorAll('[data-lang]').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.lang === LANG);
  });
}

// Switch language in place: persist, re-apply static DOM texts, then let the
// page-specific hook (window.onLangChange) re-render dynamic content.
function setLang(lang) {
  if (lang !== 'zh' && lang !== 'en') return;
  if (lang === LANG) return;
  localStorage.setItem('lang', lang);
  LANG = lang;
  applyI18nDom();
  if (typeof window.onLangChange === 'function') window.onLangChange();
}

document.addEventListener('DOMContentLoaded', function () {
  applyI18nDom();
});
