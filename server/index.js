// AI 合伙分钱方案生成器 - V0.2 Server (案例库+规则库驱动)
const path = require('path');
const fs = require('fs');
// 强制从项目根目录加载 .env，不依赖启动 cwd
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Render Secret Files fallback - 尝试多个路径
const secretPaths = [
  '/etc/secrets/.env',
  '/etc/secrets/env',
  '/etc/secret/.env',
];
for (const sp of secretPaths) {
  if (fs.existsSync(sp)) {
    console.log('[env] Found secret file at', sp);
    require('dotenv').config({ path: sp });
    if (process.env.AI_PROVIDER) {
      console.log('[env] AI_PROVIDER loaded from', sp);
      break;
    }
  }
}
console.log('[env] AI_PROVIDER =', process.env.AI_PROVIDER || '(not set, using ollama)');

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { initDb } = require('./db');
const { generateReport } = require('./ai');
const { generateProfitTable } = require('./report');
const { seedData } = require('./seed');
const { seedAdewoAgreement } = require('../scripts/seed_adewo_agreement');
const { createCopilotKitHandler: setupCopilotKit } = require('./copilotkit');

const app = express();
const PORT = process.env.PORT || 3000;

// API 请求频率限制（防止滥用 + API 费用爆炸）
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'rate_limit', message: '请求太频繁，请稍后再试。' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/generate', apiLimiter);
app.use('/api/suggest-form', apiLimiter);
app.use('/api/regenerate', apiLimiter);

app.use(cors());
app.set('trust proxy', 1); app.use(express.json({ limit: '1mb' }));
// Serve built frontend (Vite build → dist), fallback to legacy public/
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// 进度存储（内存 Map，不依赖 SQLite，确保异步读写正确）
const progressStore = new Map();

function validateInput(body) {
  const errors = [];

  if (!body.partnerCount || ![2, 3, 4].includes(Number(body.partnerCount))) {
    errors.push('合伙人数必须是 2 或 3');
  }

  if (!body.partners || !Array.isArray(body.partners)) {
    errors.push('合伙信息缺失');
  } else {
    body.partners.forEach((p, i) => {
      const capital = Number(p.capital);
      if (isNaN(capital) || capital < 0) {
        errors.push(`合伙人 ${p.name || String.fromCharCode(65 + i)} 的出资金额不能为负数`);
      } else if (capital === 0) {
        // 0元出资：必须给出力类型和职责描述
        if (!p.effortType || p.effortType.trim().length === 0) {
          errors.push(`出资 0 元的合伙人 ${p.name || String.fromCharCode(65 + i)} 必须选择出力类型`);
        }
        if (!p.responsibility || p.responsibility.trim().length < 2) {
          errors.push(`出资 0 元的合伙人 ${p.name || String.fromCharCode(65 + i)} 必须填写职责描述`);
        }
      } else if (capital <= 0) {
        errors.push(`合伙人 ${p.name || String.fromCharCode(65 + i)} 的出资金额必须为正数`);
      }
      if (capital > 0 && (!p.responsibility || p.responsibility.trim().length < 2)) {
        errors.push(`合伙人 ${p.name || String.fromCharCode(65 + i)} 的职责描述不能为空`);
      }
    });
  }

  if (!body.contact || body.contact.trim().length < 5) {
    errors.push('联系方式（微信或手机号）不能为空');
  }

  const disputeKeywords = ['纠纷', '诉讼', '打官司', '法院', '律师正在', '已经打'];
  const allText = JSON.stringify(body);
  for (const kw of disputeKeywords) {
    if (allText.includes(kw)) {
      errors.push('dispute_detected');
      break;
    }
  }

  return errors;
}

// Store db reference after init
let db = null;

