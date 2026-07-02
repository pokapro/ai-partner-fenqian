// 框架树高级触发清单 — 记录用户提到的复杂合伙相关要素
// 作用：当 AI/用户触发高级事项时，把要素记录到这里，定期 review 是否升级为正式决策树模块
// 存储：data/framework_gaps.json（git 跟踪，部署重建不丢）
// 创建：2026-06-25 v1.0.0

const fs = require('fs');
const path = require('path');

const GAPS_FILE = path.join(__dirname, '..', 'data', 'framework_gaps.json');

// ===== 已知覆盖关键词（命中这些 = 已覆盖，不算 gap）=====
// 与 decision_tree.js 的 detectFromText + PROTOCOL_PACK_KEYWORDS 保持一致
const COVERED_KEYWORDS = {
  // 决策树已有 5 业务模式
  business: ['餐厅', '饭店', '餐饮', '开店', '门店', '实体', '奶茶', '咖啡',
             '直播', '电商', '淘宝', '抖音', '小红书', '带货',
             '科技', '服务', '咨询', '开发', '技术', 'saas',
             '单项目', '一单', '短期', '项目制',
             '加盟', '连锁', '分店', '扩店'],
  // 决策树已有 6+ 异常标签
  tags: ['退出', '退股', '不干了', '离职', '想走',
         '代持', '隐名', '显名股东', 'nominee',
         '竞业', '保密', '挖客户', '挖墙脚',
         '分红', '分钱', '利润分配',
         '一票否决', '控制权', '说了算', '表决权',
         '干股', '技术入股',
         '亏损', '赔了', '亏钱',
         '失联', '联系不上', '找不到人',
         '僵局', '谈不拢', '吵架'],
  // 决策树已有 5 必装基础模块（出资/分红/退出/违约/争议）
  core_modules: ['出资', '股权比例', '分红', '亏损', '退出', '回购', '违约金', '争议', '管辖', '仲裁', '诉讼'],
  // 决策树已有 5 场景专属模块（仅"提到了会触发 prompt 加载"的）
  // 注：以下词已经进入 L1+ 高级补充模块，但仍记录到清单，方便观察内测高频需求：
  //   - 期权池 / 员工持股 / ESOP
  //   - 反稀释 / 对赌 / 优先清算
  //   - AB 股 / 同股不同权
  scenario_modules_partial: ['代持', '一致行动', '表决权', '竞业禁止', '保密', '全职', '兼职',
                              '人力股', '技术股', '资源股', 'vesting', '动态股权'],
  // 协议包模式关键词
  protocol_pack: ['股东协议', '股东合作协议', '代持协议', '股权代持协议', '一致行动人协议',
                  '公司已注册', '工商登记', '已注册公司',
                  '帮我整理协议', '帮我生成协议',
                  '三份协议', '全套协议', '协议包', '帮我整理一份', '帮我生成一份']
};

// ===== 反向词典：把用户原话分类到 categories =====
// 命中关键词 → 推一个 category（不确定则 other）
const CATEGORY_HINTS = [
  { kw: ['反稀释', '反稀释条款', '加权平均', 'broad-based', 'narrow-based'], cat: 'control' },
  { kw: ['AB股', 'AB 股', '同股不同权', '双层股权', '超级投票权'], cat: 'control' },
  { kw: ['优先清算', '优先权', 'liquidation preference'], cat: 'fundraising' },
  { kw: ['对赌', '对赌协议', '业绩承诺', '回购承诺'], cat: 'fundraising' },
  { kw: ['期权', '期权池', '员工持股', '员工激励', '股权激励', 'ESOP', '限制性股票', 'RSU'], cat: 'vesting' },
  { kw: ['成熟', 'vesting', '分期成熟', '4 年成熟', 'cliff'], cat: 'vesting' },
  { kw: ['董事会', '董事席位', '独立董事', '监事会'], cat: 'governance' },
  { kw: ['GP', 'LP', '有限合伙', '持股平台'], cat: 'governance' },
  { kw: ['个税', '分红税', '核定征收', '税务筹划', '税收洼地'], cat: 'tax' },
  { kw: ['强制回购', '强制退出', '触发回购', '除名'], cat: 'exit_detail' },
  { kw: ['估值方法', '净资产法', '净资产', '原始出资', '市场法', 'DCF', '评估机构'], cat: 'exit_detail' },
  { kw: ['知识产权', 'IP', '专利', '商标', '软著', '技术入股评估'], cat: 'ip' },
  { kw: ['社保', '公积金', '劳动合同', '用工风险'], cat: 'labor' },
  { kw: ['婚姻', '离婚', '夫妻财产', '婚前协议', '继承', '身故', '遗产'], cat: 'marriage' },
  { kw: ['调解', '仲裁条款', '机构仲裁', '贸仲', '仲裁规则'], cat: 'dispute' },
];

