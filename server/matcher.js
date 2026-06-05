// Matcher — 案例库 + 规则库 + 模板匹配引擎
// 完全基于权重评分，不依赖向量数据库

/**
 * 从 input 对象中提取合伙人数据，识别场景类型
 * @param {Object} input - { partnerCount, partners, expectedProfit, ... }
 * @returns {Object} 场景分类
 */
function classifyInput(input) {
  const partners = input.partners || [];
  const capitals = partners.map(p => Number(p.capital) || 0);
  const totalCapital = capitals.reduce((a, b) => a + b, 0);

  // 出资模式
  let fundingPattern;
  if (totalCapital === 0) {
    fundingPattern = '0元出资';
  } else if (capitals.every(c => c === 0)) {
    fundingPattern = '0元出资';
  } else if (capitals.some(c => c === 0)) {
    fundingPattern = '部分0元出资';
  } else if (capitals.every(c => c > 0 && Math.abs(c / capitals[0] - 1) < 0.01)) {
    fundingPattern = '等额出资';
  } else {
    fundingPattern = '不等额出资';
  }

  // 出力模式
  const effortTypes = partners.map(p => (p.effortType || '').trim()).filter(Boolean);
  const effortPattern = effortTypes.sort().join('+');

  // 场景类型
  let sceneType;
  const hasFullTime = effortTypes.some(e => e.includes('全职'));
  const hasInvestOnly = effortTypes.some(e => e.includes('仅出资') || e === '仅投资');
  if (hasFullTime && hasInvestOnly && partners.length === 2) {
    sceneType = '一人出资一人全职';
  } else if (hasFullTime && partners.length === 2) {
    sceneType = '双方出力';
  } else if (hasFullTime && partners.length === 3) {
    sceneType = '三人合伙';
  } else if (effortTypes.every(e => e.includes('仅出资') || e === '仅投资')) {
    sceneType = '纯出资合伙';
  } else {
    sceneType = '混合合伙';
  }

  // 口头约定特征
  const oralAgreement = input.oralAgreement || '';
  const hasOralAgreement = oralAgreement.length > 0;
  const hasOral5050 = oralAgreement.includes('五五') || oralAgreement.includes('50') || oralAgreement.includes('对半');
  const hasExitConcern = (input.exitConcern || '').length > 0;
  const hasLossConcern = (input.lossConcern || '').length > 0;

  // 亏损口头约定检测
  const hasLossOral = oralAgreement.includes('亏') || oralAgreement.includes('赔') || oralAgreement.includes('损');

  return {
    partnerCount: partners.length,
    fundingPattern,
    effortPattern,
    effortTypes,
    sceneType,
    totalCapital,
    hasOralAgreement,
    hasOral5050,
    hasExitConcern,
    hasLossConcern,
    hasLossOral,
    oralAgreement
  };
}

/**
 * 从 knowledge_cases 表中匹配相似案例
 * @param {Object} input - 原始用户输入
 * @param {Object} db - 数据库实例
 * @param {number} limit - 返回数量上限
 * @returns {Array} 匹配的案例列表（含评分）
 */
