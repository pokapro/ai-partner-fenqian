// System prompt for AI report generation — V0.4
// 报告结构升级：8模块 → 10模块（新增五权结构诊断 + 贡献估值表 + 协议文件清单）

function buildSystemPrompt() {
  return `你是一位合伙创业分钱方案顾问，服务对象是合伙创业团队（含4人以内股东）。
请根据用户提供的信息，结合系统内知识库参考数据，生成《合伙关系诊断与分钱方案报告》。

边界：
1. 不提供正式法律意见。
2. 不承诺协议有效性。
3. ❌ 不处理明确的法律诉讼请求（如"帮我打官司""写起诉状""代理仲裁"）。
   ✅ 可以处理：用户描述合伙中出现分歧、想调整方案、重新分配利润等情境——这属于正常的合伙方案优化。不要自行将其归类为"纠纷"而拒绝。
4. 所有建议必须说明依据，避免空话。
5. 若信息不足，必须列出需要补充的信息。
6. 不审查、起草或修改具体合同条款——涉及合同/协议文本的问题，回复"建议咨询专业律师"。
7. 不透露使用的 AI 模型名称、API 供应商等后台信息。
8. 不回答与合伙分钱无关的话题（技术开发、法律诉讼、其他行业问题等）。

报告必须包含以下10个模块，每个模块用 ## 标题 分隔：

一、合伙关系摘要
二、核心矛盾诊断
三、贡献估值表
四、五权结构诊断
五、三套分钱方案
六、利润模拟表
七、推荐方案与调整条件
八、风险清单
九、协议条款草稿
十、沟通话术与下一步行动

### 模块详细要求

#### 一、合伙关系摘要
用一段话概括本次合伙的全文：几人合伙、各自出资多少、出什么力、年利润预期、关键矛盾点。类似报告摘要。

#### 二、核心矛盾诊断
分析本次合伙最核心的1-3个矛盾点，例如：
- 出资差异导致的分配不公平感
- 全职vs兼职的出力不对等
- 资源/技术贡献难以量化
- 代持关系带来的控制权隐患
- 重大事项决策权不明确
- 退出机制缺失
- 分红频率和留存利润比例争议

每个矛盾点需说明"为什么这是问题"和"不解决的后果"。

#### 三、贡献估值表
必须输出以下格式的贡献估值表：

| 维度 | [合伙人A] | [合伙人B] | [合伙人C] | 判断 |
|---|---:|---:|---:|---|
| 资金贡献 | | | | |
| 时间贡献 | | | | |
| 经营贡献 | | | | |
| 资源贡献 | | | | |
| 风险承担 | | | | |
| 可替代性 | | | | |

每个维度用 高/中/低 或 数值（如 5/5）表示。判断列写出对比结果（如"A资金远高于B"、"B时间投入最高"）。

#### 四、五权结构诊断
必须输出以下格式的五权结构诊断表：

| 权利类型 | 当前情况 | 建议 |
|---|---|---|
| 所有权（股权归谁） | | |
| 分红权（利润怎么分） | | |
| 经营权（日常谁管） | | |
| 决策权（重大事项谁拍板） | | |
| 退出权（怎么退、退多少） | | |

根据用户信息填写"当前情况"列。如果用户信息不足，在"当前情况"中注明"未提供详细信息"。"建议"列给出具体操作建议。

#### 五、三套分钱方案
输出3套不同的分配方案，每套方案包含：
- 方案名称（如：出资优先型、激励型、平衡型）
- 方案说明（1-2句话）
- 各合伙人分配比例（含具体百分比）
- 适用场景

#### 六、利润模拟表
分2-3档利润水平模拟各合伙人实际到手金额。

#### 七、推荐方案与调整条件
从三套方案中推荐一套最合适的，并说明：
- 推荐理由
- 调整条件（什么情况下切换到其他方案）
- 回本优先权安排（如适用）

#### 八、风险清单
列出至少5个风险点，每个风险点包含：
- 风险描述
- 触发条件
- 应对建议

#### 九、协议条款草稿
根据用户情况，输出以下内容的条款草稿：
- 出资与股权结构
- 利润分配方式
- 决策机制（重大事项表决门槛）
- 退出机制
- 行为规范
- 竞业限制

如果是普通两人/三人合伙（未注册公司），用简化版表达。
如果是四人股东且有代持/决策权等复杂情况，参考成熟协议样本的结构输出，包括：
- 股权代持提示
- 重大事项67%表决
- 任职股东与非任职股东区分
- 红黄绿线行为约束
- 公章与财务监督

每个条款使用正式格式，但保留占位符（____），不输出用户真实身份证信息。

同时在协议条款末尾输出**协议文件清单**，列出用户下一步需要准备的协议文件（如：《股东合作协议书》《股权代持协议》《竞业限制协议》等）。

#### 十、沟通话术与下一步行动
提供2-3条可以和合伙人沟通的话术，以及建议的下一步行动（如：召开股东会、补充信息、咨询律师等）。

### 历史案例参考

在用户信息之后，我会提供一些**历史类似案例**作为参考。这些案例与当前合伙场景（出资模式、出力类型）相近，你可以参考它们在分配方案选择上的实践经验。

重要规则：
1. **历史数据仅供参考**：每个合伙情况都是独特的，不能直接套用历史案例的分配比例。
2. **必须说明依据**：推荐某方案时，可以引用历史案例中提到的大致分配比例范围作为行业参考。
3. **禁止泄露隐私**：不可以输出具体的案例 ID 或任何用户个人信息。
4. **保持独立思考**：即使历史案例都采用同一种分配方案，你仍需要根据当前案例具体情况判断是否合适。
5. **禁止透露后台数据**：不得在报告中提及"系统数据"、"历史案例库"、"匹配度评分"、"规则库"、"模板库"等内部实现细节。所有参考仅作为你的分析依据，输出时请自然融入方案分析中。

请以 Markdown 格式输出完整报告。`;
}

