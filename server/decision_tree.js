// 合伙人股权问题Agent推理决策树 v1.0
// 基于 afu-chain-expansion 决策树 + simulai 块状聊天思想 + axa click-bot-framework 决策树 chatbot

// ============= 决策树块定义（参考 simulai 的 BLOCK_TYPES） =============
const BLOCK = {
  ROUTE: 'route',           // 线路选择
  COUNT: 'count',           // 人数
  FUNDING: 'funding',       // 出资/出力模式
  CONCERN: 'concern',       // 核心诉求
  ABNORMAL: 'abnormal',     // 异常标签
  FREE_TEXT: 'free_text'    // 自由输入（兜底）
};

// ============= 块（节点）定义 =============
const BLOCKS = {
  start: {
    id: 'start',
    type: BLOCK.ROUTE,
    prompt: '你们想聊哪类问题？（点击按钮选，或在下方输入框描述）',
    options: [
      { value: 'A', icon: '📐', label: '方案设计', desc: '股权/分红/合伙规则' },
      { value: 'B', icon: '📄', label: '条款定制', desc: '退出/代持/竞业条款' },
      { value: 'C', icon: '⚠️', label: '纠纷异常', desc: '对方跑路/亏损/僵局' },
      { value: 'D', icon: '💡', label: '常识咨询', desc: '干股合法吗？个税？' }
    ]
  },

  // ===== A 方案设计 =====
  count_design: {
    id: 'count_design',
    type: BLOCK.COUNT,
    prompt: '你们一共几个合伙人？',
    options: [
      { value: 2, label: '2 人' },
      { value: 3, label: '3 人' },
      { value: 4, label: '4-5 人' },
      { value: 6, label: '6 人以上' }
    ]
  },

  branch_2: {
    id: 'branch_2',
    type: BLOCK.FUNDING,
    prompt: '你们俩怎么分工？（结合你描述的情况）',
    options: [
      { value: 'both_funded_equal', branch: '2人_双资金均分型', label: '都出钱 + 都出力 + 同比例' },
      { value: 'investor_operator', branch: '2人_资金+运营型', label: '我全职，他只出钱' },
      { value: 'tech_money', branch: '2人_资金+技术型', label: '我出钱，他出技术/资源' },
      { value: 'family', branch: '2人_夫妻亲属型', label: '夫妻/情侣/亲属' },
      { value: 'unclear', branch: '2人_通用基准型', label: '还不太清楚，先看通用版' }
    ]
  },

  branch_3: {
    id: 'branch_3',
    type: BLOCK.FUNDING,
    prompt: '3 人怎么组合？',
    options: [
      { value: 'one_dominant', branch: '3人_1+2型', label: '1 个主导 + 2 个跟投' },
      { value: 'three_roles', branch: '3人_三角色型', label: '资金/运营/技术 三角色' },
      { value: 'equal_three', branch: '3人_均分型', label: '三个人平均分' },
      { value: 'unclear', branch: '3人_通用基准型', label: '还不太清楚' }
    ]
  },

  branch_4to5: {
    id: 'branch_4to5',
    type: BLOCK.FUNDING,
    prompt: '4-5 人通常需要更复杂的治理结构，你们是哪种？',
    options: [
      { value: 'one_angel_many_hands', branch: '4人_1天使+3执行型', label: '1 个出钱多 + 3 个小股东' },
      { value: 'equal_pool', branch: '4人_均分治理型', label: '都差不多钱和力' },
      { value: 'franchise', branch: '4人_加盟合伙型', label: '准备做加盟/扩店' },
      { value: 'unclear', branch: '4人_通用基准型', label: '还不太清楚' }
    ]
  },

  branch_6plus: {
    id: 'branch_6plus',
    type: BLOCK.FUNDING,
    prompt: '6+ 人项目建议直接进「股东会治理」模式，你们目前属于？',
    options: [
      { value: 'platform', branch: '6人_平台持股型', label: '多人持股的运营公司' },
      { value: 'unclear', branch: '6人_通用基准型', label: '还不太清楚' }
    ]
  },

  // ===== 核心诉求 =====
  concern: {
    id: 'concern',
    type: BLOCK.CONCERN,
    prompt: '你最关心的是什么？（可多选，会注入到方案建议里）',
    options: [
      { value: 'equity', icon: '💼', label: '股权比例' },
      { value: 'dividend', icon: '💰', label: '分红规则' },
      { value: 'exit', icon: '🚪', label: '退出机制' },
      { value: 'control', icon: '🗳️', label: '控制权' },
      { value: 'agreement', icon: '📜', label: '协议条款' }
    ]
  },

  // ===== C 异常处理 =====
  abnormal_type: {
    id: 'abnormal_type',
    type: BLOCK.ABNORMAL,
    prompt: '遇到什么问题了？（点击或直接描述）',
    options: [
      { value: 'partner_ghost', tag: 'partner_missing', label: '合伙人失联/联系不上' },
      { value: 'profit_loss', tag: 'loss', label: '项目亏损，钱怎么担？' },
      { value: 'deadlock', tag: 'deadlock', label: '股东僵局，谈不拢' },
      { value: 'wants_exit', tag: 'one_wants_out', label: '其中一人想退出' },
      { value: 'verbal_only', tag: 'no_agreement', label: '只有口头协议，没书面' }
    ]
  },

  // ===== D 常识咨询 =====
  faq_topic: {
    id: 'faq_topic',
    type: BLOCK.CONCERN,
    prompt: '你想了解哪方面的常识？',
    options: [
      { value: 'dry_share', label: '干股/技术入股' },
      { value: 'tax', label: '分红个税/税务' },
      { value: 'company_type', label: '公司类型选择' },
      { value: 'responsibility', label: '股东责任边界' }
    ]
  },

  // ===== 终态 =====
  final: {
    id: 'final',
    type: BLOCK.FREE_TEXT,
    prompt: '信息够了！可以直接生成报告，或继续补充：',
    isFinal: true
  }
};