function matchKnowledgeCases(input, db, limit = 3) {
  const classified = classifyInput(input);
  if (!classified) return [];

  const allCases = db.getKnowledgeCases();
  const scored = [];

  for (const kc of allCases) {
    let score = 0;

    // 合伙人数相同：+20
    if (kc.partner_count === classified.partnerCount) score += 20;

    // scene_type 相同：+30
    if (kc.scene_type === classified.sceneType) score += 30;

    // funding_pattern 相同：+20
    if (kc.funding_pattern === classified.fundingPattern) score += 20;

    // effort_pattern 部分匹配：+20
    const kcEfforts = (kc.effort_pattern || '').split('+');
    const inputEfforts = classified.effortTypes;
    const overlap = kcEfforts.filter(e => inputEfforts.includes(e));
    if (overlap.length > 0) {
      score += 20;
    }

    // 有相同口头约定/亏损/退出顾虑：+10
    if (classified.hasOralAgreement && (kc.oral_agreement || '').length > 0) {
      // Check if oral agreement keywords match
      const inputOral = (classified.oralAgreement || '').toLowerCase();
      const kcOral = (kc.oral_agreement || '').toLowerCase();
      const sharedKeywords = ['五五', '对半', '按出资', '按出力', '按劳'];
      for (const kw of sharedKeywords) {
        if (inputOral.includes(kw) && kcOral.includes(kw)) {
          score += 10;
          break;
        }
      }
    }
    if (classified.hasLossConcern && (kc.risk_points || '').toLowerCase().includes('亏损')) {
      score += 10;
    }
    if (classified.hasExitConcern && (kc.risk_points || '').toLowerCase().includes('退出')) {
      score += 10;
    }

    if (score > 0) {
      scored.push({
        score,
        case: {
          id: kc.id,
          title: kc.title,
          sceneType: kc.scene_type,
          partnerCount: kc.partner_count,
          fundingPattern: kc.funding_pattern,
          effortPattern: kc.effort_pattern,
          profitRange: kc.profit_range,
          oralAgreement: kc.oral_agreement,
          coreConflict: kc.core_conflict,
          recommendedScheme: kc.recommended_scheme,
          allocationSummary: kc.allocation_summary,
          riskPoints: kc.risk_points,
          clauseTemplates: kc.clause_templates,
          negotiationTips: kc.negotiation_tips
        }
      });
    }
  }

  // 按评分降序
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * 从 rules 表中匹配规则
 * @param {Object} input - 原始用户输入
 * @param {Object} db - 数据库实例
 * @param {number} limit - 返回数量上限
 * @returns {Array} 匹配的规则列表（含评分）
 */
function matchRules(input, db, limit = 5) {
  const classified = classifyInput(input);
  if (!classified) return [];

  const allRules = db.getRules();
  const scored = [];

  for (const rule of allRules) {
    let score = 0;
    const conditions = (rule.trigger_conditions || '').toLowerCase();

    // Check each condition type
    if (conditions.includes('全职') && classified.effortTypes.some(e => e.includes('全职'))) {
      score += 20;
    }
    if (conditions.includes('0元') || conditions.includes('零出资')) {
      if (classified.fundingPattern === '0元出资' || classified.fundingPattern === '部分0元出资') {
        score += 25;
      }
    }
    if (conditions.includes('出资') && !conditions.includes('0元') && !conditions.includes('零出资')) {
      if (classified.fundingPattern === '不等额出资' || classified.fundingPattern === '等额出资') {
        score += 15;
      }
    }
    if (conditions.includes('口头') && classified.hasOralAgreement) {
      score += 15;
    }
    if (conditions.includes('五五') || conditions.includes('对半')) {
      if (classified.hasOral5050) score += 20;
    }
    if (conditions.includes('亏损') && classified.hasLossConcern) {
      score += 15;
    }
    if (conditions.includes('退出') && classified.hasExitConcern) {
      score += 15;
    }
    if (conditions.includes('两人') && classified.partnerCount === 2) {
      score += 10;
    }
    if (conditions.includes('三人') && classified.partnerCount === 3) {
      score += 10;
    }

    // Higher priority = bonus
    score += Math.max(0, (rule.priority || 50) - 50) * 0.5;

    if (score > 0) {
      scored.push({
        score,
        rule: {
          id: rule.id,
          ruleName: rule.rule_name,
          triggerConditions: rule.trigger_conditions,
          recommendation: rule.recommendation,
          riskLevel: rule.risk_level,
          priority: rule.priority
        }
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * 从 templates 表中匹配模板
 * @param {Object} input - 原始用户输入
 * @param {Object} db - 数据库实例
 * @returns {Object} { matched: Array, categories: Object }
 */
function matchTemplates(input, db) {
  const classified = classifyInput(input);
  const allTemplates = db.getTemplates();
  const matched = [];
  const categories = {};

  for (const tpl of allTemplates) {
    const type = tpl.template_type || '';
    const content = (tpl.content || '').toLowerCase();
    const tags = (tpl.tags || '').toLowerCase();
    let relevance = 0;

    // Match by type against scenario needs
    if (type === '分红' || type === 'profit_sharing') {
      relevance = 80; // 分红条款总是相关
    }
    if (type === '亏损承担' || type === 'loss') {
      if (classified.hasLossConcern) relevance = 90;
      else relevance = 60;
    }
    if (type === '退出' || type === 'exit') {
      if (classified.hasExitConcern) relevance = 90;
      else relevance = 50;
    }
    if (type === '账目' || type === 'accounting') {
      relevance = 60;
    }
    if (type === '职责' || type === 'duty') {
      relevance = 70;
    }

    // Tag matching bonus
    if (tags.includes(classified.sceneType.toLowerCase())) relevance += 10;

    if (relevance > 0) {
      matched.push({ relevance, template: tpl });
      if (!categories[type]) categories[type] = [];
      categories[type].push(tpl.title);
    }
  }

  matched.sort((a, b) => b.relevance - a.relevance);
  return { matched, categories };
}

/**
 * 构建完整的知识上下文（供 AI prompt 使用）
 * @param {Object} input - 原始用户输入
 * @param {Object} db - 数据库实例
 * @returns {string} 三段式上下文文本
 */
function buildKnowledgeContext(input, db) {
  const lines = [];

  // === 段1：匹配案例 ===
  const matchedCases = matchKnowledgeCases(input, db, 3);
  if (matchedCases.length > 0) {
    lines.push('---');
    lines.push('## 参考案例');
    lines.push('');
    lines.push('> ⚠️ 以下案例仅供参考。每个合伙情况都是独特的，请结合当前案例具体分析，切勿直接照搬。');
    lines.push('');

    matchedCases.forEach((m, i) => {
      const kc = m.case;
      lines.push(`**参考案例 ${i + 1}**（匹配度：${m.score}/100）`);
      lines.push(`- 场景：${kc.sceneType} | 合伙人 ${kc.partnerCount} 人 | 出资方式：${kc.fundingPattern} | 出力模式：${kc.effortPattern}`);
      if (kc.profitRange) lines.push(`- 利润范围：${kc.profitRange}`);
      if (kc.coreConflict) lines.push(`- 核心矛盾：${kc.coreConflict}`);
      lines.push(`- 推荐方案：${kc.recommendedScheme}`);
      lines.push(`- 分配要点：${kc.allocationSummary}`);
      if (kc.riskPoints) lines.push(`- 风险提示：${kc.riskPoints}`);
      if (kc.negotiationTips) lines.push(`- 谈判建议：${kc.negotiationTips}`);
      lines.push('');
    });
  }

  // === 段2：命中规则 ===
  const matchedRules = matchRules(input, db, 5);
  if (matchedRules.length > 0) {
    lines.push('### 适用规则');
    lines.push('');

    matchedRules.forEach((m, i) => {
      const r = m.rule;
      const riskEmoji = r.riskLevel === 'high' ? '🔴' : r.riskLevel === 'low' ? '🟢' : '🟡';
      lines.push(`${riskEmoji} **${r.ruleName}**（匹配度：${m.score}）`);
      lines.push(`  - 建议：${r.recommendation}`);
      lines.push('');
    });
  }

  // === 段3：可用模板 ===
  const templateResult = matchTemplates(input, db);
  if (templateResult.matched.length > 0) {
    lines.push('### 可用条款模板');
    lines.push('');

    // Show categories overview
    const catNames = Object.keys(templateResult.categories);
    lines.push(`适用条款类别：${catNames.join('、')}`);
    lines.push('');

    // Show top 5 most relevant templates
    templateResult.matched.slice(0, 5).forEach((m, i) => {
      lines.push(`**模板 ${i + 1}**【${m.template.template_type}】${m.template.title}`);
      lines.push('');
      lines.push(m.template.content);
      lines.push('');
    });
  }

  if (lines.length > 0) {
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = {
  classifyInput,
  matchKnowledgeCases,
  matchRules,
  matchTemplates,
  buildKnowledgeContext
};
