// AI provider abstraction
// Supports: ollama (local), glm (智谱), qwen (通义千问), deepseek, mock (development only)

const { buildSystemPrompt, buildUserPrompt, buildReferenceContext } = require('./prompt');
const { buildKnowledgeContext } = require('./matcher');

const PROVIDERS = {
  // Mock provider for development without AI API
  mock: async (input, referenceContext, knowledgeContext) => {
    const { partnerCount, partners, expectedProfit, oralAgreement, lossConcern, exitConcern } = input;
    const names = partners.map(p => p.name).join('、');
    const caps = partners.map(p => `${p.name}（${p.capital}元，${p.effortType}）`).join('、');

    // Build a summary of reference data insights
    let refInsight = '';
    if (referenceContext) {
      const lines = referenceContext.trim().split('\n');
      const refLines = lines.filter(l => l.includes('方案') || l.includes('案例') || l.includes('统计')).slice(0, 5);
      refInsight = refLines.length > 0 ? '\n\n> 📊 参考数据摘要：' + refLines.join('；') : '';
    }

    let knowledgeNote = '';
    if (knowledgeContext && knowledgeContext.trim().length > 0) {
      knowledgeNote = '\n\n> 📋 本报告已参考系统内相似案例和规则库生成，完整版本需人工审核后交付。';
    }

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

**核心逻辑**：50% 按出资比例 + 50% 按出力贡献分配。${refInsight}

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

本报告由 AI 生成，仅供参考。不构成正式法律意见。建议签署正式合伙协议前咨询专业律师。${knowledgeNote}`;
  },

  ollama: async (input, referenceContext, knowledgeContext) => {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
    const messages = buildMessages(input, referenceContext, knowledgeContext);
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: 0.7 }
      })
    });
    if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
    const data = await res.json();
    return data.message?.content || data.response || '';
  },

  glm: async (input, referenceContext, knowledgeContext) => {
    const apiKey = process.env.GLM_API_KEY;
    if (!apiKey) throw new Error('GLM_API_KEY not set');
    const model = process.env.GLM_MODEL || 'glm-4-flash';
    const messages = buildMessages(input, referenceContext, knowledgeContext);
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7
      })
    });
    if (!res.ok) throw new Error(`GLM API error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  },

  deepseek: async (input, referenceContext, knowledgeContext) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const messages = buildMessages(input, referenceContext, knowledgeContext);
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7
      })
    });
    if (!res.ok) throw new Error(`DeepSeek API error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  },

  qwen: async (input, referenceContext, knowledgeContext) => {
    const apiKey = process.env.QWEN_API_KEY;
    if (!apiKey) throw new Error('QWEN_API_KEY not set');
    const model = process.env.QWEN_MODEL || 'qwen-turbo';
    const messages = buildMessages(input, referenceContext, knowledgeContext);
    const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: {
          messages
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

/**
 * Build the messages array for all real AI providers.
 * Adds reference context as a separate system message for clarity.
 * Also adds knowledge context (matched cases + rules + templates).
 */
function buildMessages(input, referenceContext, knowledgeContext) {
  const messages = [
    { role: 'system', content: buildSystemPrompt() }
  ];

  // Add reference context if available (from cases table matching)
  if (referenceContext) {
    messages.push({
      role: 'system',
      content: `以下是来自平台数据库的参考信息，请参考这些数据给出更贴合实际的建议：

${referenceContext}

注意：这些数据仅作为背景参考，每个合伙情况都是独特的，切勿直接套用历史案例的分配比例。`
    });
  }

  // Add knowledge context if available (from knowledge_cases + rules + templates)
  if (knowledgeContext && knowledgeContext.trim().length > 0) {
    messages.push({
      role: 'system',
      content: `以下是系统智能匹配的参考素材（相似案例、适用规则、条款模板），可以帮助你更精准地出具方案：

${knowledgeContext}

重要约束：
1. 你可以参考这些素材中的方案思路、风险点、分配比例范围，但必须**结合当前案例具体分析**，不能直接照搬。
2. **禁止在报告中提及后台数据**：不要在报告中出现"系统匹配"、"案例库"、"匹配度"、"规则库"、"模板库"等字眼。
3. 如果你参考了某个案例的方案或规则，自然地将其融入分析逻辑中，不要单独列出"参考来源"。`
    });
  }

  messages.push({ role: 'user', content: buildUserPrompt(input) });

  return messages;
}

async function generateReport(input, dbRef = null) {
  const provider = process.env.AI_PROVIDER || 'mock';
  const fn = PROVIDERS[provider];
  if (!fn) throw new Error(`Unknown AI provider: ${provider}. Supported: ${Object.keys(PROVIDERS).join(', ')}`);

  // Fetch reference data from database if available
  let referenceContext = null;
  let knowledgeContext = null;

  if (dbRef && input.partners) {
    try {
      // Fetch legacy similar cases (from cases table)
      const similarCases = dbRef.findSimilarCases(input.partners, 5);
      const stats = dbRef.getCaseStats();
      if (similarCases.length > 0 || (stats && stats.totalCases > 0)) {
        referenceContext = buildReferenceContext(similarCases, stats);
      }

      // Fetch knowledge context (from knowledge_cases + rules + templates)
      knowledgeContext = buildKnowledgeContext(input, dbRef);
    } catch (dbErr) {
      console.error('Failed to fetch reference data from DB:', dbErr.message);
      // Continue without reference data - non-fatal
    }
  }

  const markdown = await fn(input, referenceContext, knowledgeContext);

  // validate: must contain at least some required sections
  const requiredSections = ['现状诊断', '主要风险点', '利润模拟', '免责声明'];
  const missing = requiredSections.filter(s => !markdown.includes(s));
  if (missing.length > 0) {
    throw new Error(`AI 报告缺失必要模块: ${missing.join('、')}，请重试`);
  }

  return markdown;
}

module.exports = { generateReport };