// ===== 加载清单 =====
function loadGaps() {
  try {
    const raw = fs.readFileSync(GAPS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[framework_gaps] load failed, using empty:', e.message);
    return { version: '1.0.0', created_at: '2026-06-25', description: '', categories: {}, gaps: [] };
  }
}

// ===== 持久化 =====
function saveGaps(data) {
  try {
    fs.writeFileSync(GAPS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[framework_gaps] save failed:', e.message);
    return false;
  }
}

// ===== 核心：检测用户输入里有没有"相关但没有"的要素 =====
// 返回：{ isGap: bool, hits: [字符串], suggestedCategory: string, existingGapId: string|null }
function detectGap(text) {
  if (!text || typeof text !== 'string') return { isGap: false, hits: [], suggestedCategory: null };

  // 大小写归一化（中文不变，英文统一小写）
  const lower = text.toLowerCase();
  const textLower = lower; // 用于英文关键词匹配

  const knownWords = new Set();
  Object.values(COVERED_KEYWORDS).flat().forEach(w => knownWords.add(w.toLowerCase()));

  // 1. 抽取潜在新要素（简化版：找 2-12 字的中文词组 / 英文术语）
  //    这里用关键词扫：检测用户输入里有没有"已覆盖"列表里没有的"合伙相关"关键词
  const candidatePhrases = [];
  // 合伙相关触发词（用户提到这些词说明他在聊合伙相关的话题）
  // 大小写不敏感（用 lower 比较，但中文不受影响）
  const partnershipTriggers = ['合伙', '股东', '股权', '分红', '协议', '条款', '出资', '退出', '代持', '入股', '占股', '持股', '份额', '控制权',
                              '期权', '员工', 'esop', 'rsu', '限制性股票',
                              '稀释', '对赌', '清算', '优先',
                              '董事会', '董事', '监事', 'gp', 'lp', '有限合伙',
                              '个税', '税务', '税收',
                              '回购', '估值', '净资产',
                              '专利', '商标', '软著', '知识产权', 'ip',
                              '社保', '公积金', '劳动合同', '用工',
                              '婚姻', '离婚', '夫妻', '继承', '身故', '遗产',
                              '调解', '仲裁',
                              '激励', '上市',
                              // AB股/同股不同权类
                              'ab股', '同股不同权', '双层股权', '超级投票权', '加权平均',
                              // 期权相关
                              '成熟', 'vesting', 'cliff'];
  const isPartnershipRelated = partnershipTriggers.some(t => textLower.includes(t.toLowerCase()));

  if (!isPartnershipRelated) {
    return { isGap: false, hits: [], suggestedCategory: null };
  }

  // 2. 命中 CATEGORY_HINTS 的关键词 = 已知 gap 类别
  const hits = [];
  let suggestedCategory = null;
  for (const hint of CATEGORY_HINTS) {
    for (const kw of hint.kw) {
      // 大小写不敏感
      if (textLower.includes(kw.toLowerCase())) {
        hits.push(kw);
        if (!suggestedCategory) suggestedCategory = hint.cat;
      }
    }
  }

  if (hits.length === 0) {
    return { isGap: false, hits: [], suggestedCategory: null };
  }

  // 3. 检查是否已存在（去重）
  const data = loadGaps();
  const existing = data.gaps.find(g => g.hits.some(h => hits.includes(h)) && g.status !== 'dismissed');

  return {
    isGap: true,
    hits: [...new Set(hits)],
    suggestedCategory: suggestedCategory || 'other',
    existingGapId: existing ? existing.id : null
  };
}

// ===== 添加新 gap =====
function addGap({ userInput, hits, category, source = 'auto-detect', note = '' }) {
  const data = loadGaps();
  const id = `gap_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${String(data.gaps.length + 1).padStart(3, '0')}`;
  const entry = {
    id,
    user_input: userInput,
    hits: [...new Set(hits)],
    category,
    source,
    note,
    status: 'new',
    added_at: new Date().toISOString(),
    resolved_at: null
  };
  data.gaps.push(entry);
  const ok = saveGaps(data);
  return ok ? entry : null;
}

// ===== 更新状态 =====
function updateGap(id, updates) {
  const data = loadGaps();
  const gap = data.gaps.find(g => g.id === id);
  if (!gap) return null;
  Object.assign(gap, updates);
  if (updates.status === 'added_to_v1.1' || updates.status === 'dismissed') {
    gap.resolved_at = new Date().toISOString();
  }
  const ok = saveGaps(data);
  return ok ? gap : null;
}

// ===== 列出 =====
function listGaps(filter = {}) {
  const data = loadGaps();
  let gaps = data.gaps;
  if (filter.status) gaps = gaps.filter(g => g.status === filter.status);
  if (filter.category) gaps = gaps.filter(g => g.category === filter.category);
  return gaps;
}

// ===== 统计 =====
function stats() {
  const data = loadGaps();
  const byStatus = {};
  const byCategory = {};
  data.gaps.forEach(g => {
    byStatus[g.status] = (byStatus[g.status] || 0) + 1;
    byCategory[g.category] = (byCategory[g.category] || 0) + 1;
  });
  return {
    total: data.gaps.length,
    byStatus,
    byCategory,
    new_count: byStatus.new || 0
  };
}

module.exports = {
  COVERED_KEYWORDS,
  CATEGORY_HINTS,
  loadGaps,
  saveGaps,
  detectGap,
  addGap,
  updateGap,
  listGaps,
  stats,
  GAPS_FILE
};
