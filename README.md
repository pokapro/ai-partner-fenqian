# AI 合伙分钱方案生成器 V0

一个用于验证"合伙分钱方案"付费意愿的最小可行产品。

## 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（可选，默认使用 Ollama 本地）
cp .env.example .env
# 编辑 .env 文件设置 AI provider

# 3. 启动
npm start

# 4. 打开浏览器
open http://localhost:3000
```

## 环境变量

参见 `.env.example`。

支持的 AI Provider：
- `ollama`（默认）- 本地模型，无需 API Key
- `glm` - 智谱 GLM Flash
- `qwen` - 通义千问

## 项目结构

```
├── package.json
├── README.md
├── .env / .env.example
├── data/
│   ├── app.db          # SQLite 数据库
│   └── exports/        # 导出目录
├── public/
│   ├── index.html      # 前端首页
│   ├── styles.css      # 样式
│   └── app.js          # 前端交互
├── server/
│   ├── index.js        # Express 服务入口
│   ├── db.js           # SQLite 数据库操作
│   ├── ai.js           # AI 模型抽象
│   ├── prompt.js       # Prompt 模板
│   └── report.js       # 报告工具函数
└── docs/
    ├── test-cases.md   # 测试案例
    └── review-checklist.md
```

## API

### POST /api/generate
提交合伙信息，生成分钱方案报告。

### GET /api/cases
查看所有案例列表。

### GET /api/cases/:id
查看单个案例详情。

### PUT /api/cases/:id/payment
记录用户付款意向。

## 测试

浏览器控制台输入以下命令快速填充测试案例：

```js
fillTestCase(1)  // 案例1：一人出钱，一人全职
fillTestCase(2)  // 案例2：三人合伙
fillTestCase(3)  // 案例3：双方出钱，一方全职
```

## 预算控制

- 开发调试：Ollama 本地模型（免费）
- 线上：GLM Flash / 通义千问（低价 API）
- 数据库：SQLite（免费）
- 前端：Tailwind CDN（免费）
- 部署：可选 Vercel / Cloudflare Pages
- 预算上限：4000 元

## V0 范围

### 必须实现
- 移动端落地页
- 合伙信息表单
- AI 生成报告
- 报告预览
- 利润模拟表
- 付款意向记录
- SQLite 数据存储
- 人工审核状态

### 暂不实现
- 账号登录
- 正式微信支付
- 复杂后台权限
- 自动 Word 导出
- 多人协作
- 电商平台数据接入
- 法律咨询

## 免责声明

本工具仅提供参考性分钱方案建议，不构成正式法律意见。所有分配方案建议您在使用前咨询专业律师，并签署正式合伙协议。