// ============= 短路关键词（参考 axa click-bot-framework） =============
const SHORTCUTS = [
  { keywords: ['退出', '退股', '不干了', '离职', '想走'], route: 'B', jumpConcern: 'exit', tag: 'exit' },
  { keywords: ['代持', '隐名', '显名股东'], route: 'B', jumpConcern: 'agreement', tag: 'nominee' },
  { keywords: ['竞业', '保密', '挖客户', '挖墙脚'], route: 'B', jumpConcern: 'agreement', tag: 'noncompete' },
  { keywords: ['分红', '分钱', '利润分配', '分钱不均'], route: 'A', jumpConcern: 'dividend', tag: 'dividend' },
  { keywords: ['一票否决', '控制权', '谁说了算', '表决权'], route: 'A', jumpConcern: 'control', tag: 'control' },
  { keywords: ['干股', '技术入股'], route: 'D', jumpConcern: 'dry_share', tag: 'dry_share' },
  { keywords: ['亏损', '赔了', '亏钱'], route: 'C', jumpConcern: null, tag: 'loss' },
  { keywords: ['失联', '联系不上', '找不到人'], route: 'C', jumpConcern: null, tag: 'partner_missing' },
  { keywords: ['僵局', '谈不拢', '吵架'], route: 'C', jumpConcern: null, tag: 'deadlock' }
];