// Admin token middleware (protects sensitive routes)
// 白名单验证中间件（只验证账号密码，无需 token）
function requireAdminToken(req, res, next) {
  // 从 whitelist 文件加载
  const wl = (() => {
    try { return JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'data', 'admin_whitelist.json'), 'utf-8')); } catch { return []; }
  })();
  // 尝试 Basic Auth
  let user = '', pass = '';
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
      const parts = decoded.split(':');
      user = parts[0] || '';
      pass = parts.slice(1).join(':') || '';
    } catch (e) {}
  } else if (auth.startsWith('Bearer ')) {
    // 兼容 admin.html 之前保存的 base64 token
    try {
      const decoded = Buffer.from(auth.slice(7), 'base64').toString('utf-8');
      const parts = decoded.split(':');
      user = parts[0] || '';
      pass = parts.slice(1).join(':') || '';
    } catch (e) {}
  }
  // 也兼容 ?user&pass 查询参数方式
  if (!user && req.query.user && req.query.pass) {
    user = req.query.user;
    pass = req.query.pass;
  }
  const match = wl.find(w => w.username === user && w.password === pass);
  if (!match) {
    // 也兼容旧的 ?token=xxx 方式（保留过渡）
    const token = req.query.token || '';
    if (token && (process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN)) {
      req.adminUser = { username: 'admin', role: 'admin' };
      return next();
    }
    return res.status(403).json({ error: 'forbidden', message: '用户名或密码错误' });
  }
  req.adminUser = { username: match.username, role: match.role };
  next();
}

// === Public API Routes ===

// AI一键填表：弹出一个对话框让用户描述情况，AI解析后返回表单数据
const suggestFormInputs = {}; // 临时存储用户输入

app.post('/api/suggest-form', async (req, res) => {
  const { message } = req.body;

  // 如果没有消息，返回引导信息让用户输入
  if (!message) {
    return res.json({
      needInput: true,
      prompt: '简单说说你们的合伙情况，例如："我和两个朋友合伙开餐厅，我出20万全职，张三出10万兼职，李四出5万不出力"'
    });
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY || (process.env.DEEPSEEK_API_KEY_P1 || '') + (process.env.DEEPSEEK_API_KEY_P2 || '');
    const sysPrompt = '你是AI填表助手。用户会用口语描述他们的合伙创业情况，你需要提取结构化的表单数据并返回JSON。' +
      '返回格式（只返回JSON，不要其他内容）：' +
      '{"partnerCount":2,"partners":[{"name":"张三","capital":200000,"effortType":"全职运营","responsibility":"日常管理"},{"name":"李四","capital":100000,"effortType":"不出力","responsibility":"仅出资"}],"annualProfit":500000}' +
      '规则：partnerCount必须是2/3/4；effortType取值(对应前端下拉选项)："全职运营"、"兼职"、"仅出资不出力"、"技术/开发"、"资源/渠道"；capital是数字（元）；annualProfit是数字（元）；无法推断的字段填null；只输出JSON，不要任何其他文字';

    const res2 = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.3
      })
    });

    if (!res2.ok) throw new Error('API error: ' + res2.status);
    const data = await res2.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 解析JSON
    let cleaned = content.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const braceMatch = cleaned.match(/\{[\s\S]*\}/);
    if (braceMatch) cleaned = braceMatch[0];
    const parsed = JSON.parse(cleaned);

    res.json({
      needInput: false,
      ...parsed
    });
  } catch (err) {
    console.error('[suggest-form]', err);
    res.status(500).json({ error: 'AI解析失败，请手动填写表单', needInput: false });
  }
});

app.post('/api/generate', async (req, res) => {
  try {
    const errors = validateInput(req.body);
    if (errors.length > 0) {
      if (errors.includes('dispute_detected')) {
        return res.status(400).json({
          error: 'dispute',
          message: '⚠️ 检测到您描述的内容涉及已发生的纠纷。本工具不处理已发生纠纷的分配方案，建议您咨询专业律师。'
        });
      }
      return res.status(400).json({ error: 'validation', message: errors.join('；') });
    }

    const caseId = 'case_' + crypto.randomBytes(12).toString('hex');
    const { partnerCount, partners, contact } = req.body;

    db.createCase({
      id: caseId,
      partnerCount: Number(partnerCount),
      contact: contact.trim(),
      inputJson: req.body
    });

    // 先返回 caseId，后端异步生成
    res.json({ caseId, progress: 0, status: 'generating' });

    // 异步生成报告
    // 初始化进度到内存 Map
    progressStore.set(caseId, 2);

    (async () => {
      try {
        // 进度推进器：每400ms递增，直到AI返回或到75%
        progressStore.set(caseId, 3);
        let pStep = 2;
        const iv = setInterval(() => {
          const cur = progressStore.get(caseId) || 0;
          if (cur >= 75) { clearInterval(iv); return; }
          progressStore.set(caseId, Math.min(cur + pStep, 75));
          if (pStep < 6) pStep += 0.4;
        }, 400);

        const reportMarkdown = await generateReport(req.body, db);
        clearInterval(iv);
        progressStore.set(caseId, 80);

        const profitTable = generateProfitTable(partners);
        const fullReport = reportMarkdown + '\n\n---\n\n## 利润模拟表（系统计算）\n\n' + profitTable;
        progressStore.set(caseId, 88);

        db.updateReport(caseId, fullReport);

        // 在前端付费模块前插入 <!--paid--> 标记
        // 付费保护已暂时禁用（等用户指令再开启）
        progressStore.set(caseId, { pct: 100, preview: fullReport });
      } catch (aiErr) {
        db.updateReport(caseId, `AI 生成失败：${aiErr.message}`, 'pending_review');
        progressStore.set(caseId, { pct: -1, error: aiErr.message });
        console.error('Async generation error:', aiErr);
      }
    })();
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'server_error', message: '服务器内部错误，请稍后重试。' });
  }
});

