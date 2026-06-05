// System prompt for AI report generation

function buildSystemPrompt() {
  return `你是一位合伙创业分钱方案顾问，服务对象是小电商/直播电商合伙团队。
请根据用户提供的信息，生成《合伙分钱建议报告》。

边界：
1. 不提供正式法律意见。
2. 不承诺协议有效性。
3. 不处理已经发生的诉讼、债务纠纷、工商股权变更。
4. 所有建议必须说明依据，避免空话。
5. 若信息不足，必须列出需要补充的信息。

报告必须包含以下8个模块，每个模块用 ## 标题 分隔：

一、现状诊断
二、主要风险点
三、2-3 套分配方案
四、利润模拟
五、推荐方案
六、条款草稿
七、沟通话术
八、免责声明

### 历史案例参考

在用户信息之后，我会提供一些**历史类似案例**作为参考。这些案例与当前合伙场景（出资模式、出力类型）相近，你可以参考它们在分配方案选择上的实践经验。

重要规则：
1. **历史数据仅供参考**：每个合伙情况都是独特的，不能直接套用历史案例的分配比例。
2. **必须说明依据**：推荐某方案时，可以引用历史案例中提到的大致分配比例范围作为行业参考。
3. **禁止泄露隐私**：不可以输出具体的案例 ID 或任何用户个人信息。
4. **保持独立思考**：即使历史案例都采用同一种分配方案，你仍需要根据当前案例具体情况判断是否合适。

请以 Markdown 格式输出完整报告。`;
}

function buildUserPrompt(input) {
  const { partnerCount, partners, expectedProfit, oralAgreement, lossConcern, exitConcern } = input;

  let partnerDesc = partners.map((p, i) => {
    return `合伙人${p.name || String.fromCharCode(65 + i)}：
- 出资金额：${p.capital}元
- 出力类型：${p.effortType}
- 职责描述：${p.responsibility}`;
  }).join('\n\n');

  return `请根据以下合伙信息生成分钱建议报告：

合伙人数：${partnerCount}人

${partnerDesc}

预期年利润范围：${expectedProfit}
口头约定情况：${oralAgreement || '无'}
亏损承担担忧：${lossConcern || '无'}
退出机制需求：${exitConcern || '无'}

请按系统指令中要求的8个模块生成完整Markdown报告。`;
}

/**
 * Build the reference context block with similar cases and system stats.
 * This is attached to the AI messages as additional context.
 * @param {Array} similarCases - Array of de-identified case objects
 * @param {Object} stats - Aggregate case statistics
 * @returns {string} Formatted reference context
 */
function buildReferenceContext(similarCases, stats) {
  const lines = [];

  lines.push('---');
  lines.push('## 历史案例参考数据');
  lines.push('');
  lines.push('> ⚠️ 以下数据仅供参考。每个合伙情况都是独特的，请结合当前案例具体分析，切勿直接套用。');
  lines.push('');

  // System statistics
  lines.push('### 平台统计数据');
  lines.push(`- 平台已有案例总数：${stats.totalCases} 个`);
  lines.push(`- 已完成报告的案例：${stats.totalWithReport} 个`);

  if (Object.keys(stats.schemeAdoption).length > 0) {
    lines.push('- 各分配方案在已完成报告中的采纳情况：');
    for (const [scheme, count] of Object.entries(stats.schemeAdoption)) {
      const pct = Math.round(count / stats.totalWithReport * 100);
      lines.push(`  - ${scheme}：${count} 次（${pct}%）`);
    }
  }

  lines.push('');

  // Similar cases
  if (similarCases && similarCases.length > 0) {
    lines.push(`### 相似案例（${similarCases.length} 个）`);
    lines.push('');

    similarCases.forEach((c, i) => {
      lines.push(`**案例 ${i + 1}**：`);
      lines.push(`- 合伙人数：${c.partnerCount} 人`);
      lines.push(`- 出资金额：${c.totalCapital.toLocaleString()} 元`);
      lines.push(`- 出资模式：${c.fundingMode}`);
      lines.push(`- 出力类型：${c.effortTypes.filter(Boolean).join('、')}`);
      lines.push(`- 采用的分配方案：${c.allocationScheme}`);
      lines.push('');
    });
  } else {
    lines.push('### 相似案例');
    lines.push('暂未找到高度相似的过往案例。您可以根据自己的具体情况选择分配方案。');
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

module.exports = { buildSystemPrompt, buildUserPrompt, buildReferenceContext };
