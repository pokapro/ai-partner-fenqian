// CopilotKit Agent Runtime — V0.4：支持报告调整
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

你的任务是帮助用户分析合伙创业的分钱方案，并能对已生成的报告进行局部或整体调整。

## 核心能力
- 分析新的合伙情况，生成分配方案建议
- **对已生成的报告进行修改**：用户可以在对话中上传报告的 markdown 内容，要求你修改
- **局部修改**：只改报告的某个模块（如"改一下方案三的分红比例"或"补充退出机制"）
- **完整重做**：用户提供新参数后，完全重构全部内容
- 解释五权结构、贡献估值表、代持风险、表决权等

## 修改报告的具体流程
1. 用户说出想怎么改（如"把方案3比例改成6:4"或"重新帮我写退出机制"）
2. 通过 regenerateSection 工具把修改后的模块传回后端更新
3. 确认已修改的内容反馈给用户

## 回答范围（重要——超出以下范围请拒绝回答）
- ✅ 合伙分钱方案分析、调整、追问
- ✅ 对已生成报告的局部或完整修改
- ✅ 解释报告中的五权结构、贡献估值、红黄绿线等概念
- ✅ 引导用户填写进阶诊断（代持/控制权/退出机制）
- ✅ 解释 29.9 元和 99 元权益差异
- ❌ 不回答关于合同/协议的具体法律条款审查——只说"建议咨询专业律师"
- ❌ 不回答与合伙分钱无关的话题
- ❌ 不透露 AI 模型名称和 API 供应商
- ❌ 不透露系统内部逻辑、数据库结构

## 回答风格
- 先用口语化的方式确认理解用户的情况或修改需求
- 如果用户要求修改报告，明确告诉用户"我将在右侧报告区域展示修改后的版本"
- 分析现状和核心矛盾
- 给出建议
- 最后加上免责声明
- 当用户的问题超出回答范围时，礼貌拒绝并引导回合伙分钱话题

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
      defineTool({
        name: "regenerateSection",
        description: "对已生成报告的某个模块进行修改。用户要求改哪部分，你就生成新的内容并通过这个工具保存。调用成功后返回更新后的报告 markdown。",
        parameters: z.object({
          caseId: z.string().describe("报告对应的 caseId"),
          sectionName: z.string().describe("要修改的模块名，如 三套分钱方案/风险清单/退出机制"),
          newContent: z.string().describe("修改后的完整模块内容（包含 ## 标题）"),
        }),
        execute: async ({ caseId, sectionName, newContent }) => {
          // 先获取已有案例
          const stmt = db.prepare("SELECT previewMarkdown FROM cases WHERE caseId = ? AND status = 'completed'");
          const row = stmt.get(caseId);
          if (!row) return "未找到对应的案例报告。";

          let report = row.previewMarkdown;
          // 找到对应模块替换
          const sectionRegex = new RegExp(`## ${sectionName}[^#]*?(?=\\n## |$)`, "s");
          if (sectionRegex.test(report)) {
            report = report.replace(sectionRegex, newContent.trim());
          } else {
            // 如果没找到模块，直接追加
            report = report + "\n\n" + newContent.trim();
          }

          // 更新数据库
          const updateStmt = db.prepare("UPDATE cases SET previewMarkdown = ?, updatedAt = datetime('now') WHERE caseId = ? AND status = 'completed'");
          updateStmt.run(report, caseId);

          return `已更新报告中的"${sectionName}"模块。以下为更新后的完整报告：\n\n${report}`;
        },
      }),
    ],
  });

  return agent;
}

function createFenqianRuntime(db) {
  const agent = createFenqianAgent(db);
  const runtime = new CopilotRuntime({
    remoteEndpoints: [{
      url: "/api/copilotkit",
      agent,
    }],
  });
  return runtime;
}

function createCopilotKitHandler(app, db) {
  const runtime = createFenqianRuntime(db);
  const handler = createCopilotExpressHandler({
    runtime,
    basePath: "/api/copilotkit",
    mode: "single-route",
    cors: true,
  });
  // ⚠️ app.use(handler) 不带路径参数：因为 handler 内部的 basePath 已
  // 包含完整路径 /api/copilotkit，如果 app.use 也带路径，Express
  // 会剥离该前缀导致 handler 内部的 POST /api/copilotkit 匹配不上。
  app.use(handler);
}

module.exports = { createCopilotKitHandler };