app.get('/api/progress/:caseId', (req, res) => {
  const entry = progressStore.get(req.params.caseId);
  // entry 可能是数字（进行中）也可能是对象（完成）
  if (entry === null || entry === undefined) {
    return res.json({ progress: 0, status: 'unknown' });
  }
  if (typeof entry === 'object' && entry.pct === 100) {
    // 完成后的条目 60 秒后自动清理（防止内存泄漏）
    if (!progressStore._cleanupTimers) progressStore._cleanupTimers = new Map();
    if (!progressStore._cleanupTimers.has(req.params.caseId)) {
      const timer = setTimeout(() => { progressStore.delete(req.params.caseId); progressStore._cleanupTimers.delete(req.params.caseId); }, 60000);
      progressStore._cleanupTimers.set(req.params.caseId, timer);
    }
    return res.json({ progress: 100, status: 'done', caseId: req.params.caseId, previewMarkdown: entry.preview });
  }
  if (typeof entry === 'number' && entry >= 100) {
    // 兼容：如果是数字100，尝试从数据库读
    const summary = db.getCaseReportSummary(req.params.caseId);
    if (summary) {
      return res.json({ progress: 100, status: 'done', caseId: req.params.caseId, previewMarkdown: summary.previewMarkdown });
    }
    return res.json({ progress: 100, status: 'done' });
  }
  if (typeof entry === 'number' && entry < 0) {
    return res.json({ progress: 0, status: 'failed' });
  }
  const val = typeof entry === 'object' ? (entry.pct || 0) : entry;
  res.json({ progress: Math.round(val), status: 'generating' });
});

// 公开案例状态接口（无需token），供前端页面恢复用
app.get('/api/cases/:id/public-status', (req, res) => {
  try {
    const c = db.getCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found', message: '案例不存在' });

    // 获取后端记录的付款状态
    let unlockStatus = 'locked';
    if (c.payment_intent && c.payment_intent.includes('completed')) unlockStatus = 'unlocked';
    // review_status 为 'paid_delivered' 或 review_note 含 'paid' 也视为已解锁
    if (c.review_status === 'paid_delivered' || (c.review_note && c.review_note.includes('paid'))) unlockStatus = 'unlocked';

    res.json({
      caseId: c.id,
      status: c.review_status || 'pending_review',
      unlockStatus,
      paymentStatus: c.payment_intent ? 'recorded' : 'none',
      previewMarkdown: c.report_markdown ? c.report_markdown.slice(0, 2000) : '',
      createdAt: c.created_at,
      // 不返回完整报告
    });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '获取案例状态失败' });
  }
});

app.get('/api/cases', requireAdminToken, (req, res) => {
  try {
    const cases = db.getAllCases();
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '获取案例列表失败' });
  }
});

app.get('/api/cases/:id', requireAdminToken, (req, res) => {
  try {
    const c = db.getCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found', message: '案例不存在' });
    res.json(c);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '获取案例详情失败' });
  }
});