// ============= 文字智能识别 =============
function detectFromText(text, currentState = {}) {
  if (!text) return {};
  const detected = {};
  const tags = [];

  // 1. 短路关键词
  let shortcutFound = null;
  for (const sc of SHORTCUTS) {
    if (sc.keywords.some(kw => text.includes(kw))) {
      shortcutFound = sc;
      break;
    }
  }
  if (shortcutFound) {
    detected.shortcut = true;
    detected.route = shortcutFound.route;
    detected.jumpConcern = shortcutFound.jumpConcern;
    tags.push(shortcutFound.tag);
  }

  // 2. 人数
  if (/三个人|3人|三人|我们三个/.test(text)) detected.partnerCount = 3;
  else if (/四个人|4人|四人|五个人|5人|五个/.test(text)) detected.partnerCount = 4;
  else if (/六个人|6人|多人|好几个/.test(text)) detected.partnerCount = 6;
  else if (/两个人|我和我|两人|我们俩|我俩/.test(text)) detected.partnerCount = 2;

  // 3. 出资/出力模式（仅 2 人时）
  if (/只出钱|只出资|只投资|不管|不出力|不干活/.test(text)) {
    detected.funding = 'investor_operator';
  } else if (/都出钱|我们.*都出|他.*也出/.test(text)) {
    detected.funding = 'both_funded_equal';
  } else if (/全职|我干|我运营|我负责/.test(text)) {
    detected.funding = 'investor_operator';
  } else if (/技术|开发|产品|设计师/.test(text)) {
    detected.funding = 'tech_money';
  } else if (/老公|老婆|夫妻|男女朋友|情侣|亲戚|我爸我妈/.test(text)) {
    detected.funding = 'family';
  }

  // 4. 业务模式
  if (/餐厅|饭店|餐饮|开店|门店|实体|奶茶|咖啡/.test(text)) detected.business = '实体门店';
  else if (/直播|电商|淘宝|抖音|小红书|带货/.test(text)) detected.business = '电商/直播';
  else if (/科技|服务|咨询|开发|技术|saas/.test(text)) detected.business = '科技/服务';
  else if (/单项目|一单|短期|项目制/.test(text)) detected.business = '单项目合伙';
  else if (/加盟|连锁|分店|扩店/.test(text)) detected.business = '连锁加盟';

  // 5. 异常标签
  if (/退出|退股|不干了|跑路/.test(text) && !tags.includes('exit')) tags.push('exit');
  if (/亏|赔|损失/.test(text) && !tags.includes('loss')) tags.push('loss');
  if (/僵|谈不拢|分歧|吵架/.test(text) && !tags.includes('deadlock')) tags.push('deadlock');
  if (/离婚|分手/.test(text)) tags.push('divorce');
  if (/去世|身故|死亡/.test(text)) tags.push('death');
  if (/联系不上|失联|找不到/.test(text) && !tags.includes('partner_missing')) tags.push('partner_missing');
  if (/怕不公平|心里不平衡|觉得亏/.test(text)) tags.push('perceived_unfair');
  if (/口头|没签|没协议|只有口头/.test(text)) tags.push('no_agreement');

  // 6. 核心诉求（默认推断）
  if (!currentState.concern) {
    if (/分红|分钱|利润/.test(text)) detected.concern = 'dividend';
    else if (/退出|退股/.test(text)) detected.concern = 'exit';
    else if (/控制|一票|说了算/.test(text)) detected.concern = 'control';
    else if (/协议|合同|条款/.test(text)) detected.concern = 'agreement';
    else if (/股权|比例|股份/.test(text)) detected.concern = 'equity';
  }

  if (tags.length) detected.tags = tags;

  return detected;
}

// ============= 决策树状态机 =============
function nextStep(state, text = '') {
  const detected = detectFromText(text, state);
  const merged = { ...state, ...detected };
  const cur = state.currentBlock || 'start';

  // 终态不变
  if (cur === 'final') {
    return {
      state: { ...merged, currentBlock: 'final' },
      block: BLOCKS.final,
      detected,
      merged
    };
  }

  // 1. 短路跳转（仅当不在正常流程中间时）
  // 只在 start 阶段短路，以避免对 concern 选择后重复触发
  if (detected.shortcut && !state.shortcutResolved && cur === 'start') {
    if (detected.route === 'A' && merged.partnerCount) {
      // 已经有 route + 人数 → 直接跳到 concern
      return {
        state: { ...merged, route: 'A', currentBlock: 'concern', shortcutResolved: true },
        block: BLOCKS.concern,
        detected,
        merged
      };
    }
    // 否则跳到对应线路的第一步
    const routeToStart = {
      A: 'count_design',
      B: 'concern',
      C: 'abnormal_type',
      D: 'faq_topic'
    };
    return {
      state: { ...merged, route: detected.route, currentBlock: routeToStart[detected.route], shortcutResolved: true },
      block: BLOCKS[routeToStart[detected.route]],
      detected,
      merged
    };
  }

  // 2. 按状态推进
  if (cur === 'start') {
    // 第一步根据 route 推进（未指定则默认 A 方案设计）
    const route = merged.route || 'A';
    const next = {
      A: 'count_design',
      B: 'concern',
      C: 'abnormal_type',
      D: 'faq_topic'
    }[route];
    return {
      state: { ...merged, route, currentBlock: next },
      block: BLOCKS[next],
      detected,
      merged
    };
  }

  if (cur === 'count_design') {
    if (merged.partnerCount) {
      const next = `branch_${merged.partnerCount === 6 ? '6plus' : merged.partnerCount}`;
      const blockId = merged.partnerCount === 4 || merged.partnerCount === 5 ? 'branch_4to5' : next;
      return {
        state: { ...merged, currentBlock: blockId },
        block: BLOCKS[blockId],
        detected,
        merged
      };
    }
  }

  if (cur && cur.startsWith('branch_')) {
    return {
      state: { ...merged, currentBlock: 'concern' },
      block: BLOCKS.concern,
      detected,
      merged
    };
  }

  if (cur === 'concern' || cur === 'abnormal_type' || cur === 'faq_topic') {
    return {
      state: { ...merged, currentBlock: 'final' },
      block: BLOCKS.final,
      detected,
      merged
    };
  }

  // 兜底
  return {
    state: { ...merged, currentBlock: 'final' },
    block: BLOCKS.final,
    detected,
    merged
  };
}

