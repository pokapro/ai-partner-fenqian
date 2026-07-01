# Staging 环境部署记录

## 基本信息
| 项目 | 内容 |
|------|------|
| 服务名 | ai-partner-fenqian-staging |
| URL | https://ai-partner-fenqian-staging.onrender.com |
| Service ID | srv-d8pq1nojs32c738vccm0 |
| 分支 | staging |
| 实例类型 | Free ($0/月) |
| 所在项目 | My project / Production |
| 仓库 | pokapro/ai-partner-fenqian |
| 提交 | 5f3332a — "chore: staging环境初始化" |
| 部署时间 | 2026-06-18 15:40 (Asia/Shanghai) |

## 环境变量
- PORT=3000
- DEEPSEEK_API_KEY=sk-1b598087d4ff47a6910dd5f3c220e874
- AI_PROVIDER=deepseek
- DEEPSEEK_MODEL=deepseek-chat

## 工作流
```
staging 分支 → 修改测试 → 合并到 main → main 自动部署到生产
```

## 本地操作
```bash
cd ~/pot/ai在线合伙分钱服务/
# 切到 staging 开发
git checkout staging
# 修改完成后
git add . && git commit -m "xxx"
git push origin staging
# staging 自动部署；测试通过后
git checkout main
git merge staging
git push origin main
```

## 2026-06-24 (Day 7) — V0.8 测试版 L0-L4 五段式部署

### 部署信息
| 项目 | 内容 |
|------|------|
| Commit | 1860463 |
| Service ID | srv-d8pq1nojs32c738vccm0 |
| Deploy ID | dep-d8tmt2baml3c73bkqme0 |
| 部署方式 | cherry-pick staging → push → API 触发 |
| 构建耗时 | ~78 秒 |
| URL | https://ai-partner-fenqian-staging.onrender.com/decision-tree.html |

### 工作流
1. main 分支已有 commit `5a680a9`（V0.8 L0-L4 五段式）
2. 切 staging → cherry-pick 73cabb5 + 5a680a9 → 无冲突
3. push origin staging → 自动触发的 deploy 被新 API 触发 deploy 取代（status: deactivated）
4. 手动 POST /v1/services/.../deploys → status: live

### 环境变量修复（部署前必修）
| Key | 修复前 | 修复后 |
|-----|--------|--------|
| DEEPSEEK_API_KEY | `sk-1b5…e874`（含 U+2026 省略号污染） | `sk-1b598087d4ff47a6910dd5f3c220e874`（完整 ASCII） |
| DEEPSEEK_API_KEY_P1 | 未设置 | `sk-1b598087d4ff47a69` |
| DEEPSEEK_API_KEY_P2 | 未设置 | `10dd5f3c220e874` |

**根因**：v0.8.5 helper 要求「完整 key 污染时回落 P1+P2」，但 staging 上 P1/P2 都没设，导致 v0.8-dt-beta 的 `/api/decision-tree/generate-report` 报 DEEPSEEK_API_KEY 不可用。

**修复方法**：Render API DELETE 受污染 key → PUT 完整 key + P1 + P2（数组格式）→ 重新触发部署。

### 端到端验证（staging 线上）
1. **页面验证**：`/decision-tree.html` HTTP 200，含「决策树体验版 v0.8.0-beta」+ L0-L4 渲染函数 6 处
2. **决策树 start**：`/api/decision-tree/start` 返回 4 个 A/B/C/D 选项
3. **报告生成（咖啡店分红）**：42s 完成，3600 字符，L0-L4 全有，warning: None
4. **报告生成（异常处理-合伙人跑路）**：50s 完成，2772 字符，L0 推荐"失联强制退出条款 + 回购款提存"

### 下一步
- [ ] 老板在 staging 入口实测：https://ai-partner-fenqian-staging.onrender.com/decision-tree.html
- [ ] 验收通过后切回 main → `git merge staging` → 推送 → main 自动部署到生产

## 2026-06-24 (Day 7 续) — V0.8 测试版一键交付物

### 老板反馈
"为什么输出的内容，没有一件复制和一件下载文档呢"——指出现有版本缺交付物，AI 输出只是页面文本，没法保存到本地。

### 修复内容（commit e592a03 / f030b41）
新增 5 个交付按钮（操作栏第一行）：

| 按钮 | 行为 | 输出格式 |
|------|------|---------|
| 复制 Markdown | 调 navigator.clipboard.writeText | 完整 L0-L4 段（带 markdown 语法） |
| 复制纯文本 | 去掉 markdown 符号 | 可贴微信/邮箱 |
| 下载 .md | Blob + a.click() | `合伙分钱方案-YYYY-MM-DD_HHmm.md` |
| 下载 HTML | 完整 HTML 文档 | `合伙分钱方案-YYYY-MM-DD_HHmm.html`（含中文字体 + 打印样式） |
| 打印 / 导出 PDF | window.open + window.print() | 走浏览器原生打印（选「另存为 PDF」） |

### 容错处理
- 旧浏览器 / 非安全上下文：fallback 到 `document.execCommand('copy')` + textarea
- 按钮点击反馈：临时显示「✅ 已复制」+ 高亮 ring 动画
- 文件名自动时间戳：避免多次下载冲突

### 端到端验证（Playwright + staging URL）
1. API 拿报告 ✅（3366 字符，L0-L4 全有）
2. 页面注入报告 ✅
3. 5 个按钮 visible=True ✅
4. 下载 .md ✅（文件大小 3366 字符，含 L0-L4 五段）
5. 下载 .html ✅（11377 字符，含 DOCTYPE + L0/L1）
6. 复制 .md ✅（剪贴板 3366 字符含 L0-L4）
7. 复制反馈动画 ✅（「✅ 已复制 Markdown」）

### 截图
- `/tmp/dt_report_full.png`：完整报告区（L0-L4 五卡片 + 操作栏 + 交付按钮）
- `/tmp/dt_actionbar.png`：操作栏特写（5 个交付按钮清晰可见）

### 状态
- staging: f030b41 (已部署，状态: live)
- main: e592a03 (待合 staging 后部署到生产)
- 正式版入口 `/`: 完全未动
- CopilotKit: 完全未动