// 修改报告端点：局部或全部重做
app.post('/api/regenerate', async (req, res) => {
  try {
    const { caseId, target, instruction, partners, hasAdvanced, advancedFields } = req.body;
    if (!caseId || !instruction) {
      return res.status(400).json({ error: 'validation', message: 'caseId 和 instruction 必填' });
    }

    // 统一字段映射：前端用 caseId/previewMarkdown，数据库用 id/report_markdown
    const c = db.getCase(caseId);
    if (!c) return res.status(404).json({ error: 'not_found', message: '未找到该案例' });

    const row = { previewMarkdown: c.report_markdown || '', fullReport: c.report_markdown || '' };

    const input = {
      partners: partners || [],
      partnerCount: (partners || []).length,
      annualProfit: 0,
      instruction,
      target: target || 'auto',
      originalReport: row.previewMarkdown || '',
      hasAdvanced,
      advancedFields,
    };

    const { regenerateReport } = require('./ai');
    const updatedReport = await regenerateReport(input);

    // 🔒 付费保护已暂时禁用（等用户指令再开启）
    // 统一字段映射：更新数据库字段 report_markdown
    db.updateReport(caseId, updatedReport);

    res.json({ success: true, updatedReport });
  } catch (err) {
    console.error('[regenerate]', err);
    res.status(500).json({ error: 'server_error', message: err.message || '修改失败' });
  }
});

// === PayJS 支付接口 ===
// 创建支付订单
app.post('/api/pay/create', async (req, res) => {
  try {
    const { caseId, plan } = req.body;
    if (!caseId || !plan) return res.status(400).json({ error: 'validation', message: 'caseId 和 plan 必填' });

    const amount = plan === 'reviewed' ? 9900 : 2990; // 99元 or 29.9元（单位：分）
    const orderId = db.createOrder(caseId, plan, amount);

    // PayJS 扫码支付
    const PAYJS_MCHID = process.env.PAYJS_MCHID || '';
    const PAYJS_KEY = process.env.PAYJS_KEY || '';

    if (!PAYJS_MCHID || !PAYJS_KEY) {
      return res.json({ success: true, orderId, amount, qrcode: null, message: '支付未配置，返回模拟数据' });
    }

    const crypto = require('crypto');
    const params = {
      mchid: PAYJS_MCHID,
      total_fee: String(amount),
      out_trade_no: orderId,
      body: `合伙分钱报告-${plan === 'reviewed' ? '人工审核版' : '基础版'}`,
      notify_url: `https://${req.hostname}/api/pay/notify`,
    };

    // 按 key 排序后生成签名
    const keys = Object.keys(params).sort();
    const signStr = keys.map(k => k + '=' + params[k]).join('&') + '&key=' + PAYJS_KEY;
    params.sign = crypto.createHash('md5').update(signStr, 'utf-8').digest('hex').toUpperCase();

    const payResp = await fetch('https://payjs.cn/api/native', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    }).then(r => r.json());

    if (payResp.return_code === 1) {
      db.updateOrder(orderId, { payjs_order_id: payResp.payjs_order_id, payjs_qrcode: payResp.qrcode, status: 'pending_pay' });
      return res.json({ success: true, orderId, amount, qrcode: payResp.qrcode });
    } else {
      return res.json({ success: false, message: payResp.return_msg || '支付创建失败' });
    }
  } catch (err) {
    console.error('[pay/create]', err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// 查询订单状态
app.get('/api/pay/status/:orderId', (req, res) => {
  try {
    const order = db.getOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'not_found', message: '订单不存在' });
    res.json({
      orderId: order.id,
      status: order.status,
      plan: order.plan,
      amount: order.amount,
      paidAt: order.paid_at,
    });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// 支付回调通知（PayJS POST 到 notify_url）
app.post('/api/pay/notify', (req, res) => {
  try {
    const { out_trade_no, total_fee, payjs_order_id, sign } = req.body || {};
    if (!out_trade_no) return res.status(400).send('fail');

    // 更新订单状态
    db.updateOrder(out_trade_no, {
      status: 'paid',
      payjs_order_id: payjs_order_id || '',
      paid_at: new Date().toISOString(),
    });

    console.log('[pay/notify] 支付成功:', out_trade_no, total_fee);
    res.send('success');
  } catch (err) {
    console.error('[pay/notify]', err);
    res.status(500).send('fail');
  }
});

// 获取完整报告（付款后）
app.get('/api/cases/:id/unlocked-report', (req, res) => {
  try {
    const c = db.getCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found', message: '案例不存在' });

    // 检查是否已付费
    const orders = db.getOrdersByCase(req.params.id);
    const hasPaid = orders.some(o => o.status === 'paid');
    if (!hasPaid) {
      return res.status(403).json({ error: 'payment_required', message: '请先完成支付' });
    }

    res.json({
      caseId: c.id,
      fullReport: c.report_markdown || '',
      hasUnlocked: true,
    });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// 下载报告（付款后）
app.get('/api/cases/:id/download', (req, res) => {
  try {
    const c = db.getCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found', message: '案例不存在' });

    const orders = db.getOrdersByCase(req.params.id);
    const hasPaid = orders.some(o => o.status === 'paid');
    if (!hasPaid) {
      return res.status(403).json({ error: 'payment_required', message: '请先完成支付' });
    }

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fenqian-report-' + req.params.id.slice(0,8) + '.md"');
    res.send(c.report_markdown || '');
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

app.put('/api/cases/:id/payment', (req, res) => {
  try {
    const { paymentIntent } = req.body;
    if (!paymentIntent) return res.status(400).json({ error: 'validation', message: 'paymentIntent 必填' });
    db.updatePaymentIntent(req.params.id, paymentIntent);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '记录付款意向失败' });
  }
});

// Review endpoint (requires ADMIN_TOKEN)
app.put('/api/cases/:id/review', requireAdminToken, (req, res) => {
  try {
    const { reviewStatus, reviewNote } = req.body;
    const validStatuses = ['reviewed', 'delivered', 'rejected'];
    if (!reviewStatus || !validStatuses.includes(reviewStatus)) {
      return res.status(400).json({ error: 'validation', message: `reviewStatus 必须为: ${validStatuses.join('、')}` });
    }
    const existing = db.getCase(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not_found', message: '案例不存在' });
    db.updateReviewStatus(req.params.id, reviewStatus, reviewNote || '');
    res.json({ success: true, status: reviewStatus, note: reviewNote || '' });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '更新审核状态失败' });
  }
});

// Admin case notes（管理员备注+跟进状态）
app.put('/api/admin/cases/:id/notes', requireAdminToken, (req, res) => {
  try {
    const { adminNote, followupStatus } = req.body;
    const existing = db.getCase(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not_found', message: '案例不存在' });
    db.updateCaseNotes(req.params.id, adminNote, followupStatus);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// === Admin API Routes (knowledge_cases) ===

app.get('/api/admin/knowledge-cases', requireAdminToken, (req, res) => {
  try {
    const cases = db.getKnowledgeCases();
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '获取知识案例失败' });
  }
});

app.post('/api/admin/knowledge-cases', requireAdminToken, (req, res) => {
  try {
    const id = db.createKnowledgeCase(req.body);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '创建知识案例失败' });
  }
});

app.put('/api/admin/knowledge-cases/:id', requireAdminToken, (req, res) => {
  try {
    db.updateKnowledgeCase(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '更新知识案例失败' });
  }
});

// === Admin API Routes (rules) ===

app.get('/api/admin/rules', requireAdminToken, (req, res) => {
  try {
    const rules = db.getRules();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '获取规则失败' });
  }
});

app.post('/api/admin/rules', requireAdminToken, (req, res) => {
  try {
    const id = db.createRule(req.body);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '创建规则失败' });
  }
});

app.put('/api/admin/rules/:id', requireAdminToken, (req, res) => {
  try {
    db.updateRule(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '更新规则失败' });
  }
});

// === Admin API Routes (templates) ===

app.get('/api/admin/templates', requireAdminToken, (req, res) => {
  try {
    const templates = db.getTemplates();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '获取模板失败' });
  }
});