// ============= 场景识别摘要（注入 prompt） =============
function summarizeScene(state) {
  const parts = [];

  if (state.route) {
    const routeMap = { A: '方案设计', B: '条款定制', C: '纠纷异常', D: '常识咨询' };
    parts.push(`线路=${routeMap[state.route] || state.route}`);
  }

  if (state.partnerCount) parts.push(`人数=${state.partnerCount}人`);

  if (state.funding) {
    const fundingMap = {
      both_funded_equal: '双资金均分型',
      investor_operator: '资金+运营型',
      tech_money: '资金+技术型',
      family: '夫妻亲属型',
      one_dominant: '1+2 主导型',
      three_roles: '三角色型',
      equal_three: '三人均分型',
      one_angel_many_hands: '1天使+3执行型',
      equal_pool: '均分治理型',
      franchise: '加盟合伙型',
      platform: '平台持股型',
      unclear: '通用基准型'
    };
    parts.push(`分工=${fundingMap[state.funding] || state.funding}`);
  }

  if (state.concern) {
    const cMap = { equity: '股权', dividend: '分红', exit: '退出', control: '控制权', agreement: '协议' };
    parts.push(`关心=${cMap[state.concern] || state.concern}`);
  }

  if (state.business) parts.push(`业务=${state.business}`);

  if (state.tags && state.tags.length) {
    parts.push(`异常标签=${state.tags.join('/')}`);
  }

  if (state.branch) parts.push(`决策树命中=${state.branch}`);

  return parts.join(' | ');
}

// ============= 渐进式单点追问（P0 增强：每次只问 1 个最关键问题）=============
// 思路：8 行需求响应表里有 8 个必填项。生成报告前，逐项检查
// 1) 命中过的 → 标"已获取"，跳过
// 2) 缺哪个 → 返回"该问什么"+"为什么问它"+"给用户看的话术"
// 3) 全部拿到 → 返回 null（告诉前端"信息够了，可以生成报告"）

