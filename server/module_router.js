// 模块路由引擎 — 按维度优先级组合输出
// 根据 scanner 检测结果决定走什么路径、展开什么模块
// 创建：2026-06-26 v1.0.0

const { scan, prioritize, buildDimensionSummary } = require('./scanner');
const { detectGap } = require('./framework_gaps');

// ============= 模块目录 =============

const MODULES = {
  // L1 基础模块（始终输出）
  BASE_EQUITY: { id: 'equity', label: '出资与股权比例', required: true },
  BASE_DIVIDEND: { id: 'dividend', label: '分红与亏损承担', required: true },
  BASE_EXIT: { id: 'exit', label: '主动/被动退出机制', required: true },
  BASE_BREACH: { id: 'breach', label: '违约责任与行为规范', required: true },
  BASE_DISPUTE: { id: 'dispute', label: '争议解决机制', required: true },

  // 场景模块（按维度命中加载）
  SCENE_STORE: { id: 'store', label: '实体门店专属（备用金/存货折旧/装修）', dim: 'industry', match: ['实体门店'] },
  SCENE_ECOMMERCE: { id: 'ecommerce', label: '电商直播专属（账号归属/IP/流量分成）', dim: 'industry', match: ['电商/直播'] },
  SCENE_TECH: { id: 'tech', label: '科技服务专属（技术入股/IP归属/vesting）', dim: 'industry', match: ['科技/服务'] },
  SCENE_FRANCHISE: { id: 'franchise', label: '连锁加盟专属（品牌隔离/区域合伙人/扩张）', dim: 'industry', match: ['连锁加盟'] },
  SCENE_PROJECT: { id: 'project', label: '单项目合伙专属（周期/收益分配/退出）', dim: 'industry', match: ['单项目合伙'] },
  SCENE_MANUFACTURING: { id: 'manufacturing', label: '生产制造专属（设备折旧/产能/供应链）', dim: 'industry', match: ['生产制造'] },

  // 治理模块（按治理维度命中加载）
  GOV_NOMINEE: { id: 'nominee', label: '代持安排专项', dim: 'governance' },
  GOV_CONCERT: { id: 'concert', label: '一致行动人专项', dim: 'governance' },
  GOV_BOARD: { id: 'board', label: '董事会设置专项', dim: 'governance' },
  GOV_VETO: { id: 'veto', label: '一票否决权专项', dim: 'governance' },
  GOV_CONTROL: { id: 'control', label: '控制权设计专项', dim: 'governance' },

  // 资本模块（按资本维度命中加载）
  CAP_VALUATION_ADJ: { id: 'valuation_adj', label: '对赌条款专项', dim: 'capital' },
  CAP_ANTIDILUTION: { id: 'antidilution', label: '反稀释条款专项', dim: 'capital' },
  CAP_LIQUIDATION: { id: 'liquidation', label: '优先清算权专项', dim: 'capital' },
  CAP_OPTION: { id: 'option', label: '期权池/Vesting专项', dim: 'capital' },
  CAP_GP_LP: { id: 'gp_lp', label: 'GP LP架构专项', dim: 'capital' },
  CAP_AB_SHARE: { id: 'ab_share', label: 'AB股架构专项', dim: 'capital' },

  // 风险模块（按风险维度命中加载）
  RISK_EXIT: { id: 'risk_exit', label: '合伙人退出处理', dim: 'risk' },
  RISK_LOSS: { id: 'risk_loss', label: '亏损分担专项', dim: 'risk' },
  RISK_DEADLOCK: { id: 'risk_deadlock', label: '僵局破解机制', dim: 'risk' },
  RISK_MISSING: { id: 'risk_missing', label: '失联处理专项', dim: 'risk' },
  RISK_DIVORCE: { id: 'risk_divorce', label: '婚变/继承对股权影响', dim: 'risk' },
  RISK_BREACH: { id: 'risk_breach', label: '违约处理专项', dim: 'risk' },
};

// ============= 路由主函数 =============

function route(text, state = {}) {
  // 1. 并行扫描所有维度
  const scans = scan(text);

  // 2. 检测 gap
  const gap = detectGap(text);

  // 3. 按优先级排序
  const sorted = prioritize(scans);

  // 4. 收集需要加载的模块
  const loadedModules = [];

  // 5 个基础模块始终加载
  for (const [key, mod] of Object.entries(MODULES)) {
    if (key.startsWith('BASE_')) {
      loadedModules.push({ ...mod, type: 'base' });
    }
  }

  // 场景模块按行业维度加载
  const industryVal = scans.industry?.value;
  if (industryVal) {
    for (const [key, mod] of Object.entries(MODULES)) {
      if (key.startsWith('SCENE_') && mod.match && mod.match.includes(industryVal)) {
        loadedModules.push({ ...mod, type: 'scene' });
      }
    }
  }

  // 治理/资本/风险模块按命中值加载
  const scanText = (scans.governance?.value || '') + (scans.capital?.value || '') + (scans.risk?.value || '');
  for (const [key, mod] of Object.entries(MODULES)) {
    if (key.startsWith('GOV_') || key.startsWith('CAP_') || key.startsWith('RISK_')) {
      if (scanText.includes(mod.label.replace('专项','').replace('处理',''))) {
        loadedModules.push({ ...mod, type: 'special' });
      }
    }
  }

  // 5. 构建输出结构
  const output = {
    scenario: buildDimensionSummary(scans, text),
    hasGap: gap.isGap,
    gapHits: gap.hits || [],
    gapCategory: gap.suggestedCategory || null,
    dimensions: scans,
    priority: sorted,
    modules: loadedModules,
    // 决定 L1+ 是否需要展开
    needsL1Plus: gap.isGap || scans.capital || scans.governance || scans.risk || false,
    // 决定是否需要追加追问
    needsFollowUp: !scans.industry || !scans.partnerCount || !scans.stage,
    missingItems: []
  };

  // 缺什么记录什么
  if (!scans.industry) output.missingItems.push('业务场景');
  if (!scans.partnerCount) output.missingItems.push('人数');
  if (!scans.stage) output.missingItems.push('公司状态');

  return output;
}

module.exports = { route, MODULES };