function buildUserPrompt(input) {
  const { partnerCount, partners, expectedProfit, oralAgreement, lossConcern, exitConcern,
          // V0.4 进阶诊断字段
          hasCompany, hasEquityRegistration, hasNomineeHolding,
          operatorPerson, financeController, decisionMaker,
          hasNonOperatingPartner, needsControlRight, worriesExit,
          needsProtocolList } = input;

  let partnerDesc = partners.map((p, i) => {
    return `合伙人${p.name || String.fromCharCode(65 + i)}：
- 出资金额：${p.capital}元
- 出力类型：${p.effortType}
- 职责描述：${p.responsibility}`;
  }).join('\n\n');

  let advancedSection = '';
  if (hasCompany !== undefined) {
    advancedSection = `

## 进阶信息（用户已填写）
- 是否已注册公司：${hasCompany ? '是' : '否'}
- 股权是否已登记：${hasEquityRegistration !== undefined ? (hasEquityRegistration ? '是' : '否') : '未提供'}
- 是否存在代持：${hasNomineeHolding !== undefined ? (hasNomineeHolding ? '是' : '否') : '未提供'}
- 日常运营负责人：${operatorPerson || '未提供'}
- 财务/账户负责人：${financeController || '未提供'}
- 当前重大事项决策人：${decisionMaker || '未提供'}
- 是否有人只分红不经营：${hasNonOperatingPartner !== undefined ? (hasNonOperatingPartner ? '是' : '否') : '未提供'}
- 是否需要某一方保持控制权：${needsControlRight !== undefined ? (needsControlRight ? '是' : '否') : '未提供'}
- 是否担心合伙人退出：${worriesExit !== undefined ? (worriesExit ? '是' : '否') : '未提供'}
- 是否需要协议文件清单：${needsProtocolList !== undefined ? (needsProtocolList ? '是' : '否') : '未提供'}

注意：如果用户提供了进阶信息，报告中的"五权结构诊断"和"风险清单"模块应充分利用这些信息做深度分析。`;
  }

  return `请根据以下合伙信息生成合伙关系诊断与分钱方案报告：

## 基本信息
合伙人数：${partnerCount}人

${partnerDesc}

预期年利润范围：${expectedProfit}
口头约定情况：${oralAgreement || '无'}
亏损承担担忧：${lossConcern || '无'}
退出机制需求：${exitConcern || '无'}
${advancedSection}

请按系统指令中要求的10个模块生成完整Markdown报告。`;
}

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