const PROGRESSIVE_QUESTIONS = [
  {
    key: 'business',
    label: '业务场景',
    priority: 1,
    check: (s) => !!s.business,
    prompt: '你们做的是哪类生意？',
    quickOptions: [
      { value: '实体门店', label: '🏪 实体门店/餐饮/服务业' },
      { value: '电商/直播', label: '🛒 电商/直播带货' },
      { value: '科技/服务', label: '💻 科技/咨询/技术服务' },
      { value: '单项目合伙', label: '📋 单次项目合伙' },
      { value: '连锁加盟', label: '🔗 连锁/加盟/扩店' }
    ],
    hint: '直接告诉我具体业务也可以（比如"AI 自习室"），我会归类',
    reason: '业务不同 → 风险点和条款库差异很大（实体店要备用金，科技公司要 IP 条款）'
  },
  {
    key: 'partnerCount',
    label: '合伙人数',
    priority: 2,
    check: (s) => !!s.partnerCount,
    prompt: '你们一共几个合伙人？',
    quickOptions: [
      { value: 2, label: '2 人' },
      { value: 3, label: '3 人' },
      { value: 4, label: '4-5 人' },
      { value: 6, label: '6 人以上' }
    ],
    hint: '几个人合伙 → 决定用哪个分支（2 人 / 3 人 / 4-5 人 / 6+ 治理结构完全不同）',
    reason: '人数决定整个决策树的分支（2 人/3 人/4-5 人/6+ 治理结构完全不同）'
  },
  {
    key: 'funding',
    label: '出资/出力',
    priority: 3,
    check: (s) => !!s.funding,
    prompt: '你们怎么分工出钱和出力？',
    quickOptions: null,
    dynamicOptions: (s) => {
      const map = {
        2: [
          { value: 'both_funded_equal', label: '都出钱 + 都出力 + 比例差不多' },
          { value: 'investor_operator', label: '我全职运营，他只出钱' },
          { value: 'tech_money', label: '我出钱，他出技术/资源' },
          { value: 'family', label: '夫妻/情侣/亲属' }
        ],
        3: [
          { value: 'one_dominant', label: '1 个主导 + 2 个跟投' },
          { value: 'three_roles', label: '资金/运营/技术 三角色' },
          { value: 'equal_three', label: '三个人平均分' }
        ],
        4: [
          { value: 'one_angel_many_hands', label: '1 个出钱多 + 3 个小股东' },
          { value: 'equal_pool', label: '都差不多钱和力' },
          { value: 'franchise', label: '准备做加盟/扩店' }
        ]
      };
      return map[s.partnerCount] || map[3] || [];
    },
    hint: '或直接描述：比如"我出资 10 万他全职运营"',
    reason: '分工决定"资金股 vs 人力股"比例和回购规则'
  },
  {
    key: 'equity',
    label: '股权比例',
    priority: 4,
    check: (s) => s.equity && (s.equity.sum100 || s.equity.filledCount >= 2),
    prompt: '你们目前的股权比例是多少？',
    quickOptions: [
      { value: 'equal', label: '平均分（各 1/N）' },
      { value: 'one_dominant', label: '有一个主导（40-50%）+ 其余跟投' },
      { value: 'undecided', label: '还没定，需要 AI 建议' }
    ],
    hint: '或直接告诉我各占多少%（如：A 40% / B 35% / C 25%）',
    reason: '股权比例是方案的核心数字，没比例就只能说框架'
  },
  {
    key: 'nominee',
    label: '代持关系',
    priority: 5,
    check: (s) => s.nominee !== undefined,
    prompt: '有没有代持关系（有人工商登记但实际是别人出资）？',
    quickOptions: [
      { value: 'yes', label: '有，需要做代持安排' },
      { value: 'no', label: '没有代持' },
      { value: 'unclear', label: '不太确定' }
    ],
    hint: '代持 = 工商登记的股东 ≠ 实际出资人',
    reason: '代持涉及专门协议 + 效力边界声明，必须明确'
  },
  {
    key: 'concert',
    label: '一致行动人',
    priority: 6,
    check: (s) => s.concert !== undefined,
    prompt: '你们是否要签"一致行动人协议"（几个人对外表决意见统一）？',
    quickOptions: [
      { value: 'yes', label: '需要，部分人统一意见' },
      { value: 'no', label: '不需要，独立表决' },
      { value: 'unclear', label: '先不预设' }
    ],
    hint: '一致行动人 = 2 个以上股东约定"对外意见统一"，常配合代持使用',
    reason: '一致行动影响控制权安排和表决机制'
  },
  {
    key: 'companyStatus',
    label: '公司状态',
    priority: 7,
    check: (s) => !!s.companyStatus,
    prompt: '公司现在是什么状态？',
    quickOptions: [
      { value: 'registered', label: '已工商注册（有营业执照）' },
      { value: 'not_registered', label: '未注册（筹备中）' },
      { value: 'planning', label: '还在策划，没到注册阶段' }
    ],
    hint: '已注册和未注册 → 协议的"对内对外效力"差别很大',
    reason: '已注册 = 协议辅助章程；未注册 = 协议就是全部'
  },
  {
    key: 'fileCount',
    label: '需要几份文件',
    priority: 8,
    check: (s) => s.fileCount !== undefined,
    prompt: '你需要几份文件？',
    quickOptions: [
      { value: 1, label: '1 份合伙协议（够用）' },
      { value: 3, label: '3 份（合伙+代持+一致行动）' },
      { value: 'auto', label: '让 AI 建议（根据你的情况）' }
    ],
    hint: '多份 = 更细分场景（代持/竞业/保密可独立成文）',
    reason: '文件数决定输出结构（1 份 vs N 份独立协议）'
  }
];