app.post('/api/admin/templates', requireAdminToken, (req, res) => {
  try {
    const id = db.createTemplate(req.body);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '创建模板失败' });
  }
});

app.put('/api/admin/templates/:id', requireAdminToken, (req, res) => {
  try {
    db.updateTemplate(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '更新模板失败' });
  }
});

// === Admin: Promote case to knowledge ===

app.post('/api/admin/cases/:id/promote', requireAdminToken, (req, res) => {
  try {
    const id = db.promoteCaseToKnowledge(req.params.id, req.body);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message || '提升为知识案例失败' });
  }
});

// === Admin Dashboard 统计 ===
app.get('/api/admin/stats', requireAdminToken, (req, res) => {
  try {
    const allCases = db.getAllCases();
    const allOrders = db.getAllOrders();
    const paidOrders = allOrders.filter(o => o.status === 'paid');
    const basicOrders = paidOrders.filter(o => o.plan === 'basic');
    const reviewedOrders = paidOrders.filter(o => o.plan === 'reviewed');
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const todayCases = allCases.filter(c => (c.created_at || '').startsWith(todayStr));
    const todayPaid = paidOrders.filter(o => (o.paid_at || '').startsWith(todayStr));

    res.json({
      totalCases: allCases.length,
      todayCases: todayCases.length,
      totalOrders: allOrders.length,
      totalPaid: paidOrders.length,
      todayPaid: todayPaid.length,
      basicOrders: basicOrders.length,
      reviewedOrders: reviewedOrders.length,
      pendingReview: allCases.filter(c => c.review_status === 'pending_review').length,
      unpaid: allCases.filter(c => !c.payment_intent || c.payment_intent === '').length,
    });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// === Admin 订单管理 ===
app.get('/api/admin/orders', requireAdminToken, (req, res) => {
  try {
    const orders = db.getAllOrders();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// === Admin 导出案例 CSV ===
app.get('/api/admin/export/cases', requireAdminToken, (req, res) => {
  try {
    const cases = db.getAllCases();
    const header = '案例ID,提交时间,合伙人数,联系方式,付费意向,审核状态,跟进状态,管理员备注';
    const rows = cases.map(c => {
      const id = c.id || '';
      const time = c.created_at || '';
      const count = c.partner_count || '';
      const contact = (c.contact || '').replace(/,/g, ';');
      const payment = c.payment_intent || '';
      const review = c.review_status || '';
      const followup = c.followup_status || '';
      const note = (c.admin_note || '').replace(/,/g, ';').replace(/\n/g, ' ');
      return [id, time, count, contact, payment, review, followup, note].join(',');
    });
    const csv = '\ufeff' + header + '\n' + rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fenqian-cases-' + today.toISOString().slice(0,10) + '.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// === Admin 导出订单 CSV ===
app.get('/api/admin/export/orders', requireAdminToken, (req, res) => {
  try {
    const orders = db.getAllOrders();
    const header = '订单ID,案例ID,套餐,金额(分),状态,支付时间,创建时间';
    const rows = orders.map(o => {
      return [o.id, o.case_id, o.plan, o.amount, o.status, o.paid_at || '', o.created_at || ''].join(',');
    });
    const csv = '\ufeff' + header + '\n' + rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fenqian-orders-' + today.toISOString().slice(0,10) + '.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), provider: process.env.AI_PROVIDER || 'ollama', version: require('../package.json').version });
});

// === Admin Whitelist DB (首次启动自动初始化默认管理员) ===
// === 多版本备份 API ===
app.get('/api/admin/backups', requireAdminToken, (req, res) => {
  try {
    const backupDir = path.join(process.env.HOME || '/tmp', '.fenqian-data');
    const result = {
      current: null,
      versions: [],
      daily: []
    };
    // 当前备份
    const cur = path.join(backupDir, 'cases_backup.json');
    if (fs.existsSync(cur)) {
      const data = JSON.parse(fs.readFileSync(cur, 'utf-8'));
      result.current = { time: data.backup_time, count: data.count };
    }
    // 版本列表
    const versionDir = path.join(backupDir, 'versions');
    if (fs.existsSync(versionDir)) {
      result.versions = fs.readdirSync(versionDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 30).map(f => {
        const p = path.join(versionDir, f);
        try {
          const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
          return { file: f, time: d.backup_time, count: d.count };
        } catch { return { file: f }; }
      });
    }
    // 每日快照
    const dailyDir = path.join(backupDir, 'daily');
    if (fs.existsSync(dailyDir)) {
      result.daily = fs.readdirSync(dailyDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 30).map(f => {
        const p = path.join(dailyDir, f);
        try {
          const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
          return { date: d.backup_time.slice(0,10), count: d.count };
        } catch { return { date: f.replace('cases_','').replace('.json','') }; }
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// 从备份恢复
app.post('/api/admin/backups/restore', requireAdminToken, (req, res) => {
  try {
    const { file } = req.body;
    if (!file) return res.status(400).json({ error: 'validation', message: '请指定备份文件名' });
    const backupDir = path.join(process.env.HOME || '/tmp', '.fenqian-data');
    // 支持从 version 和 daily 恢复
    let backupPath = path.join(backupDir, 'versions', file);
    if (!fs.existsSync(backupPath)) {
      backupPath = path.join(backupDir, 'daily', file);
    }
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'not_found', message: '未找到备份文件' });
    }
    const data = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
    if (!data.cases || !Array.isArray(data.cases)) {
      return res.status(400).json({ error: 'invalid', message: '备份文件格式无效' });
    }
    // 先清空当前 cases 表
    database.run(`DELETE FROM cases`);
    // 然后导入
    const stmt = database.prepare('INSERT OR IGNORE INTO cases (id, created_at, source, contact, partner_count, input_json, report_markdown, payment_intent, review_status, review_note, progress, admin_note, followup_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    let count = 0;
    for (const c of data.cases) {
      if (c.id && c.created_at) {
        stmt.run([c.id, c.created_at, c.source || 'restored', c.contact || '', c.partner_count || 2, c.input_json || '{}', c.report_markdown || '', c.payment_intent || '', c.review_status || 'pending_review', c.review_note || '', c.progress || 0, c.admin_note || '', c.followup_status || '']);
        count++;
      }
    }
    stmt.free();
    // 触发备份
    persist();
    res.json({ success: true, restored: count });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

const WHITELIST_DB = path.join(__dirname, '..', 'data', 'admin_whitelist.json');
const DEFAULT_ADMINS = [
  { username: 'admin', password: 'afu_admin_2026', role: 'admin', created_at: '2026-06-11T00:00:00.000Z' }
];

function loadWhitelist() {
  try { return JSON.parse(require('fs').readFileSync(WHITELIST_DB, 'utf-8')); } catch { return []; }
}
function saveWhitelist(list) {
  const dir = path.dirname(WHITELIST_DB);
  if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
  require('fs').writeFileSync(WHITELIST_DB, JSON.stringify(list, null, 2));
}
function ensureWhitelist() {
  const list = loadWhitelist();
  if (list.length === 0) {
    saveWhitelist(DEFAULT_ADMINS);
  }
}
// 初始化白名单
ensureWhitelist();

// 调试：确保白名单已初始化
if (loadWhitelist().length === 0) {
  console.error('[whitelist] WARNING: 白名单为空，强制写入默认管理员');
  saveWhitelist(DEFAULT_ADMINS);
}

// GET whitelist
app.get('/api/admin/whitelist', requireAdminToken, (req, res) => {
  const list = loadWhitelist();
  // 不返回密码哈希，但为了前端验证也返回密码（内网自用场景可以接受）
  res.json(list);
});

// POST add to whitelist
app.post('/api/admin/whitelist', requireAdminToken, (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'validation', message: '用户名和密码必填' });
    const list = loadWhitelist();
    if (list.find(w => w.username === username)) {
      return res.status(409).json({ error: 'conflict', message: '用户名已存在' });
    }
    list.push({ username: username.trim(), password, role: role || 'viewer', created_at: new Date().toISOString() });
    saveWhitelist(list);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// DELETE whitelist entry
app.delete('/api/admin/whitelist', requireAdminToken, (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'validation', message: 'username 必填' });
    let list = loadWhitelist();
    list = list.filter(w => w.username !== username);
    saveWhitelist(list);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// Admin 管理页面
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// SPA fallback: serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/.')) return;
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    }
  });
});

// Start server after DB init
initDb().then(database => {
  db = database;
  // Run seed data on first start
  seedData(db);
  seedAdewoAgreement(db);
  // Start CopilotKit Agent runtime
  setupCopilotKit(app, db);

  // Keepalive: 每 5 分钟自 ping，防止 Render 免费实例休眠
  const KEEPALIVE_INTERVAL = 5 * 60 * 1000;
  setInterval(() => {
    const http = require('http');
    const host = process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT;
    http.get(host + '/api/health', (res) => {
      console.log('[keepalive] ping ok, status:', res.statusCode);
    }).on('error', (err) => {
      console.log('[keepalive] ping error:', err.message);
    });
  }, KEEPALIVE_INTERVAL);
  console.log('[keepalive] 已启动，每 5 分钟自 ping');
  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`   AI 合伙分钱方案生成器 V${require('../package.json').version} (五权诊断+AI填表+报告编辑)`);
    console.log(`   服务已启动: http://localhost:${PORT}`);
    console.log(`   AI Provider: ${process.env.AI_PROVIDER || 'ollama'}`);
    console.log(`   数据目录: ${path.join(__dirname, '..', 'data')}`);
    console.log(`   后台管理: https://ai-partner-fenqian.onrender.com/admin`);
    console.log(`   后台登录: admin / afu_admin_2026`);
    console.log(`========================================\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
