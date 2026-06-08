# 🤝 AI 合伙分钱方案生成器 V0.3

> 输入合伙人出资、出力、利润预期，AI 自动生成分钱方案、风险提示和条款草稿。

**线上地址**：https://ai-partner-fenqian.onrender.com

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + Vite + CopilotKit UI |
| 后端 | Express + SQLite (sql.js) |
| AI | DeepSeek Chat（兼容 OpenAI SDK） |
| Agent | CopilotKit BuiltInAgent + AG-UI Protocol |
| 部署 | Render（Free Plan） |

## 项目结构

```
ai-partner-fenqian/
├── src/                      # React 前端
│   ├── main.jsx              # 入口
│   ├── App.jsx               # CopilotKit Provider + Sidebar
│   ├── ChatApp.jsx           # 主业务界面（表单+报告+付款）
│   └── index.css             # 样式
├── public/                   # 旧前端（fallback）
├── server/                   # Express 后端
│   ├── index.js              # 路由+认证+启动
│   ├── db.js                 # SQLite 数据库
│   ├── ai.js                 # AI Provider 抽象
│   ├── prompt.js             # 系统/用户 Prompt
│   ├── report.js             # 利润模拟表
│   ├── matcher.js            # 知识库匹配引擎
│   ├── seed.js               # 种子数据（6案例+12规则+11模板）
│   └── copilotkit.js         # CopilotKit Agent runtime
├── data/                     # SQLite 数据文件（gitignored）
├── dist/                     # Vite 构建产物
├── .env                      # 环境变量（gitignored）
├── vite.config.js            # Vite 配置
├── start.sh                  # 启动脚本
└── package.json
```

## 核心 API

| 端点 | 用途 |
|---|---|
| `POST /api/generate` | **主生成接口** — 提交合伙信息，返回报告预览 |
| `POST /api/copilotkit` | **AI 顾问接口** — CopilotKit AG-UI 协议 |
| `PUT /api/cases/:id/payment` | 记录付款意向 |
| `GET /api/admin/knowledge-cases` | 后台查看知识案例（需 ADMIN_TOKEN） |
| `GET /api/health` | 健康检查 |

## 架构说明

### 双模式设计
- **主流程**：用户通过结构化表单提交 → `/api/generate` → 知识库自动匹配 → AI 生成方案 → 预览+付款转化
- **AI 顾问**：右侧 CopilotKit 聊天界面，辅助用户填写、解释方案、查询类似案例

### 知识库
- 6 条真实股权案例（含 3 条吴老师U盘数据）
- 12 条规则（Vesting、一致行动、分红上限、特殊性税务处理等）
- 11 条条款模板
- 通过 `matcher.js` 自动匹配，注入 AI 上下文

## 关键坑（CopilotKit 集成）

1. BuiltInAgent + defineTool 在 `@copilotkit/runtime/v2` 子路径
2. `COPILOTKIT_TELEMETRY_DISABLED=true` 必须设置
3. Express 用 `.use(router)` 而非 `.use("/api/...", handler)`
4. single-route 模式：`createCopilotExpressHandler({ runtime, basePath, mode: "single-route", cors: true })`

## 本地开发

```bash
cd ai-partner-fenqian
cp .env.example .env        # 填写 DEEPSEEK_API_KEY
npm install                 # 安装依赖
node server/index.js        # 启动后端（端口 3000）
npx vite build              # 构建前端
```

## 部署

Render 自动部署：push 到 `main` 分支即可触发。

启动命令（`./start.sh`）：
1. `npx vite build` — 构建前端
2. `node server/index.js` — 启动后端

## 法律声明

本系统生成的报告仅供参考，不构成正式法律意见。建议签署正式合伙协议前咨询专业律师。