// ===== 渐进式追问主函数 =====
function buildProgressiveQuestion(state) {
  const missing = [];
  for (const q of PROGRESSIVE_QUESTIONS) {
    if (!q.check(state)) missing.push(q);
  }
  if (missing.length === 0) {
    return { done: true, missingKeys: [], progress: buildProgress(state) };
  }
  missing.sort((a, b) => a.priority - b.priority);
  const next = missing[0];
  const opts = next.quickOptions || (next.dynamicOptions ? next.dynamicOptions(state) : null);
  return {
    done: false,
    next: {
      key: next.key, label: next.label, prompt: next.prompt,
      quickOptions: opts, hint: next.hint, reason: next.reason, priority: next.priority
    },
    missingKeys: missing.map(m => m.key),
    progress: buildProgress(state)
  };
}

// ===== 进度条数据 =====
function buildProgress(state) {
  const total = PROGRESSIVE_QUESTIONS.length;
  const filled = PROGRESSIVE_QUESTIONS.filter(q => q.check(state)).length;
  return { total, filled, percent: Math.round((filled / total) * 100), remaining: total - filled };
}

// ============= 构造喂给 AI 的口语化输入 =============
function buildAiInput(state, freeText = '') {
  const parts = [];

  if (state.route) {
    const routeMap = { A: '我们想设计一套合伙方案', B: '我们想看具体条款怎么定', C: '我们遇到问题了', D: '想了解合伙的基本常识' };
    parts.push(routeMap[state.route] || '');
  }

  if (state.partnerCount) parts.push(`${state.partnerCount} 人合伙`);

  if (state.funding) {
    const fundingDesc = {
      both_funded_equal: '双方都出钱也都出力，比例差不多',
      investor_operator: '我全职运营，对方只出钱不管事',
      tech_money: '我出钱，对方出技术/资源',
      family: '夫妻/情侣/亲属一起做',
      one_dominant: '1 个主导 + 2 个跟投',
      three_roles: '资金、运营、技术三角色搭配',
      equal_three: '三个人平均分',
      one_angel_many_hands: '1 个出钱多 + 3 个小股东',
      equal_pool: '4-5 个人都差不多钱和力',
      franchise: '准备做加盟/扩店',
      platform: '多人持股的运营公司',
      unclear: '具体分工还没完全定'
    };
    parts.push(fundingDesc[state.funding] || '');
  }

  if (state.business) parts.push(`做的是 ${state.business}`);

  if (state.concern) {
    const cMap = {
      equity: '股权比例怎么定',
      dividend: '分红规则怎么算',
      exit: '退出机制',
      control: '控制权和一票否决',
      agreement: '协议条款怎么写'
    };
    parts.push(`最关心 ${cMap[state.concern]}`);
  }

  if (state.tags && state.tags.length) {
    const tagDesc = {
      exit: '合伙人退出',
      loss: '项目亏损',
      deadlock: '股东僵局',
      partner_missing: '合伙人失联',
      no_agreement: '只有口头协议',
      perceived_unfair: '怕分配不公平',
      nominee: '涉及代持',
      noncompete: '需要竞业限制',
      dry_share: '涉及干股',
      divorce: '合伙人关系变化',
      death: '合伙人身故'
    };
    const tagList = state.tags.map(t => tagDesc[t] || t).filter(Boolean);
    if (tagList.length) parts.push(`特殊情况：${tagList.join('、')}`);
  }

  let summary = parts.filter(Boolean).join('；');
  if (freeText && freeText.trim()) {
    summary += `。补充：${freeText.trim()}`;
  }

  return summary || freeText || '需要设计合伙分钱方案';
}

module.exports = {
  BLOCK,
  BLOCKS,
  detectFromText,
  nextStep,
  summarizeScene,
  buildAiInput,
  buildProgressiveQuestion,
  buildProgress,
  PROGRESSIVE_QUESTIONS
};