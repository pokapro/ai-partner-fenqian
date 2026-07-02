#!/usr/bin/env node
const assert = require('assert');
const decisionTree = require('../server/decision_tree');
const scanner = require('../server/scanner');

const cases = [
  {
    name: '酒店股东协议',
    text: '我和两个朋友开了一个小酒店，共投资200万，我出资50万，负责管理改善和提升，小李出资100万，负责营销和相关社会资源，小张出资50万，负责日常运营和管理，小张是总经理，小李是董事长，我是监事，请帮我们起草一个《股东协议书》',
    expect: { block: 'final', route: 'B', partnerCount: 3, concern: 'agreement', business: '实体门店' },
    scan: { industry: '实体门店', partnerCount: 3 }
  },
  {
    name: 'AI自习室三协议',
    text: '我和三个朋友准备开一个AI自习室，我出钱6万负责财务，小张出钱10万负责全盘运营，小林出钱4万兼职协助，老李出钱10万出资源，小林和老李的股份由小张代持，小张小林老李签一致行动人协议，公司已经注册，请整理股东协议书、代持协议、一致行动人协议',
    expect: { block: 'final', route: 'B', partnerCount: 4, concern: 'agreement', tag: 'nominee' },
    scan: { partnerCount: 4, stage: '已注册', governanceIncludes: '代持安排' }
  },
  {
    name: '两人一钱一力',
    text: '我和朋友开奶茶店，我出资20万不参与经营，他全职运营出资5万，怎么分钱分股',
    expect: { block: 'final', route: 'A', partnerCount: 2, funding: 'investor_operator', concern: 'dividend' }
  },
  {
    name: '两人都投',
    text: '我们俩合伙做抖音电商，都出钱也都出力，利润怎么分',
    expect: { block: 'final', route: 'A', partnerCount: 2, funding: 'both_funded_equal', business: '电商/直播' }
  },
  {
    name: '技术入股',
    text: '我出钱30万，朋友负责开发小程序不出钱，技术入股占多少合适',
    expect: { block: 'final', route: 'D', funding: 'tech_money', concern: 'dry_share' },
    scan: { capitalIncludes: '技术/资源入股' }
  },
  {
    name: '资源股',
    text: '我朋友不出钱，但是能带来客户资源，想给资源股怎么设计',
    expect: { block: 'count_design', route: 'A', funding: 'tech_money', tag: 'resource_share' },
    scan: { governanceIncludes: '资源股安排' }
  },
  {
    name: '退出',
    text: '合伙人干了半年不干了想退股，股权怎么回购',
    expect: { block: 'final', route: 'B', concern: 'exit', tag: 'exit' }
  },
  {
    name: '亏损',
    text: '店亏了30万，股东亏损怎么承担',
    expect: { block: 'final', route: 'C', tag: 'loss' }
  },
  {
    name: '僵局',
    text: '两个股东各50%，现在谁都说了算不了，僵局怎么处理',
    expect: { block: 'final', route: 'C', partnerCount: 2, tag: 'deadlock' }
  },
  {
    name: '失联',
    text: '合伙人拿着公章联系不上了怎么办',
    expect: { block: 'final', route: 'C', tag: 'partner_missing' }
  },
  {
    name: '控制权',
    text: '三个人合伙，我想保留控制权和一票否决权',
    expect: { block: 'final', route: 'A', partnerCount: 3, concern: 'control', tag: 'control' }
  },
  {
    name: '干股常识',
    text: '干股合法吗，需要承担亏损吗',
    expect: { block: 'final', route: 'D', concern: 'dry_share', tag: 'dry_share' }
  },
  {
    name: '税务',
    text: '股东分红个税怎么交',
    expect: { block: 'final', route: 'D', concern: 'tax', tag: 'tax' },
    scan: { capitalIncludes: '税务与分红合规' }
  },
  {
    name: '期权池',
    text: '创业公司要给员工期权池和vesting，协议怎么写',
    expect: { block: 'final', gapDetected: true, gapCategory: 'vesting' }
  },
  {
    name: '持股平台',
    text: '6个人合伙想用有限合伙持股平台GP LP',
    expect: { block: 'final', gapDetected: true, gapCategory: 'governance' },
    scan: { partnerCount: 6, capitalIncludes: 'GP LP架构' }
  },
  {
    name: '非合伙闲聊',
    text: '今天天气怎么样',
    expect: { block: 'out_of_scope', route: 'OUT_OF_SCOPE' }
  },
  {
    name: '极短模糊',
    text: '想分股',
    expect: { block: 'count_design', route: 'A' }
  },
  {
    name: '三方表达',
    text: '我们三方一起投一个民宿项目，甲出60万，乙负责运营，丙负责渠道，股权怎么分',
    expect: { block: 'final', route: 'A', partnerCount: 3, business: '实体门店', concern: 'equity' }
  },
  {
    name: '另外两个人表达',
    text: '我和另外两个人合伙做餐饮，总共投90万，我投30万，另外两人各投30万，股份怎么分配',
    expect: { block: 'final', route: 'A', partnerCount: 3, business: '实体门店', concern: 'equity' }
  },
  {
    name: '四位股东表达',
    text: '四位股东一起做跨境电商，一个负责供应链，一个负责运营，一个负责投流，一个只出钱，怎么设计股权',
    expect: { block: 'final', route: 'A', partnerCount: 4, business: '电商/直播', concern: 'equity' }
  },
  {
    name: '五位合伙人表达',
    text: '五位合伙人准备开美容店，有人出钱有人出力，需要设计分红规则',
    expect: { block: 'final', route: 'A', partnerCount: 5, business: '实体门店', concern: 'dividend' }
  },
  {
    name: '七人公司治理',
    text: '7个股东合伙做软件公司，需要股东会议事规则和表决机制',
    expect: { block: 'final', route: 'B', partnerCount: 6, business: '科技/服务', concern: 'control' }
  },
  {
    name: '只说合伙协议',
    text: '帮我写一份合伙协议',
    expect: { block: 'concern', route: 'B', concern: 'agreement' }
  },
  {
    name: '只说股东协议',
    text: '需要起草股东协议书',
    expect: { block: 'concern', route: 'B', concern: 'agreement' }
  },
  {
    name: '合同叫法',
    text: '我们要签股东合作合同，先问哪些信息',
    expect: { block: 'concern', route: 'B', concern: 'agreement' }
  },
  {
    name: '分成叫法',
    text: '我出钱他出力，利润分成怎么定',
    expect: { block: 'final', route: 'A', funding: 'investor_operator', concern: 'dividend' }
  },
  {
    name: '抽成叫法',
    text: '合伙人负责销售，想按业绩抽成，不知道怎么写条款',
    expect: { block: 'final', route: 'B', concern: 'dividend' }
  },
  {
    name: '提成叫法',
    text: '运营合伙人不要股份只要利润提成，可以怎么设计',
    expect: { block: 'final', route: 'A', concern: 'dividend' }
  },
  {
    name: '法人控制权',
    text: '公司法人是我朋友，我担心控制权旁落，应该怎么约定',
    expect: { block: 'final', route: 'A', concern: 'control', tag: 'control' }
  },
  {
    name: '公章财务',
    text: '公章和财务章在合伙人手里，我怎么防止他乱用',
    expect: { block: 'final', route: 'C', tag: 'governance_risk' }
  },
  {
    name: '品牌账号归属',
    text: '我们做小红书账号合伙，账号归属和收益分配怎么写',
    expect: { block: 'final', route: 'B', business: '电商/直播', concern: 'agreement' }
  },
  {
    name: '抖音账号归属',
    text: '抖音号是我注册的，朋友负责直播，分红和账号归属怎么定',
    expect: { block: 'final', route: 'B', business: '电商/直播', concern: 'agreement' }
  },
  {
    name: '夫妻合伙',
    text: '夫妻一起开店，股权和分红要不要写清楚',
    expect: { block: 'final', route: 'A', funding: 'family', business: '实体门店', concern: 'dividend' }
  },
  {
    name: '情侣分手',
    text: '情侣合伙开店，现在分手了股份怎么退',
    expect: { block: 'final', route: 'B', concern: 'exit', tag: 'exit' }
  },
  {
    name: '亲属合伙',
    text: '我和亲戚一起做便利店，怕后面扯皮，协议怎么写',
    expect: { block: 'final', route: 'B', business: '实体门店', concern: 'agreement' }
  },
  {
    name: '竞业条款',
    text: '合伙人离开后不能挖客户，竞业和保密条款怎么写',
    expect: { block: 'final', route: 'B', concern: 'agreement', tag: 'noncompete' }
  },
  {
    name: '保密条款',
    text: '股东掌握客户名单和供应商资料，保密协议怎么写',
    expect: { block: 'final', route: 'B', concern: 'agreement', tag: 'noncompete' }
  },
  {
    name: '强制退出',
    text: '合伙人连续三个月不来上班，能不能强制退出',
    expect: { block: 'final', route: 'B', concern: 'exit', tag: 'exit' }
  },
  {
    name: '除名',
    text: '股东严重违约，想设计除名和回购条款',
    expect: { block: 'final', gapDetected: true, gapCategory: 'exit_detail' }
  },
  {
    name: '死亡继承',
    text: '股东去世后，他的配偶能不能直接进公司',
    expect: { block: 'final', route: 'C', tag: 'death' }
  },
  {
    name: '离婚影响',
    text: '合伙人离婚了，配偶会不会分走公司股权',
    expect: { block: 'final', route: 'C', tag: 'divorce' }
  },
  {
    name: '融资对赌',
    text: '投资人要求对赌和回购承诺，创始人股东协议要怎么改',
    expect: { block: 'final', gapDetected: true, gapCategory: 'fundraising' }
  },
  {
    name: '反稀释',
    text: '天使投资人要反稀释条款和优先清算权，怎么处理',
    expect: { block: 'final', gapDetected: true }
  },
  {
    name: '董事会席位',
    text: '三个创始人加一个投资人，董事会席位和一票否决权怎么安排',
    expect: { block: 'final', gapDetected: true, gapCategory: 'governance' }
  },
  {
    name: 'AB股',
    text: '创始人想保留AB股和超级投票权，股东协议怎么写',
    expect: { block: 'final', gapDetected: true, gapCategory: 'control' }
  },
  {
    name: '未注册公司',
    text: '我们还没注册公司，先签合伙协议可以吗',
    expect: { block: 'final', route: 'B', concern: 'agreement' },
    scan: { stage: '未注册' }
  },
  {
    name: '已经运营',
    text: '店已经经营两年了，现在想补签股东协议和分红规则',
    expect: { block: 'final', route: 'B', concern: 'agreement' }
  },
  {
    name: '项目制合伙',
    text: '我们只是合作一个短期项目，一单结束后分钱，协议怎么写',
    expect: { block: 'final', route: 'B', business: '单项目合伙', concern: 'agreement' }
  },
  {
    name: '工程项目',
    text: '两个人合作一个工程项目，我垫资他找资源，利润怎么分',
    expect: { block: 'final', route: 'A', partnerCount: 2, business: '单项目合伙', concern: 'dividend' }
  },
  {
    name: '生产制造',
    text: '我们合伙开工厂，一个出设备一个负责生产销售，股权怎么分',
    expect: { block: 'final', route: 'A', business: '生产制造', concern: 'equity' }
  },
  {
    name: '加盟店',
    text: '我出品牌，他出门店和运营，加盟店合伙分成怎么设计',
    expect: { block: 'final', route: 'A', business: '连锁加盟', concern: 'dividend' }
  },
  {
    name: '只出资源',
    text: '老李不出钱，只负责带来客户和政府资源，能给多少股份',
    expect: { block: 'count_design', route: 'A', funding: 'tech_money', tag: 'resource_share' }
  },
  {
    name: '只出技术',
    text: '技术合伙人不投钱，只负责系统开发，占股多少合适',
    expect: { block: 'count_design', route: 'A', funding: 'tech_money', concern: 'equity' }
  },
  {
    name: '人力股',
    text: '全职运营股东主要出人力不出钱，人力股怎么成熟',
    expect: { block: 'final', gapDetected: true, gapCategory: 'vesting' }
  },
  {
    name: '动态股权',
    text: '我们想做动态股权，根据贡献每季度调整比例',
    expect: { block: 'count_design', route: 'A', concern: 'equity' }
  },
  {
    name: '估值回购',
    text: '股东退出时按净资产还是原始出资回购比较合适',
    expect: { block: 'final', gapDetected: true, gapCategory: 'exit_detail' }
  },
  {
    name: '仲裁诉讼',
    text: '股东协议争议解决写仲裁还是法院诉讼',
    expect: { block: 'final', route: 'B', concern: 'agreement' }
  },
  {
    name: '管辖法院',
    text: '合伙协议里面管辖法院怎么约定',
    expect: { block: 'final', route: 'B', concern: 'agreement' }
  },
  {
    name: '分红周期',
    text: '股东多久分一次红，每月还是每季度',
    expect: { block: 'final', route: 'A', concern: 'dividend', tag: 'dividend' }
  },
  {
    name: '亏损不承担',
    text: '只出资源的股东说亏损不承担，这样可以吗',
    expect: { block: 'final', route: 'C', tag: 'loss' }
  },
  {
    name: '债务承担',
    text: '公司欠供应商钱，股东个人要不要承担债务',
    expect: { block: 'final', route: 'D', concern: 'responsibility' }
  },
  {
    name: '公司类型',
    text: '合伙做生意应该注册有限公司还是个体户',
    expect: { block: 'final', route: 'D', concern: 'company_type' }
  },
  {
    name: '法人与股东',
    text: '法人和股东有什么区别，谁承担责任',
    expect: { block: 'final', route: 'D', concern: 'responsibility' }
  },
  {
    name: '出资没到账',
    text: '股东承诺出资50万但一直没到账，协议怎么约束',
    expect: { block: 'final', route: 'B', concern: 'agreement' }
  },
  {
    name: '抽逃出资',
    text: '合伙人把注册资金转走了，算不算抽逃出资',
    expect: { block: 'final', route: 'C', tag: 'governance_risk' }
  },
  {
    name: '大股东小股东',
    text: '大股东占60%，小股东40%，重大事项怎么表决',
    expect: { block: 'final', route: 'A', concern: 'control' }
  },
  {
    name: '平均股权',
    text: '三个人平均分股份会有什么问题',
    expect: { block: 'final', route: 'A', partnerCount: 3, concern: 'equity' }
  },
  {
    name: '一人主导两人跟投',
    text: '三人合伙，一个主导经营，两个只跟投，股权比例怎么定',
    expect: { block: 'final', route: 'A', partnerCount: 3, funding: 'one_dominant', concern: 'equity' }
  },
  {
    name: '多轮对话第一句',
    text: '我们想合伙开店',
    expect: { block: 'count_design', route: 'A', business: '实体门店' }
  },
  {
    name: '错别字分钱',
    text: '合伙分前怎么弄',
    expect: { block: 'count_design', route: 'A', concern: 'dividend' }
  },
  {
    name: '错别字股分',
    text: '股分比例怎么定',
    expect: { block: 'count_design', route: 'A', concern: 'equity' }
  },
  {
    name: '英文vesting',
    text: '技术合伙人的vesting和cliff怎么写',
    expect: { block: 'final', gapDetected: true, gapCategory: 'vesting' }
  },
  {
    name: '英文ESOP',
    text: '员工ESOP期权池比例一般怎么设置',
    expect: { block: 'final', gapDetected: true, gapCategory: 'vesting' }
  },
  {
    name: '问价格非业务',
    text: '这个工具多少钱',
    expect: { block: 'out_of_scope', route: 'OUT_OF_SCOPE' }
  },
  {
    name: '问天气非业务',
    text: '明天会下雨吗',
    expect: { block: 'out_of_scope', route: 'OUT_OF_SCOPE' }
  },
  {
    name: '普通创业非合伙不足',
    text: '我想创业做咖啡',
    expect: { block: 'out_of_scope', route: 'OUT_OF_SCOPE' }
  }
];

