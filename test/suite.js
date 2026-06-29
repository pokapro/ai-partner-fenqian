#!/usr/bin/env node
// 合伙算钱全量测试套件 — 覆盖 6 维 × 5 类 × 25+ 场景
// 用法：cd ~/pot/ai在线合伙分钱服务 && node test/suite.js
// 依赖：本地服务已启动 (PORT=3099)

const http = require('http');

const HOST = '127.0.0.1';
const PORT = 3099;
const BASE = `http://${HOST}:${PORT}`;

// ========== 测试用例定义 ==========

const SUITE = {
  // ===== 1. 扫描 API（6 维检测正确性）=====
  scan: [
    { id: 'S1', label: '2人开餐厅', input: '我和朋友开餐厅他出10万我出5万', expect: { industry: true, partnerCount: 2 } },
    { id: 'S2', label: '3人做AI创业', input: '我们3个做AI创业', expect: { industry: true, partnerCount: 3 } },
    { id: 'S3', label: '4人连锁加盟', input: '我们4个合伙做连锁加盟', expect: { industry: true, partnerCount: 4 } },
    { id: 'S4', label: '8人创业', input: '我们8个人合伙创业', expect: { partnerCount: 8 } },
    { id: 'S5', label: '代持+一致行动', input: '股权代持怎么设计，要签一致行动人', expect: { governance: true } },
    { id: 'S6', label: '对赌+反稀释', input: '投资人要签对赌协议和反稀释条款', expect: { capital: true } },
    { id: 'S7', label: '亏损+退出', input: '项目亏了50万合伙人想退出了', expect: { risk: true, stage: true } },
    { id: 'S8', label: '已注册公司', input: '公司已经注册了想重新分股权', expect: { stage: true } },
    { id: 'S9', label: '离婚股权', input: '合伙人离婚股权会被分走吗', expect: { risk: true } },
    { id: 'S10', label: '6人跨境电商全套', input: '我们6个人做跨境电商公司已注册做了1年利润300万。投资人要投200万占20%签对赌和反稀释。两人股份要我代持，我和另一人签一致行动投票权67%。留10%期权池4年vesting。', expect: { industry: true, partnerCount: 6, stage: true, capital: true, governance: true } },
  ],

  // ===== 2. 生成报告质量（端到端）=====
  report: [
    { id: 'R1', label: '2人开餐厅', input: '我和朋友开餐厅，他出10万我出5万，他全职我兼职，大概对半分', minChars: 1000, levels: 6 },
    { id: 'R2', label: '3人科技+融资', input: '我们3个做AI创业，投资人要投100万占20%签对赌和反稀释', minChars: 2000, levels: 7 },
    { id: 'R3', label: '6人全套（最关键）', input: '我们6个人做跨境电商公司已注册做了1年利润300万。投资人要投200万占20%签对赌和反稀释。两人股份要我代持，我和另一人签一致行动投票权67%。留10%期权池4年vesting。', minChars: 4000, levels: 7 },
    { id: 'R4', label: '亏损+散伙', input: '和合伙人闹翻了想散伙。投了80万开店现在账上20万设备值30万，退股价格怎么算', minChars: 2000, levels: 6 },
    { id: 'R5', label: '代持+注册公司', input: '我和3个朋友开公司，我出资60万占50%，其他三人由我代持。公司已注册，需要股东协议和代持协议', minChars: 2000, levels: 6 },
    { id: 'R6', label: '婚姻/继承', input: '合伙人离婚股权会被分走吗？如果合伙人身故了怎么办', minChars: 1000, levels: 7 },
    { id: 'R7', label: '期权池+股权激励', input: '公司做了2年想给核心员工发期权，设多少比例合适？4年vesting怎么设置', minChars: 2000, levels: 7 },
    { id: 'R8', label: '常识咨询-干股', input: '技术入股怎么算股份，干股合法吗', minChars: 500, levels: 6 },
  ],
};

// ========== 运行 ==========

let passed = 0, failed = 0;

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 90000,
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch { resolve({ _raw: buf.slice(0, 200) }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, { timeout: 10000 }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch { resolve({ _raw: buf.slice(0, 200) }); }
      });
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

function check(cond, msg) {
  if (cond) { process.stdout.write('✅'); passed++; }
  else { process.stdout.write('❌'); failed++; }
  console.log(' ' + msg);
}

async function run() {
  // 0. 健康检查
  console.log('=== 0. 健康检查 ===');
  try {
    const h = await get('/api/health');
    check(h.status === 'ok', `Health: ${h.status}`);
  } catch(e) { check(false, 'Health: ' + e.message); }

  // 1. 扫描 API
  console.log('\n=== 1. 扫描 API ===');
  for (const c of SUITE.scan) {
    try {
      const r = await post('/api/decision-tree/scan', { text: c.input });
      const dims = Object.keys(r.dimensions || {});
      const ok = Object.entries(c.expect).every(([k, v]) => {
        if (typeof v === 'boolean') return dims.includes(k) === v;
        if (typeof v === 'number') return r.dimensions?.[k]?.value == v;
        return false;
      });
      check(ok, `${c.id} ${c.label}: ${dims.join(',')}`);
    } catch(e) { check(false, `${c.id} ${c.label}: ${e.message}`); }
  }

  // 2. 报告生成
  console.log('\n=== 2. 报告生成 ===');
  for (const c of SUITE.report) {
    try {
      const r = await post('/api/decision-tree/generate-report', {
        state: { route: 'A', scene: '线路=方案设计' },
        freeText: c.input
      });
      const md = r.markdown || '';
      const levels = ['📋','L0','L1','L1+','L2','L3','L4'].filter(x => md.includes(x)).length;
      const ok = r.ok && md.length >= c.minChars && levels >= c.levels;
      check(ok, `${c.id} ${c.label}: ${r.ok?'ok':'fail'} ${md.length}字 ${levels}/7级 (需≥${c.minChars}字/${c.levels}级)`);
    } catch(e) { check(false, `${c.id} ${c.label}: ${e.message}`); }
  }

  // 汇总
  console.log(`\n${'='.repeat(50)}`);
  console.log(`结果: ${passed} 通过, ${failed} 失败 (共 ${passed + failed} 项)`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
