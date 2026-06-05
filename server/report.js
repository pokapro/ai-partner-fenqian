// Report utility functions

/**
 * Generate profit simulation table data (programmatic, not AI-generated)
 * @param {Array} partners - [{name, capital, effortType, responsibility}]
 * @param {number} profitLevels - [300000, 500000, 1000000]
 * @returns {string} Markdown table
 */
function generateProfitTable(partners, profitLevels = [300000, 500000, 1000000]) {
  const totalCapital = partners.reduce((sum, p) => sum + (Number(p.capital) || 0), 0);

  // Calculate allocation weights:
  // 50% weight on capital contribution, 50% on effort/role
  const effortWeights = partners.map(p => getEffortWeight(p.effortType || ''));
  const totalEffortWeight = effortWeights.reduce((a, b) => a + b, 0);

  let rows = [];
  let header = '| 年利润 | ' + partners.map(p => p.name).join(' 分得 | ') + ' | 说明 |\n';
  header += '| --- | ' + partners.map(() => '---').join(' | ') + ' | --- |\n';

  for (const profit of profitLevels) {
    const allocations = [];
    let remaining = profit * 0.5; // 50% of profit for capital-based split
    let effortPool = profit * 0.5; // 50% for effort-based split

    for (const p of partners) {
      const capitalRatio = totalCapital > 0 ? (Number(p.capital) || 0) / totalCapital : 1 / partners.length;
      const effortRatio = totalEffortWeight > 0 ? getEffortWeight(p.effortType || '') / totalEffortWeight : 1 / partners.length;

      const capitalShare = remaining * capitalRatio;
      const effortShare = effortPool * effortRatio;
      const total = Math.round(capitalShare + effortShare);
      allocations.push(total);
    }

    let explanation = '资金5:出力5分配';
    rows.push(`| ${(profit / 10000).toFixed(0)}万 | ${allocations.map(a => a.toLocaleString() + '元').join(' | ')} | ${explanation} |`);
  }

  return header + rows.join('\n');
}

/**
 * Get effort weight based on effort type
 */
function getEffortWeight(effortType) {
  const weights = {
    '全职': 5,
    '全职运营': 5,
    '全职技术': 5,
    '兼职': 2,
    '兼职运营': 2,
    '兼职技术': 2,
    '仅出资': 1,
    '出资': 1,
    '技术': 3,
    '资源': 3,
    '供应链': 3,
    '运营': 3,
    '主播': 3,
  };
  // partial match
  for (const [key, val] of Object.entries(weights)) {
    if (effortType.includes(key)) return val;
  }
  return 2; // default weight
}

module.exports = { generateProfitTable, getEffortWeight };
