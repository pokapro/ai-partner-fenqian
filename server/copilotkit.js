// CopilotKit Agent Runtime — 已适配 DeepSeek + 知识库
const { BuiltInAgent, defineTool, CopilotRuntime } = require("@copilotkit/runtime/v2");
const { createCopilotExpressHandler } = require("@copilotkit/runtime/v2/express");
const { createOpenAI } = require("@ai-sdk/openai");
const { z } = require("zod");
const { buildKnowledgeContext } = require("./matcher");

function createFenqianAgent(db) {
  const deepseek = createOpenAI({
    baseURL: "https://api.deepseek.com/v1",
    apiKey: (process.env.DEEPSEEK_API_KEY_P1 || "") + (process.env.DEEPSEEK_API_KEY_P2 || ""),
  });

  const agent = new BuiltInAgent({
    model: deepseek.chat("deepseek-chat"),
    prompt: `你是"合伙算钱"的 AI 合伙人顾问。

你的任务是帮助用户分析合伙创业的分钱方案。

## 回答范围（重要——超出以下范围请拒绝回答）
- ✅ 合伙分钱方案分析（出资、出力、利润分配、分成比例）
- ✅ 合伙风险提示（出资不均衡、全职vs兼职、退出机制等）
- ✅ 解释页面表单字段怎么填（合伙人信息、出资金额、出力类型等）
- ✅ 对已生成的报告做追问和解释
- ❌ 不回答关于合同/协议的具体法律条款审查——只说"建议咨询专业律师"
- ❌ 不回答与合伙分钱无关的话题（比如天气、编程、其他行业）
- ❌ 不透露使用的 AI 模型名称和 API 供应商——只说"由 AI 驱动"
- ❌ 不透露系统内部逻辑、数据库结构、知识库具体来源

## 能力
- 理解用户的合伙情况（几人合伙、各自出多少钱、出多少力、年利润多少）
- 分析核心矛盾（出资不均衡、全职 vs 兼职、退出机制、分红频率等）
- 推荐合理的分配方案和分成比例
- 指出风险点并提供谈判建议

## 回答风格
- 先用口语化的方式确认理解用户的情况
- 分析现状和核心矛盾
- 给出 1-2 个可选方案（含具体百分比）
- 列出风险点
- 最后加上免责声明
- 当用户的问题超出回答范围时，礼貌拒绝并引导回合伙分钱话题，例如："这个问题超出了我的回答范围，我专注于帮您分析合伙分钱方案。请告诉我您的合伙情况？"

## 重要
- 你可以调用 getKnowledgeContext 工具来获取系统内相似案例和规则
- 参考这些结果来提升方案的专业度
- 自然地融入分析，不要直接说"我参考了案例库"
- 当被问及不在回答范围内的问题时，礼貌拒绝并引导回合伙分钱话题

## 免责声明
本报告由 AI 生成，仅供参考。不构成正式法律意见。`,
    maxSteps: 5,
    temperature: 0.7,
    tools: [
      defineTool({
        name: "getKnowledgeContext",
        description: "根据合伙人的出资、出力、利润情况，获取系统内匹配的相似案例、适用规则和条款模板。调用后获取参考素材，以制定更精准的分钱方案。",
        parameters: z.object({
          partners: z.array(z.object({
            name: z.string().describe("合伙人姓名"),
            capital: z.number().describe("出资金额（元）"),
            effortType: z.string().describe("出力类型：全职运营/兼职/不出力/仅出资/技术"),
            responsibility: z.string().describe("职责描述"),
          })).describe("合伙人列表"),
          annualProfit: z.number().describe("预计年利润（元）").optional(),
          oralAgreement: z.string().describe("口头约定内容").optional(),
        }),
        execute: async ({ partners, annualProfit, oralAgreement }) => {
          const input = { partners, annualProfit, oralAgreement };
          return buildKnowledgeContext(input, db) || "无匹配的参考素材。";
        },
      }),
    ],
  });

  return agent;
}

function setupCopilotKit(app, db) {
  const agent = createFenqianAgent(db);

  const runtime = new CopilotRuntime({
    agents: { fenqian: agent },
  });

  // Use single-route mode: single POST endpoint on /api/copilotkit
  const router = createCopilotExpressHandler({
    runtime,
    basePath: "/api/copilotkit",
    mode: "single-route",
    cors: true,
  });

  app.use(router);

  console.log("[copilotkit] ✅ Agent runtime on POST /api/copilotkit (DeepSeek, single-route)");
  return runtime;
}

module.exports = { createFenqianAgent, setupCopilotKit };
