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
  }
];

function compact(result, scanResult) {
  return {
    block: result.block.id,
    state: result.state,
    scan: Object.fromEntries(Object.entries(scanResult).map(([key, value]) => [key, value.value]))
  };
}

function assertExpected(actual, expected) {
  assert.strictEqual(actual.block, expected.block);
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'block') continue;
    if (key === 'tag') {
      assert.ok(actual.state.tags?.includes(value), `missing tag ${value}`);
    } else {
      assert.strictEqual(actual.state[key], value, `${key} mismatch`);
    }
  }
}

function assertScan(actualScan, expected = {}) {
  for (const [key, value] of Object.entries(expected)) {
    if (key.endsWith('Includes')) {
      const realKey = key.replace('Includes', '');
      assert.ok(String(actualScan[realKey] || '').includes(value), `scan ${realKey} missing ${value}`);
    } else {
      assert.strictEqual(actualScan[key], value, `scan ${key} mismatch`);
    }
  }
}

let passed = 0;
for (const tc of cases) {
  const a = compact(decisionTree.nextStep({}, tc.text), scanner.scan(tc.text));
  const b = compact(decisionTree.nextStep({}, tc.text), scanner.scan(tc.text));
  assert.deepStrictEqual(a, b, `${tc.name}: same input produced different recognition`);
  assertExpected(a, tc.expect);
  assertScan(a.scan, tc.scan);
  passed += 1;
  console.log(`ok ${passed} - ${tc.name}`);
}

console.log(`\n${passed}/${cases.length} decision recognition cases passed`);
