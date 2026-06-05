// AI 合伙分钱方案生成器 - V0 Server
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const { initDb } = require('./db');
const { generateReport } = require('./ai');
const { generateProfitTable } = require('./report');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function validateInput(body) {
  const errors = [];

  if (!body.partnerCount || ![2, 3].includes(Number(body.partnerCount))) {
    errors.push('合伙人数必须是 2 或 3');
  }

  if (!body.partners || !Array.isArray(body.partners)) {
    errors.push('合伙信息缺失');
  } else {
    body.partners.forEach((p, i) => {
      if (!p.capital || isNaN(Number(p.capital)) || Number(p.capital) <= 0) {
        errors.push(`合伙人 ${p.name || String.fromCharCode(65 + i)} 的出资金额必须为正数`);
      }
      if (!p.responsibility || p.responsibility.trim().length < 2) {
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

// === API Routes ===

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
      const reportMarkdown = await generateReport(req.body);
      const profitTable = generateProfitTable(partners);
      const fullReport = reportMarkdown + '\n\n---\n\n## 利润模拟表（系统计算）\n\n' + profitTable;

      db.updateReport(caseId, fullReport);

      const previewMarkdown = fullReport.length > 2000
        ? fullReport.substring(0, 2000) + '\n\n> ...（完整报告请联系客服获取）'
        : fullReport;

      res.json({
        caseId,
        previewMarkdown,
        reportMarkdown: fullReport,
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

app.get('/api/cases', (req, res) => {
  try {
    const cases = db.getAllCases();
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '获取案例列表失败' });
  }
});

app.get('/api/cases/:id', (req, res) => {
  try {
    const c = db.getCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found', message: '案例不存在' });
    res.json(c);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '获取案例详情失败' });
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), provider: process.env.AI_PROVIDER || 'ollama' });
});

// Start server after DB init
initDb().then(database => {
  db = database;
  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`   AI 合伙分钱方案生成器 V0`);
    console.log(`   服务已启动: http://localhost:${PORT}`);
    console.log(`   AI Provider: ${process.env.AI_PROVIDER || 'ollama'}`);
    console.log(`   数据目录: ${path.join(__dirname, '..', 'data')}`);
    console.log(`========================================\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
