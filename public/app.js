// AI 合伙分钱方案生成器 - Frontend JS
(function() {
  'use strict';

  const form = document.getElementById('partnerForm');
  const partnerFields = document.getElementById('partnerFields');
  const submitBtn = document.getElementById('submitBtn');
  const loading = document.getElementById('loading');
  const errorMsg = document.getElementById('errorMessage');
  const reportPreview = document.getElementById('reportPreview');
  const paymentSection = document.getElementById('paymentSection');
  const paymentResult = document.getElementById('paymentResult');

  let currentPartnerCount = 0;
  let currentCaseId = null;

  // Partner count selection
  document.querySelectorAll('.partner-count-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.partner-count-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      const val = parseInt(this.dataset.value);
      document.getElementById('partnerCount').value = val;
      currentPartnerCount = val;
      renderPartnerFields(val);
      updateSubmitButton();
    });
  });

  function renderPartnerFields(count) {
    partnerFields.innerHTML = '';
    const labels = ['A', 'B', 'C'];
    for (let i = 0; i < count; i++) {
      const div = document.createElement('div');
      div.className = 'partner-block bg-gray-50 rounded-lg p-4 border border-gray-200';
      div.innerHTML = `
        <h3 class="text-sm font-semibold text-indigo-600 mb-3">合伙人 ${labels[i]}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-600 mb-1">出资金额（元） <span class="text-red-500">*</span></label>
            <input type="number" name="capital_${i}" min="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例如 100000" required>
          </div>
          <div>
            <label class="block text-xs text-gray-600 mb-1">出力类型 <span class="text-red-500">*</span></label>
            <select name="effortType_${i}" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">请选择</option>
              <option value="全职">全职</option>
              <option value="全职运营">全职运营</option>
              <option value="全职技术">全职技术</option>
              <option value="兼职">兼职</option>
              <option value="兼职运营">兼职运营</option>
              <option value="仅出资">仅出资</option>
              <option value="技术">技术</option>
              <option value="资源">资源</option>
              <option value="供应链">供应链</option>
              <option value="运营">运营</option>
              <option value="主播">主播</option>
            </select>
          </div>
        </div>
        <div class="mt-2">
          <label class="block text-xs text-gray-600 mb-1">职责描述 <span class="text-red-500">*</span></label>
          <textarea name="responsibility_${i}" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="例如：负责选品、运营、客服" required></textarea>
        </div>
      `;
      partnerFields.appendChild(div);
    }
  }

  // Form validation
  function validateForm() {
    if (!currentPartnerCount) return '请选择合伙人数';

    const contacts = form.querySelectorAll('[name="contact"]');
    const contact = contacts[0]?.value?.trim();
    if (!contact || contact.length < 5) return '联系方式（微信或手机号）不能为空';

    for (let i = 0; i < currentPartnerCount; i++) {
      const capital = form.querySelector(`[name="capital_${i}"]`)?.value;
      const capNum = parseFloat(capital);
      if (capital === '' || isNaN(capNum) || capNum < 0) return `合伙人 ${String.fromCharCode(65 + i)} 的出资金额不能为负数`;
      if (capNum === 0) {
        const effort = form.querySelector(`[name="effortType_${i}"]`)?.value;
        if (!effort) return `出资 0 元的合伙人 ${String.fromCharCode(65 + i)} 必须选择出力类型`;
        const resp = form.querySelector(`[name="responsibility_${i}"]`)?.value?.trim();
        if (!resp || resp.length < 2) return `出资 0 元的合伙人 ${String.fromCharCode(65 + i)} 必须填写职责描述`;
      }

      const effort = form.querySelector(`[name="effortType_${i}"]`)?.value;
      if (!effort) return `请选择合伙人 ${String.fromCharCode(65 + i)} 的出力类型`;

      const resp = form.querySelector(`[name="responsibility_${i}"]`)?.value?.trim();
      if (!resp || resp.length < 2) return `合伙人 ${String.fromCharCode(65 + i)} 的职责描述不能为空`;
    }

    return null;
  }

  function updateSubmitButton() {
    const canSubmit = currentPartnerCount > 0;
    submitBtn.disabled = !canSubmit;
  }

  function collectFormData() {
    const labels = ['A', 'B', 'C'];
    const partners = [];
    for (let i = 0; i < currentPartnerCount; i++) {
      partners.push({
        name: labels[i],
        capital: parseFloat(form.querySelector(`[name="capital_${i}"]`).value) || 0,
        effortType: form.querySelector(`[name="effortType_${i}"]`).value,
        responsibility: form.querySelector(`[name="responsibility_${i}"]`).value?.trim() || ''
      });
    }

    return {
      partnerCount: currentPartnerCount,
      partners,
      expectedProfit: form.querySelector('[name="expectedProfit"]').value,
      oralAgreement: form.querySelector('[name="oralAgreement"]').value?.trim(),
      lossConcern: form.querySelector('[name="lossConcern"]').value?.trim(),
      exitConcern: form.querySelector('[name="exitConcern"]').value?.trim(),
      contact: form.querySelector('[name="contact"]').value?.trim()
    };
  }

  // Submit
  form.addEventListener('submit', async function(e) {
    e.preventDefault();

    const error = validateForm();
    if (error) {
      showError(error);
      return;
    }

    const data = collectFormData();

    // Show loading
    setLoading(true);
    hideError();
    hideReport();

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await res.json();

      if (!res.ok) {
        if (result.error === 'dispute') {
          showError(result.message);
        } else {
          showError(result.message || '提交失败，请稍后重试');
        }
        setLoading(false);
        return;
      }

      currentCaseId = result.caseId;
      renderReport(result.previewMarkdown);
      showPaymentSection();
      setLoading(false);

      // Scroll to report
      reportPreview.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      showError('网络请求失败，请检查网络连接后重试');
      setLoading(false);
    }
  });

  // Render markdown report preview
  function renderReport(markdown) {
    reportPreview.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'bg-white rounded-xl shadow-sm border border-gray-200 p-5';

    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold text-indigo-700 mb-3';
    title.textContent = '📋 方案预览';
    container.appendChild(title);

    const content = document.createElement('div');
    content.id = 'reportContent';
    content.innerHTML = simpleMarkdownToHtml(markdown);
    container.appendChild(content);

    reportPreview.appendChild(container);
    reportPreview.classList.remove('hidden');
  }

  // Use marked library for markdown rendering
  function simpleMarkdownToHtml(md) {
    if (!md) return '';
    if (typeof marked !== 'undefined' && marked.parse) {
      return marked.parse(md, { breaks: true, gfm: true });
    }
    // Fallback: if marked CDN hasn't loaded, use simple converter
    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
    return '<p>' + html + '</p>';
  }

  // Payment section
  function showPaymentSection() {
    paymentSection.classList.remove('hidden');
    paymentResult.classList.add('hidden');
  }

  document.getElementById('pay29Btn').addEventListener('click', function() {
    recordPaymentIntent('accept_29');
    paymentResult.textContent = '✅ 已记录 29 元体验版意向。请添加客服微信完成支付获取完整报告。';
    paymentResult.classList.remove('hidden');
  });

  document.getElementById('pay99Btn').addEventListener('click', function() {
    recordPaymentIntent('accept_99');
    paymentResult.textContent = '✅ 已记录 99 元标准版意向。请添加客服微信完成支付获取完整报告。';
    paymentResult.classList.remove('hidden');
  });

  document.getElementById('contactBtn').addEventListener('click', function() {
    recordPaymentIntent('contact');
    paymentResult.textContent = '✅ 已记录。请添加客服微信：xxx（替换为实际微信号）获取完整报告。';
    paymentResult.classList.remove('hidden');
  });

  async function recordPaymentIntent(intent) {
    if (!currentCaseId) return;
    try {
      await fetch(`/api/cases/${currentCaseId}/payment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntent: intent })
      });
    } catch (e) {
      console.error('Failed to record payment intent:', e);
    }
  }

  // UI helpers
  function setLoading(isLoading) {
    if (isLoading) {
      loading.classList.remove('hidden');
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ 生成中...';
    } else {
      loading.classList.add('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = '生成合伙分钱方案';
    }
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
    errorMsg.classList.add('shake');
    setTimeout(() => errorMsg.classList.remove('shake'), 500);
  }

  function hideError() {
    errorMsg.classList.add('hidden');
  }

  function hideReport() {
    reportPreview.classList.add('hidden');
    paymentSection.classList.add('hidden');
  }

  // Auto-fill test case for quick testing
  window.fillTestCase = function(level) {
    const testCases = {
      1: {
        name: '案例1：一人出钱，一人全职',
        data: {
          partners: [
            { capital: 200000, effort: '仅出资', resp: '提供启动资金' },
            { capital: 50000, effort: '全职运营', resp: '负责选品、运营、客服' }
          ],
          profit: '30-50万',
          contact: 'test_wechat_001'
        }
      },
      2: {
        name: '案例2：三人合伙',
        data: {
          partners: [
            { capital: 300000, effort: '仅出资', resp: '提供启动资金' },
            { capital: 50000, effort: '全职运营', resp: '负责日常运营和管理' },
            { capital: 10000, effort: '供应链', resp: '提供货源资源和供应链管理' }
          ],
          profit: '50-100万',
          contact: 'test_wechat_002'
        }
      },
      3: {
        name: '案例3：双方出钱，一方全职',
        data: {
          partners: [
            { capital: 100000, effort: '全职运营', resp: '负责选品、运营、客服' },
            { capital: 100000, effort: '兼职', resp: '负责供应链和物流对接' }
          ],
          profit: '10-20万',
          contact: 'test_wechat_003'
        }
      }
    };

    const tc = testCases[level];
    if (!tc) return;

    // Click partner count
    document.querySelector(`[data-value="${tc.data.partners.length}"]`)?.click();

    // Small delay for fields to render
    setTimeout(() => {
      tc.data.partners.forEach((p, i) => {
        const capitalInput = form.querySelector(`[name="capital_${i}"]`);
        if (capitalInput) capitalInput.value = p.capital;
        const effortSelect = form.querySelector(`[name="effortType_${i}"]`);
        if (effortSelect) effortSelect.value = p.effort;
        const respInput = form.querySelector(`[name="responsibility_${i}"]`);
        if (respInput) respInput.value = p.resp;
      });

      const profitSelect = form.querySelector('[name="expectedProfit"]');
      if (profitSelect) profitSelect.value = tc.data.profit;

      const contactInput = form.querySelector('[name="contact"]');
      if (contactInput) contactInput.value = tc.data.contact;

      console.log(`✅ 已填充: ${tc.name}`);
    }, 100);
  };

  console.log('AI 合伙分钱方案生成器 V0 已加载');
  console.log('测试用例：fillTestCase(1), fillTestCase(2), fillTestCase(3)');

})();