function compact(result, scanResult) {
  return {
    block: result.block.id,
    state: result.state,
    scan: Object.fromEntries(Object.entries(scanResult).map(([key, value]) => [key, value.value]))
  };
}

function assertExpected(actual, expected, name = '') {
  assert.strictEqual(actual.block, expected.block, `${name}: block mismatch`);
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'block') continue;
    if (key === 'tag') {
      assert.ok(actual.state.tags?.includes(value), `${name}: missing tag ${value}`);
    } else {
      assert.strictEqual(actual.state[key], value, `${name}: ${key} mismatch`);
    }
  }
}

function assertScan(actualScan, expected = {}, name = '') {
  for (const [key, value] of Object.entries(expected)) {
    if (key.endsWith('Includes')) {
      const realKey = key.replace('Includes', '');
      assert.ok(String(actualScan[realKey] || '').includes(value), `${name}: scan ${realKey} missing ${value}`);
    } else {
      assert.strictEqual(actualScan[key], value, `${name}: scan ${key} mismatch`);
    }
  }
}

let passed = 0;
for (const tc of cases) {
  const a = compact(decisionTree.nextStep({}, tc.text), scanner.scan(tc.text));
  const b = compact(decisionTree.nextStep({}, tc.text), scanner.scan(tc.text));
  assert.deepStrictEqual(a, b, `${tc.name}: same input produced different recognition`);
  assertExpected(a, tc.expect, tc.name);
  assertScan(a.scan, tc.scan, tc.name);
  passed += 1;
  console.log(`ok ${passed} - ${tc.name}`);
}

console.log(`\n${passed}/${cases.length} decision recognition cases passed`);
