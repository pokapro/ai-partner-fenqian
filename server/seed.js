// Seed data for V0.2 — 案例库+规则库+模板库
// 启动时自动插入，仅当对应表为空时

/**
 * 检查表是否为空，是则插入种子数据
 * @param {Object} db - 数据库实例
 */
function seedData(db) {
  const crypto = require('crypto');
  const now = new Date().toISOString().replace('T', ' ').split('.')[0];

  // ========================================
  // 1. 基础规则
  // ========================================
  const existingRules = db.getRules();
  if (existingRules.length === 0) {
    console.log('[seed] 插入规则种子数据...');
    const rules = [
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: '一方出资一方全职',
        trigger_conditions: '一方出资高于50%，另一方0元出资且全职。场景：一人出资一人全职',
        recommendation: '建议采用平衡型分配方案：50%按出资比例分配，50%按出力贡献分配。全职运营方可获得出力部分的大头（约70-80%）。建议在出资方收回本金后再按约定比例分红。',
        risk_level: 'medium',
        priority: 90
      },
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: '0元出资全职操盘',
        trigger_conditions: '全职或包含全职。0元出资或零出资。',
        recommendation: '0元出资全职操盘方按出力贡献获得利润的20-35%是常见范围。出资方可设回本优先权，回本后再按约定比例分配。建议为全职操盘方设基础薪资+分红的结构。',
        risk_level: 'high',
        priority: 85
      },
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: '口头五五分约定',
        trigger_conditions: '口头或口头约定。五五或对半或50%',
        recommendation: '口头五五分看似公平，但忽略了一方出资多、一方出力多的不对等。建议：将"五五"作为基础参考，根据实际出资和出力差异微调。若双方坚持对半，可设考核期（3-6个月）后再根据实际贡献调整。',
        risk_level: 'high',
        priority: 80
      },
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: '无退出机制风险',
        trigger_conditions: '退出或退出机制。无或没有',
        recommendation: '必须约定退出条款：1）合伙人退出时，由其余合伙人按评估价回购；2）退出通知期建议30-60天；3）竞业限制条款，退出后6-12个月内不从事竞品业务；4）退出时的商誉/客户资源归属。',
        risk_level: 'high',
        priority: 90
      },
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: '亏损承担规则',
        trigger_conditions: '亏损或亏损承担或损失或赔钱',
        recommendation: '亏损承担应明确：1）按利润分配的同比例承担；2）可设亏损上限（如出资额范围内）；3）全职运营方可协商降低亏损承担比例（因已投入人力成本）；4）定期对账审计机制。',
        risk_level: 'high',
        priority: 85
      },
      // ---- 吴老师U盘规则 ----
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: '家族企业股权传承税务优惠',
        trigger_conditions: '父子/父女间股权转让，无偿转让，有亲属关系证明',
        recommendation: '父子/父女间股权转让可享受亲属间无偿转让个税优惠，无需核定股权转让收入，不征收个人所得税。',
        risk_level: 'medium', priority: 40
      },
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: '防火墙架构风险隔离',
        trigger_conditions: '家族企业控股多层、业务公司风险需隔离',
        recommendation: '业务公司应由防火墙公司控股，与家族公司隔离经营风险。',
        risk_level: 'high', priority: 60
      },
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: '分红上限约定',
        trigger_conditions: '有分红意向，但未约定利润留存比例',
        recommendation: '股东分红不得超过年利润的80%，留存至少20%保障公司运营资金。',
        risk_level: 'medium', priority: 50
      },
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: 'Vesting机制',
        trigger_conditions: '创业公司、合伙人2人以上、缺少退出约定',
        recommendation: '创业公司应设置股权成熟期（4年+1年悬崖），防止合伙人早期退出带走大量股权。',
        risk_level: 'high', priority: 70
      },
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: '一致行动协议',
        trigger_conditions: '股东3人以上、小股东持股分散、创始人未过50%',
        recommendation: '多个小股东间应签署一致行动协议，统一投票权和决策立场。',
        risk_level: 'medium', priority: 45
      },
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: '特殊性税务处理',
        trigger_conditions: '同一控制下的股权划转、企业重组',
        recommendation: '同一控制下的股权划转可申请特殊性税务处理，暂免企业所得税。',
        risk_level: 'medium', priority: 35
      },
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: '分红权与决策权分离',
        trigger_conditions: '员工或亲属持股、非核心决策层持股',
        recommendation: '员工或亲属持股时可约定仅享有分红权，不参与公司决策，以保障核心创始人控制权。',
        risk_level: 'high', priority: 55
      }
    ];

    for (const rule of rules) {
      db.createRule(rule);
    }
    console.log(`[seed] 已插入 ${rules.length} 条规则`);
  }

  // ========================================
  // 2. 基础案例
  // ========================================
  const existingCases = db.getKnowledgeCases();
  if (existingCases.length === 0) {
    console.log('[seed] 插入知识案例种子数据...');
    const cases = [
      {
        id: 'kc_' + crypto.randomBytes(4).toString('hex'),
        title: 'A出资20万+B全职运营，年薪利润30-50万',
        partner_count: 2,
        scene_type: '一人出资一人全职',
        funding_pattern: '不等额出资',
        effort_pattern: '仅出资+全职运营',
        profit_range: '30-50万',
        oral_agreement: '口头五五分',
        core_conflict: '出资方认为出了大部分钱应得大头，全职方认为出了全部时间和精力',
        recommended_scheme: '平衡型（50%按出资 + 50%按出力）',
        allocation_summary: '出资方A：50%出资部分占80% + 50%出力部分占20% = 50%（总占比）；全职方B：50%出力部分占80% + 50%出资部分占20% = 50%。出资本金收回后调整为出资方40%：全职方60%。',
        risk_points: '口头五五分未考虑出资差异；全职方无收入保障风险大；退出机制缺失',
        clause_templates: '分红条款：回本前按出资比例+出力贡献分配，回本后调整；退出条款：全职方退出需提前60天通知，股权按净资产评估价回购',
        negotiation_tips: '建议全职方先谈最低薪资保障，再谈分红比例。出资方可承诺回本后提高全职方比例作为激励。'
      },
      {
        id: 'kc_' + crypto.randomBytes(4).toString('hex'),
        title: '甲乙各出10万+双方全职，年利润10-20万',
        partner_count: 2,
        scene_type: '双方出力',
        funding_pattern: '等额出资',
        effort_pattern: '全职运营+兼职',
        profit_range: '10-20万',
        oral_agreement: '按出资五五分',
        core_conflict: '一方全职一方兼职，但出资和口头约定都是对半，全职方觉得不公平',
        recommended_scheme: '激励型（先按出力分配基础部分，超额部分倾斜全职方）',
        allocation_summary: '基础利润15万以内：全职方60% + 兼职方40%（考虑出力差异）；超出15万部分：全职方70% + 兼职方30%。或全职方每月领3000元基础薪资后剩余利润再按五五分。',
        risk_points: '兼职方可能后期投入不足；利润规模小全职方入不敷出；无退出机制',
        clause_templates: '职责条款：明确全职方每日工作时长和职责范围，兼职方每周最低投入时间；退出条款：退出方股权由留存方优先回购',
        negotiation_tips: '建议先试运行3个月，根据实际贡献度调整比例。全职方可以要求基础薪资保障。'
      },
      {
        id: 'kc_' + crypto.randomBytes(4).toString('hex'),
        title: 'A出资30万+B出资5万全职+C出资1万供应链，年利润50-100万',
        partner_count: 3,
        scene_type: '三人合伙',
        funding_pattern: '不等额出资',
        effort_pattern: '全职运营+仅出资+供应链',
        profit_range: '50-100万',
        oral_agreement: '按出资比例分配',
        core_conflict: 'A出资最多但不出力，B出钱少但全职，C有供应链资源。按出资分配B和C都觉得吃亏。',
        recommended_scheme: '平衡型（40%按出资 + 60%按贡献加权）',
        allocation_summary: 'A（仅出资）：40%出资部分占83% + 60%出力部分占15% = 42%；B（全职运营）：40%出资部分占14% + 60%出力部分占60% = 42%；C（供应链）：40%出资部分占3% + 60%出力部分占25% = 16%。回本后可调整为A 35%、B 45%、C 20%。',
        risk_points: '三方出资差异大，仅出资方容易有控制权焦虑；全职方负担重易倦怠；供应链方资源可持续性存疑',
        clause_templates: '决策条款：重大事项需A+B同意或三分之二表决权通过；退出条款：任何一方退出按评估价扣除20%违约金后回购',
        negotiation_tips: 'A可以要求回本优先权作为大出资方的保障。B可以要求随着业务增长逐步提高分配比例。C可以要求供应链资源转化为股权的比例递增机制。'
      },
      // ---- 吴老师U盘案例 ----
      {
        id: 'kc_' + crypto.randomBytes(6).toString('hex'),
        title: '广东启正股权结构调整优化（家族企业三层架构）',
        partner_count: 3, scene_type: '家族企业股权优化',
        funding_pattern: '家族公司控股+防火墙隔离',
        effort_pattern: '出资方均为股东，控制权与分红权分离',
        core_conflict: '股权层级倒置、控制权不集中、传承不明确',
        recommended_scheme: '保守型（分层控股+比例调整）',
        allocation_summary: '家族公司林金城80%+林满满20%（女儿）；防火墙公司95%+女婿5%（仅分红权）；业务公司100%由防火墙公司控股',
        risk_points: '股权层级倒置、家族非家族成员混同、税务空间未利用',
        clause_templates: '亲属股权转让税务优惠；特殊性税务处理；分红决策权分离',
        negotiation_tips: '留存亲属关系证明、实缴凭证、股东会决议',
        source: '吴老师U盘', status: 'active'
      },
      {
        id: 'kc_' + crypto.randomBytes(6).toString('hex'),
        title: '云南XX茶业分红及退出机制设计',
        partner_count: 4, scene_type: '已运营公司分红与退出',
        funding_pattern: '等额出资',
        effort_pattern: '均为出资方，部分参与经营',
        core_conflict: '分红频率不明确、退出机制缺失',
        recommended_scheme: '平衡型（定期分红+阶梯退出）',
        allocation_summary: '每半年对账分红；内部转让→对外转让→优先购买→减资退出',
        risk_points: '无书面退出机制、分红频率不明确、留存利润未约定',
        clause_templates: '定期分红条款；退出阶梯条款',
        negotiation_tips: '提前约定分红频率和退出触发条件',
        source: '吴老师U盘', status: 'active'
      },
      {
        id: 'kc_' + crypto.randomBytes(6).toString('hex'),
        title: '创业公司动态股权分配（Vesting）',
        partner_count: 2, scene_type: '创业合伙人股权分配',
        funding_pattern: '20万+5万+供应链',
        effort_pattern: '一人全职运营，另一人全职+供应链',
        core_conflict: '出资额差异大、全职价值难评估',
        recommended_scheme: '激励型（动态分配+Vesting）',
        allocation_summary: '资金股+人力股综合计算，4年Vesting+1年悬崖',
        risk_points: '出资额差异大、全职无评估标准、Vesting执行复杂',
        clause_templates: 'Vesting条款（4年成熟+1年悬崖）；动态调整',
        negotiation_tips: '全职方先拿合理薪资再参与分红',
        source: '吴老师U盘', status: 'active'
      }
    ];

    for (const kc of cases) {
      db.createKnowledgeCase(kc);
    }
    console.log(`[seed] 已插入 ${cases.length} 条知识案例`);
  }

  // ========================================
  // 3. 模板
  // ========================================
  const existingTemplates = db.getTemplates();
  if (existingTemplates.length === 0) {
    console.log('[seed] 插入条款模板种子数据...');
    const templates = [
      {
        id: 'tpl_' + crypto.randomBytes(4).toString('hex'),
        template_type: '分红',
        title: '净利润分配条款',
        content: `## 净利润分配条款

各方同意，合伙企业/项目的净利润按以下顺序和比例进行分配：

1. **回本优先分配**：净利润首先用于归还各合伙人的出资本金，按出资比例分配，直至各方收回全部出资本金。
2. **基础分配**：回本后，净利润的 ___%（建议50-60%）按各方出资比例分配，___%（建议40-50%）按各方出力贡献分配。
3. **超额激励**：超出预期利润 ___ 万元的部分，全职运营方的分配比例提高 ___ 个百分点。
4. **分配时间**：每季度/半年进行一次利润核算和分配，每年末进行年度结算。

> 出力贡献评估：由全体合伙人每季度共同评估，评估标准包括工作时间、职责完成度、业绩贡献等。`,
        tags: '分红,利润分配,出资,出力'
      },
      {
        id: 'tpl_' + crypto.randomBytes(4).toString('hex'),
        template_type: '亏损承担',
        title: '亏损承担条款',
        content: `## 亏损承担条款

1. **承担比例**：经营亏损由全体合伙人按利润分配的同比例承担。
2. **上限约定**：各合伙人的亏损承担上限不超过其出资金额。超出部分由全体合伙人另行协商。
3. **全职方保护**：全职运营方的亏损承担比例可以协商降低 ___ 个百分点（建议降低5-10%），以体现其已投入人力成本的贡献。
4. **追加投资**：如需追加投资弥补亏损，各方按出资比例追加。任何一方不追加的，其持股比例按稀释条款调整。
5. **亏损披露**：月度亏损超过 ___ 元的，需在 ___ 日内向全体合伙人书面披露。`,
        tags: '亏损,承担,风险,保护'
      },
      {
        id: 'tpl_' + crypto.randomBytes(4).toString('hex'),
        template_type: '退出',
        title: '合伙人退出条款',
        content: `## 合伙人退出条款

1. **退出通知**：任何合伙人拟退出，需提前 ___ 天（建议30-60天）书面通知其他合伙人。
2. **股权回购**：退出方的股权由留存合伙人按以下方式回购：
   a) 评估基准：以退出通知发出日前一个月的平均净利润为基础，乘以 ___ 倍PE；
   b) 或按最近一次外部融资估值的 ___ 折计算；
   c) 以(a)(b)中较高者/较低者为准（双方协商选择）。
3. **违约金**：退出方需支付其股权价值的 ___%（建议10-20%）作为违约金。
4. **竞业限制**：退出后 ___ 个月内（建议6-12个月），不得从事与本项目相竞争的业务。
5. **客户资源归属**：退出后，项目现有客户资源归留存合伙人所有。`,
        tags: '退出,回购,竞业,违约金'
      },
      {
        id: 'tpl_' + crypto.randomBytes(4).toString('hex'),
        template_type: '账目',
        title: '账目公开与审计条款',
        content: `## 账目公开与审计条款

1. **定期公开**：每月 ___ 日前，运营方需向全体合伙人公开上月的财务明细，包括但不限于：收入、支出、库存、现金流。
2. **审计权**：任何合伙人有权每季度指定第三方审计机构对账目进行审计，审计费用由合伙企业承担。
3. **公开透明**：所有合伙人有权随时查阅原始票据和凭证，运营方需在 ___ 小时内提供。
4. **信息平台**：各方同意使用共同的财务管理工具/平台，确保数据实时同步、不可篡改。`,
        tags: '账目,审计,公开,透明'
      },
      {
        id: 'tpl_' + crypto.randomBytes(4).toString('hex'),
        template_type: '职责',
        title: '合伙人职责边界条款',
        content: `## 合伙人职责边界条款

1. **职责约定**：各合伙人的主要职责如下——
   - [合伙人A]：负责 ___（如选品、供应链、运营、财务等），预计每周投入 ___ 小时。
   - [合伙人B]：负责 ___，预计每周投入 ___ 小时。
   - [合伙人C]：负责 ___，预计每周投入 ___ 小时。
2. **职责变更**：任何合伙人的职责调整需经全体合伙人一致同意。
3. **未达标处理**：连续 ___ 个月未达到约定投入标准的合伙人，其分配比例相应降低 ___ 个百分点。
4. **新增岗位**：如需新增合伙人/员工，需经全体合伙人一致同意，新增人员的股权/期权方案另行约定。`,
        tags: '职责,边界,分工,考核'
      },
      // ---- 吴老师U盘模板 ----
      {
        id: 'tpl_' + crypto.randomBytes(4).toString('hex'),
        template_type: '分红', title: '亲属间股权转让税务优惠条款',
        content: '直系亲属间无偿转让股权免个税，需亲属关系证明。转让双方按0.05%缴印花税。',
        tags: '税务优惠,亲属,股权转让,无偿转让'
      },
      {
        id: 'tpl_' + crypto.randomBytes(4).toString('hex'),
        template_type: '退出', title: '企业重组特殊性税务处理条款',
        content: '同一控制下股权划转可申请特殊性税务处理，暂免企业所得税。需向税务机关备案。',
        tags: '税务,重组,划转,特殊处理'
      },
      {
        id: 'tpl_' + crypto.randomBytes(4).toString('hex'),
        template_type: '职责', title: '分红权与决策权分离条款',
        content: '股东仅享有分红权和资产收益权，不参与公司决策。重大事项由执行董事/创始人董事会决定。',
        tags: '分红权,决策权,分离,控制权'
      },
      {
        id: 'tpl_' + crypto.randomBytes(4).toString('hex'),
        template_type: '退出', title: '135渐进式股权激励条款',
        content: '第1年在职分红；第3年资格确认（连续3年考核后获注册股资格）；第5年锁定（工商登记或回购）。',
        tags: '股权激励,渐进式,锁定,分红'
      },
      {
        id: 'tpl_' + crypto.randomBytes(4).toString('hex'),
        template_type: '退出', title: '股东退出阶梯条款',
        content: '股东退出顺序：①内部转让 ②对外转让（过半数同意）③优先购买 ④减资退出。',
        tags: '退出,阶梯,内部转让,对外转让,减资'
      },
      {
        id: 'tpl_' + crypto.randomBytes(4).toString('hex'),
        template_type: '话术', title: '股东合作协议完整条款',
        content: '出资约定→董事会分工→财务审计→分红≤80%利润→违约双倍赔偿→协议解除→竞业禁止。',
        tags: '合作协议,分工,分红,违约'
      }
    ];

    for (const tpl of templates) {
      db.createTemplate(tpl);
    }
    console.log(`[seed] 已插入 ${templates.length} 条条款模板`);
  }
}

module.exports = { seedData };
