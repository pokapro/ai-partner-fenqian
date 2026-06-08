#!/usr/bin/env python3
import subprocess

with open('server/seed.js', 'r') as f:
    content = f.read()

# Verify clean file
assert '吴老师U盘' not in content, "File already has wulaoshi data!"

# 1. Insert wulaoshi KCs before the cases array's closing ];
kc_marker = "C可以要求供应链资源转化为股权的比例递增机制。'\n      }\n    ];"
assert kc_marker in content, "KC marker not found!"

kc_insert = """\
'scale递增机制。'
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
        risk_points: '股权层级倒置、家族与非家族成员混同、税务优化空间未利用',
        clause_templates: '亲属股权转让税务优惠条款；特殊性税务处理；分红权与决策权分离',
        negotiation_tips: '注意留存亲属关系证明、实缴出资凭证、股东会决议',
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
      },
      {
        id: 'kc_' + crypto.randomBytes(6).toString('hex'),
        title: '多人合伙股东合作协议模板案例',
        partner_count: 4, scene_type: '多人合伙创业',
        funding_pattern: '多方出资，金额不等',
        effort_pattern: '部分全职+部分兼职+部分仅出资',
        core_conflict: '董事会分工不明确、财务不透明',
        recommended_scheme: '保守型（董事会分工+定期审计）',
        allocation_summary: '董事长负责对外事务；执行董事负责内部运营；每季度财务审计',
        risk_points: '多方利益不一致、财务不透明、利润留存过多',
        clause_templates: '董事会分工条款；财务审计条款；分红不超过80%条款',
        negotiation_tips: '提前明确各股东职责边界和分红频率',
        source: '吴老师U盘', status: 'active'
      },
      {
        id: 'kc_' + crypto.randomBytes(6).toString('hex'),
        title: '创业股东协议完整结构（15条+股权设计）',
        partner_count: 3, scene_type: '创业公司设立',
        funding_pattern: '各方按约定出资',
        effort_pattern: '全职+技术+资源型',
        core_conflict: '股权稀释规则不明确、退出机制缺失',
        recommended_scheme: '激励型（含Vesting+一致行动+股权成熟）',
        allocation_summary: '股权结构安排+股权稀释条款+股权成熟回购+股权锁定处分+股东退出+一致行动+竞业禁止',
        risk_points: '股权过早分散、小股东联合否决、竞业漏洞',
        clause_templates: '股权成熟条款；股权稀释条款；一致行动协议；竞业禁止条款',
        negotiation_tips: '核心创始人应保留67%以上表决权比例',
        source: '吴老师U盘', status: 'active'
      }"""
content = content.replace(kc_marker, kc_insert)

# 2. Insert wulaoshi rules before rules array's closing ];
rule_marker = "priority: 85\n      }\n    ];"
assert rule_marker in content, "Rule marker not found!"
rules_insert = """priority: 85
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
        trigger_conditions: '创业公司、合伙人数量2人以上、缺少退出约定',
        recommendation: '创业公司应设置股权成熟期（建议4年+1年悬崖），防止合伙人早期退出带走大量股权。',
        risk_level: 'high', priority: 70
      },
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: '一致行动协议',
        trigger_conditions: '股东3人以上、小股东持股分散、创始人持股未过50%',
        recommendation: '多个小股东间应签署一致行动协议，统一投票权和决策立场。',
        risk_level: 'medium', priority: 45
      },
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: '特殊性税务处理',
        trigger_conditions: '同一控制下的股权划转、企业重组',
        recommendation: '同一控制下的股权划转可申请特殊性税务处理，暂不确认股权转让所得，暂免企业所得税。',
        risk_level: 'medium', priority: 35
      },
      {
        id: 'rule_' + crypto.randomBytes(4).toString('hex'),
        rule_name: '分红权与决策权分离',
        trigger_conditions: '员工或亲属持股、非核心决策层持股',
        recommendation: '员工或亲属持股时可约定仅享有分红权，不参与公司决策，以保障核心创始人控制权。',
        risk_level: 'high', priority: 55
      }"""
content = content.replace(rule_marker, rules_insert + "\n    ];")

# 3. Insert wulaoshi templates before templates array's closing ];
tpl_marker = "'\\u804c\\u8d23,\\u8fb9\\u754c,\\u5206\\u5de5,\\u8003\\u6838'\n      }"
# Try the literal version
tpl_marker2 = "'职责,边界,分工,考核'\n      }"
assert tpl_marker2 in content, "Template marker not found!"

tpl_insert = """'职责,边界,分工,考核'
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
      }"""
content = content.replace(tpl_marker2, tpl_insert)

with open('server/seed.js', 'w') as f:
    f.write(content)

r = subprocess.run(['node', '-c', 'server/seed.js'], capture_output=True, text=True)
print(f"Syntax: {'OK' if r.returncode == 0 else r.stderr}")
print(f"Lines: {content.count(chr(10))}")
print(f"吴老师引用: {content.count('吴老师U盘')}")
