// AI provider abstraction
// Supports: ollama (local), glm (智谱), qwen (通义千问), mock (development only)

const { buildSystemPrompt, buildUserPrompt } = require('./prompt');

const PROVIDERS = {
  // Mock provider for development without AI API
  mock: async (input) => {
    const { partnerCount, partners, expectedProfit, oralAgreement, lossConcern, exitConcern } = input;
    const names = partners.map(p => p.name).join('、');
    const caps = partners.map(p => `${p.name}（${p.capital}元，${p.effortType}）`).join('、');

    return `## 一、现状诊断

${names}合伙创业，预计年利润 ${expectedProfit}。目前出资及出力情况如下：

${caps}

${oralAgreement ? `双方目前已有口头约定：${oralAgreement}` : '目前尚无明确的口头约定。'}

${lossConcern ? `关于亏损承担方面：${lossConcern}` : ''}

${exitConcern ? `关于退出机制方面：${exitConcern}` : ''}

## 二、主要风险点

1. **出资与出力不匹配风险**：出资多但出力少的合伙人可能分走过多利润，导致全职合伙人心态失衡。
2. **口头约定不清风险**：仅凭口头约定容易产生分歧。
3. **亏损承担不明风险**：合伙初期未明确亏损分配，一旦亏损可能产生纠纷。
4. **退出机制缺失风险**：没有退出条款，合伙人退出时难以公平处理。

## 三、方案一：保守型

**核心逻辑**：以出资比例为主要分配依据。

- 合伙人 A（${partners[0].capital}元）：按出资比例获得 ${Math.round(partners[0].capital / partners.reduce((s,p) => s + Number(p.capital), 0) * 100)}% 利润
- 合伙人 B（${partners[1].capital}元）：按出资比例获得 ${Math.round(partners[1].capital / partners.reduce((s,p) => s + Number(p.capital), 0) * 100)}% 利润

**适用场景**：双方都偏保守，希望投资风险与回报成正比。

## 四、方案二：平衡型

**核心逻辑**：50% 按出资比例 + 50% 按出力贡献分配。

- 出资部分：按出资比例分配 50% 利润
- 出力部分：按全职/兼职/资源等贡献分配 50% 利润

**适用场景**：适合一方出钱一方出力的典型合伙场景。

## 五、方案三：激励型

**核心逻辑**：先按贡献分配基础部分，超出预期利润部分给予全职运营方更大比例激励。

**适用场景**：业务增长潜力大，希望激励全职合伙人全力以赴。

## 六、利润模拟

请参考系统计算的利润模拟表（见报告末尾）。

## 七、推荐方案

推荐使用**方案二（平衡型）**，兼顾出资方和出力方的利益，是多数合伙场景的稳妥选择。

## 八、条款草稿

1. 本协议为合伙经营协议，各方按分配方案分享利润。
2. 亏损按同样分配比例承担。
3. 任何一方退出需提前 30 天通知，退出时按协商价格回购股份。
4. 重大决策需全体合伙人一致同意。
5. 本协议一式 ${partnerCount} 份，各执一份。

## 九、沟通话术

"我们先拿这套方案试一试，如果有不合适的地方随时商量调整。"

## 十、免责声明

本报告由 AI 生成，仅供参考。不构成正式法律意见。建议签署正式合伙协议前咨询专业律师。`;
  },

  ollama: async (input) => {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(input) }
        ],
        stream: false,
        options: { temperature: 0.7 }
      })
    });
    if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
    const data = await res.json();
    return data.message?.content || data.response || '';
  },

  glm: async (input) => {
    const apiKey = process.env.GLM_API_KEY;
    if (!apiKey) throw new Error('GLM_API_KEY not set');
    const model = process.env.GLM_MODEL || 'glm-4-flash';
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(input) }
        ],
        temperature: 0.7
      })
    });
    if (!res.ok) throw new Error(`GLM API error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  },

  deepseek: async (input) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(input) }
        ],
        temperature: 0.7
      })
    });
    if (!res.ok) throw new Error(`DeepSeek API error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  },

  qwen: async (input) => {
    const apiKey = process.env.QWEN_API_KEY;
    if (!apiKey) throw new Error('QWEN_API_KEY not set');
    const model = process.env.QWEN_MODEL || 'qwen-turbo';
    const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: {
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: buildUserPrompt(input) }
          ]
        },
        parameters: {
          temperature: 0.7,
          result_format: 'message'
        }
      })
    });
    if (!res.ok) throw new Error(`Qwen API error: ${res.status}`);
    const data = await res.json();
    return data.output?.choices?.[0]?.message?.content || '';
  }
};

async function generateReport(input) {
  const provider = process.env.AI_PROVIDER || 'mock';
  const fn = PROVIDERS[provider];
  if (!fn) throw new Error(`Unknown AI provider: ${provider}. Supported: ${Object.keys(PROVIDERS).join(', ')}`);

  const markdown = await fn(input);

  // validate: must contain at least some required sections
  const requiredSections = ['现状诊断', '主要风险点', '利润模拟', '免责声明'];
  const missing = requiredSections.filter(s => !markdown.includes(s));
  if (missing.length > 0) {
    throw new Error(`AI 报告缺失必要模块: ${missing.join('、')}，请重试`);
  }

  return markdown;
}

module.exports = { generateReport };
