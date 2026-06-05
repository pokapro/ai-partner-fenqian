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

报告必须包含以下10个模块，每个模块用 ## 标题 分隔：

一、现状诊断
二、主要风险点
三、2-3 套分配方案
四、利润模拟
五、推荐方案
六、条款草稿
七、沟通话术
八、免责声明

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

请按系统指令中要求的10个模块生成完整Markdown报告。`;
}

module.exports = { buildSystemPrompt, buildUserPrompt };
