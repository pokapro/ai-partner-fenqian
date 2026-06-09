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

app.use(cors());
app.use(express.json({ limit: '1mb' }));
// Serve built frontend (Vite build → dist), fallback to legacy public/
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.use(express.static(path.join(__dirname, '..', 'public')));

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
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
function requireAdminToken(req, res, next) {
  // If ADMIN_TOKEN is not set, allow localhost access without token for debugging
  if (!ADMIN_TOKEN) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost') {
      return next();
    }
    return res.status(403).json({ error: 'forbidden', message: '接口未开放远程访问。请配置 ADMIN_TOKEN 后通过 ?token=xxx 访问。' });
  }
  // 支持 ?token=xxx 和 Authorization: Bearer xxx 两种方式
  const token = req.query.token || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'forbidden', message: '无效的访问令牌（token）' });
  }
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
    const apiKey = (process.env.DEEPSEEK_API_KEY_P1 || '') + (process.env.DEEPSEEK_API_KEY_P2 || '');
    const sysPrompt = '你是AI填表助手。用户会用口语描述他们的合伙创业情况，你需要提取结构化的表单数据并返回JSON。' +
      '返回格式（只返回JSON，不要其他内容）：' +
      '{"partnerCount":2,"partners":[{"name":"张三","capital":200000,"effortType":"全职运营","responsibility":"日常管理"},{"name":"李四","capital":100000,"effortType":"不出力","responsibility":"仅出资"}],"annualProfit":500000}' +
      '规则：partnerCount必须是2/3/4；effortType取值：全职运营/兼职/不出力/技术/资源；capital是数字（元）；无法推断的字段填null；只输出JSON，不要任何其他文字';

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

    try {
      const reportMarkdown = await generateReport(req.body, db);
      const profitTable = generateProfitTable(partners);
      const fullReport = reportMarkdown + '\n\n---\n\n## 利润模拟表（系统计算）\n\n' + profitTable;

      db.updateReport(caseId, fullReport);

      const previewMarkdown = fullReport.length > 6000
        ? fullReport.substring(0, 6000) + '\n\n> ...（完整报告请联系客服获取）'
        : fullReport;

      res.json({
        caseId,
        previewMarkdown,
        status: 'pending_review'
      });
    } catch (aiErr) {
      db.updateReport(caseId, `AI 生成失败：${aiErr.message}`, 'pending_review');
      res.status(500).json({
        caseId,
        error: 'ai_error',
        message: `报告生成失败：${aiErr.message}。请稍后重试或联系客服。`
      });
    }
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'server_error', message: '服务器内部错误，请稍后重试。' });
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

    const stmt = db.db ? db.db.prepare("SELECT previewMarkdown, fullReport FROM cases WHERE caseId = ? AND status = 'completed'") : null;
    if (!stmt) return res.status(500).json({ error: 'server_error', message: '数据库不可用' });

    const row = stmt.get(caseId);
    if (!row) return res.status(404).json({ error: 'not_found', message: '未找到该案例' });

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

    const updateStmt = db.db.prepare("UPDATE cases SET previewMarkdown = ?, fullReport = ?, updatedAt = datetime('now') WHERE caseId = ?");
    updateStmt.run(updatedReport, updatedReport, caseId);

    res.json({ success: true, updatedReport });
  } catch (err) {
    console.error('[regenerate]', err);
    res.status(500).json({ error: 'server_error', message: err.message || '修改失败' });
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), provider: process.env.AI_PROVIDER || 'ollama', version: '0.3.0' });
});

// SPA fallback: serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/.')) return;
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'), (err) => {
    if (err) {
      // Fallback to legacy public/index.html
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
  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`   AI 合伙分钱方案生成器 V0.3 (CopilotKit)`);
    console.log(`   服务已启动: http://localhost:${PORT}`);
    console.log(`   AI Provider: ${process.env.AI_PROVIDER || 'ollama'}`);
    console.log(`   数据目录: ${path.join(__dirname, '..', 'data')}`);
    console.log(`   后台管理: http://localhost:${PORT}/api/cases?token=${ADMIN_TOKEN || '(未配置)'}`);
    console.log(`========================================\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
