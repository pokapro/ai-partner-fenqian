import { useState, useRef } from "react";

const PARTNER_CONFIGS = {
  2: [{ id: "A", label: "合伙人 A" }, { id: "B", label: "合伙人 B" }],
  3: [
    { id: "A", label: "合伙人 A" },
    { id: "B", label: "合伙人 B" },
    { id: "C", label: "合伙人 C" },
  ],
  4: [
    { id: "A", label: "合伙人 A" },
    { id: "B", label: "合伙人 B" },
    { id: "C", label: "合伙人 C" },
    { id: "D", label: "合伙人 D" },
  ],
};

const EFFORT_OPTIONS = [
  { value: "全职运营", label: "全职运营" },
  { value: "兼职", label: "兼职" },
  { value: "不出力", label: "仅出资不出力" },
  { value: "技术", label: "技术/开发" },
  { value: "资源", label: "资源/渠道" },
];

const SCENARIOS = [
  {
    label: "A出20万不出力，B出5万全职",
    data: { partnerCount: 2, partners: [
      { name: "A", capital: 200000, effortType: "不出力", responsibility: "仅出资" },
      { name: "B", capital: 50000, effortType: "全职运营", responsibility: "日常运营管理" },
    ], annualProfit: 300000 },
  },
  {
    label: "两人都出钱，一人全职一人兼职",
    data: { partnerCount: 2, partners: [
      { name: "A", capital: 100000, effortType: "全职运营", responsibility: "全面负责公司运营" },
      { name: "B", capital: 100000, effortType: "兼职", responsibility: "周末协助管理" },
    ], annualProfit: 200000 },
  },
  {
    label: "三人合伙：资金+运营+技术",
    data: { partnerCount: 3, partners: [
      { name: "A", capital: 150000, effortType: "不出力", responsibility: "仅出资" },
      { name: "B", capital: 50000, effortType: "全职运营", responsibility: "日常管理+销售" },
      { name: "C", capital: 0, effortType: "技术", responsibility: "产品开发和技术维护" },
    ], annualProfit: 500000 },
  },
];

function QArea({ label, current, setter }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <label style={{ fontSize: "0.8rem", color: "#777", minWidth: 120 }}>{label}</label>
      {["是", "否"].map((v) => (
        <button key={v} onClick={() => setter(v)}
          style={{ padding: "6px 16px", fontSize: "0.8rem", borderRadius: 6, border: current === v ? "2px solid #667eea" : "1px solid #ddd", background: current === v ? "#f0f4ff" : "white", cursor: "pointer", color: current === v ? "#667eea" : "#555" }}
        >{v}</button>
      ))}
    </div>
  );
}

export default function ChatApp() {
  const formRef = useRef(null);
  const reportRef = useRef(null);

  // 基础表单
  const [partnerCount, setPartnerCount] = useState(2);
  const [partners, setPartners] = useState(PARTNER_CONFIGS[2].map(() => ({ name: "", capital: 0, effortType: "", responsibility: "" })));
  const [annualProfit, setAnnualProfit] = useState("");
  const [oralAgreement, setOralAgreement] = useState("");
  const [exitConcern, setExitConcern] = useState("");
  const [lossConcern, setLossConcern] = useState("");
  const [contact, setContact] = useState("");

  // 进阶诊断
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hasCompany, setHasCompany] = useState("");
  const [hasEquityRegistration, setHasEquityRegistration] = useState("");
  const [hasNomineeHolding, setHasNomineeHolding] = useState("");
  const [operatorPerson, setOperatorPerson] = useState("");
  const [financeController, setFinanceController] = useState("");
  const [decisionMaker, setDecisionMaker] = useState("");
  const [hasNonOperatingPartner, setHasNonOperatingPartner] = useState("");
  const [needsControlRight, setNeedsControlRight] = useState("");
  const [worriesExit, setWorriesExit] = useState("");
  const [needsProtocolList, setNeedsProtocolList] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [showResult, setShowResult] = useState(false);

  // 修改报告
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [editTarget, setEditTarget] = useState("auto");
  const [editLoading, setEditLoading] = useState(false);
  const [editHistory, setEditHistory] = useState([]);

  const updatePartner = (idx, field, value) => {
    setPartners((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const applyScenario = (scenario) => {
    setPartnerCount(scenario.data.partnerCount);
    setPartners(scenario.data.partners.map((p) => ({ ...p })));
    setAnnualProfit(scenario.data.annualProfit);
    setResult(null);
    setShowResult(false);
    setError("");
    setEditHistory([]);
    setShowEditDialog(false);
  };

  const handlePartnerCountChange = (count) => {
    setPartnerCount(count);
    setPartners(PARTNER_CONFIGS[count].map(() => ({ name: "", capital: 0, effortType: "", responsibility: "" })));
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    setShowResult(false);

    const body = {
      partnerCount,
      partners: partners.map((p, i) => ({
        name: p.name || String.fromCharCode(65 + i),
        capital: Number(p.capital) || 0,
        effortType: p.effortType,
        responsibility: p.responsibility,
      })),
      annualProfit: Number(annualProfit) || 0,
      contact: contact.trim(),
    };

    if (oralAgreement) body.oralAgreement = oralAgreement;
    if (exitConcern) body.exitConcern = exitConcern;
    if (lossConcern) body.lossConcern = lossConcern;

    if (showAdvanced) {
      if (hasCompany) body.hasCompany = hasCompany === "是";
      if (hasEquityRegistration) body.hasEquityRegistration = hasEquityRegistration === "是";
      if (hasNomineeHolding) body.hasNomineeHolding = hasNomineeHolding === "是";
      if (operatorPerson) body.operatorPerson = operatorPerson;
      if (financeController) body.financeController = financeController;
      if (decisionMaker) body.decisionMaker = decisionMaker;
      if (hasNonOperatingPartner) body.hasNonOperatingPartner = hasNonOperatingPartner === "是";
      if (needsControlRight) body.needsControlRight = needsControlRight === "是";
      if (worriesExit) body.worriesExit = worriesExit === "是";
      if (needsProtocolList) body.needsProtocolList = needsProtocolList === "是";
    }

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || data.error || "生成失败");
        setLoading(false);
        return;
      }

      setResult(data);
      setShowResult(true);
      setLoading(false);
      setEditHistory([]);

      setTimeout(() => {
        reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (e) {
      setError("网络错误，请检查连接后重试");
      setLoading(false);
    }
  };

  // 修改报告
  const handleEditReport = async () => {
    if (!result?.caseId || !editPrompt.trim()) return;
    setEditLoading(true);

    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: result.caseId,
          target: editTarget === "auto" ? null : editTarget,
          instruction: editPrompt.trim(),
          partners: partners.map((p, i) => ({
            name: p.name || String.fromCharCode(65 + i),
            capital: Number(p.capital) || 0,
            effortType: p.effortType,
            responsibility: p.responsibility,
          })),
          hasAdvanced: showAdvanced,
          advancedFields: showAdvanced
            ? {
                hasCompany: hasCompany === "是",
                hasNomineeHolding: hasNomineeHolding === "是",
                hasNonOperatingPartner: hasNonOperatingPartner === "是",
                needsControlRight: needsControlRight === "是",
                worriesExit: worriesExit === "是",
                operatorPerson,
                financeController,
                decisionMaker,
              }
            : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEditHistory((prev) => [...prev, { prompt: editPrompt, target: editTarget, status: "error", error: data.message || "修改失败" }]);
        setEditLoading(false);
        return;
      }

      setResult((prev) => ({ ...prev, previewMarkdown: data.updatedReport || data.previewMarkdown }));
      setEditHistory((prev) => [...prev, { prompt: editPrompt, target: editTarget, status: "success", error: null }]);
      setEditPrompt("");
      setEditLoading(false);
    } catch (e) {
      setEditHistory((prev) => [...prev, { prompt: editPrompt, target: editTarget, status: "error", error: "网络错误" }]);
      setEditLoading(false);
    }
  };

  const handlePayment = async (intent) => {
    if (!result?.caseId) return;
    try {
      await fetch(`/api/cases/${result.caseId}/payment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntent: intent }),
      });
      setResult((prev) => ({ ...prev, paymentRecorded: intent }));
    } catch (e) {
      console.error("Payment record failed", e);
    }
  };

  const renderPreview = (markdown) => {
    if (!markdown) return null;
    const lines = markdown.split("\n").filter(Boolean);
    const previewLines = lines.slice(0, Math.min(lines.length, 80));

    return (
      <div className="prose prose-sm max-w-none">
        {previewLines.map((line, i) => {
          if (line.startsWith("## ")) return <h3 key={i} className="text-lg font-bold mt-4 mb-2">{line.replace("## ", "")}</h3>;
          if (line.startsWith("### ")) return <h4 key={i} className="font-bold mt-3 mb-1">{line.replace("### ", "")}</h4>;
          if (line.match(/^\|.*\|/)) return <p key={i} className="text-xs font-mono text-gray-600 my-1">{line}</p>;
          if (line.startsWith("- ")) return <li key={i} className="ml-4 list-disc mb-1">{line.replace("- ", "")}</li>;
          if (line.startsWith("> ")) return <blockquote key={i} className="border-l-4 border-blue-300 pl-3 italic text-gray-600 my-2">{line.replace("> ", "")}</blockquote>;
          if (line.startsWith("---")) return <hr key={i} className="my-3" />;
          return <p key={i} className="my-1">{line}</p>;
        })}
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", padding: "40px 20px 30px", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: 8 }}>🤝 AI 合伙分钱诊断</h1>
        <p style={{ fontSize: "0.95rem", opacity: 0.9, maxWidth: 500, margin: "0 auto", lineHeight: 1.6 }}>
          输入合伙人的出资、出力、利润预期，生成<strong>分钱方案 + 五权结构诊断 + 贡献估值 + 协议草稿</strong>。
        </p>
      </header>

      <main style={{ flex: 1, maxWidth: 720, margin: "0 auto", padding: "20px 16px 80px", width: "100%" }}>
        {/* 合伙人数 + 场景 */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#666", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>选择合伙人数</h2>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {[2, 3, 4].map((n) => (
              <button key={n} onClick={() => handlePartnerCountChange(n)}
                style={{ flex: 1, padding: "12px 0", fontSize: "1rem", fontWeight: 600, border: partnerCount === n ? "2px solid #667eea" : "1px solid #ddd", borderRadius: 10, background: partnerCount === n ? "#f0f4ff" : "white", cursor: "pointer", color: partnerCount === n ? "#667eea" : "#555" }}
              >{n} 人合伙</button>
            ))}
          </div>
          <p style={{ fontSize: "0.75rem", color: "#999", marginBottom: 8 }}>快速填一个场景试试：</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SCENARIOS.map((s, i) => (
              <button key={i} onClick={() => applyScenario(s)}
                style={{ padding: "8px 14px", fontSize: "0.8rem", background: "#f0f4ff", border: "1px solid #d0d9f0", borderRadius: 8, cursor: "pointer", color: "#444", whiteSpace: "nowrap" }}
                onMouseEnter={(e) => e.target.style.background = "#e0e8ff"}
                onMouseLeave={(e) => e.target.style.background = "#f0f4ff"}
              >{s.label}</button>
            ))}
          </div>
        </section>

        {/* 合伙人信息 */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#666", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>合伙人信息</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {PARTNER_CONFIGS[partnerCount].map((cfg, idx) => (
              <div key={cfg.id} style={{ background: "white", border: "1px solid #e8ecf2", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 10, color: "#444", fontSize: "0.9rem" }}>{cfg.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.8rem", color: "#777" }}>姓名</label>
                    <input type="text" placeholder={cfg.id} value={partners[idx]?.name || ""} onChange={(e) => updatePartner(idx, "name", e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.8rem", color: "#777" }}>出资</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="number" placeholder="0" value={partners[idx]?.capital || ""} onChange={(e) => updatePartner(idx, "capital", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                      <span style={{ fontSize: "0.8rem", color: "#999", minWidth: 20 }}>元</span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.8rem", color: "#777" }}>出力类型</label>
                    <select value={partners[idx]?.effortType || ""} onChange={(e) => updatePartner(idx, "effortType", e.target.value)}
                      style={{ ...inputStyle, background: "white", cursor: "pointer", color: !partners[idx]?.effortType ? "#999" : "#333" }}>
                      <option value="" disabled>选择</option>
                      {EFFORT_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.8rem", color: "#777" }}>职责</label>
                    <input type="text" placeholder="日常运营、技术开发等" value={partners[idx]?.responsibility || ""} onChange={(e) => updatePartner(idx, "responsibility", e.target.value)} style={inputStyle} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 经营预期 */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#666", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>经营预期与顾虑</h2>
          <div style={{ background: "white", border: "1px solid #e8ecf2", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: "0.8rem", color: "#777" }}>年利润</label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" placeholder="0" value={annualProfit} onChange={(e) => setAnnualProfit(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <span style={{ fontSize: "0.8rem", color: "#999" }}>元</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: "0.8rem", color: "#777" }}>口头约定</label>
              <input type="text" placeholder="例如：五五分" value={oralAgreement} onChange={(e) => setOralAgreement(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: "0.8rem", color: "#777", display: "block", marginBottom: 4 }}>顾虑</label>
              <input type="text" placeholder="关于亏损？例如：亏损怎么承担" value={lossConcern} onChange={(e) => setLossConcern(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
              <input type="text" placeholder="关于退出？例如：某人想退出怎么办" value={exitConcern} onChange={(e) => setExitConcern(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </section>

        {/* 进阶诊断 */}
        <section style={{ marginBottom: 24 }}>
          <button onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ width: "100%", padding: "12px 16px", fontSize: "0.9rem", fontWeight: 600, background: showAdvanced ? "#667eea" : "#f5f7ff", color: showAdvanced ? "white" : "#667eea", border: showAdvanced ? "2px solid #667eea" : "2px dashed #c8d4f0", borderRadius: 12, cursor: "pointer" }}>
            {showAdvanced ? "△ 收起进阶诊断" : "▽ 打开进阶诊断：股权、决策权、退出机制"}
          </button>
          {showAdvanced && (
            <div style={{ background: "#fafbff", border: "1px solid #d0d9f0", borderRadius: 12, padding: 16, marginTop: 8 }}>
              <p style={{ fontSize: "0.8rem", color: "#777", marginBottom: 14, lineHeight: 1.4 }}>
                填写后报告将包含<strong>五权结构诊断</strong>和<strong>完善协议草稿</strong>。
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <QArea label="是否已注册公司" current={hasCompany} setter={setHasCompany} />
                <QArea label="股权是否已登记" current={hasEquityRegistration} setter={setHasEquityRegistration} />
                <QArea label="是否存在代持" current={hasNomineeHolding} setter={setHasNomineeHolding} />
                <QArea label="有人只分红不经营？" current={hasNonOperatingPartner} setter={setHasNonOperatingPartner} />
                <QArea label="需某一方保持控制权？" current={needsControlRight} setter={setNeedsControlRight} />
                <QArea label="担心合伙人退出？" current={worriesExit} setter={setWorriesExit} />
                <QArea label="需要协议文件清单？" current={needsProtocolList} setter={setNeedsProtocolList} />
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: "0.8rem", color: "#777" }}>运营负责人</label>
                  <input type="text" placeholder="谁日常管公司" value={operatorPerson} onChange={(e) => setOperatorPerson(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: "0.8rem", color: "#777" }}>财务负责人</label>
                  <input type="text" placeholder="谁掌握财务账户" value={financeController} onChange={(e) => setFinanceController(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: "0.8rem", color: "#777" }}>谁拍板</label>
                  <input type="text" placeholder="重大事项谁说了算" value={decisionMaker} onChange={(e) => setDecisionMaker(e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 联系方式 */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#666", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>联系方式</h2>
          <div style={{ background: "white", border: "1px solid #e8ecf2", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: "0.8rem", color: "#777" }}>微信/手机</label>
              <input type="text" placeholder="用于获取完整报告" value={contact} onChange={(e) => setContact(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </section>

        {/* 生成按钮 */}
        <button onClick={handleSubmit} disabled={loading}
          style={{ width: "100%", padding: "14px 0", fontSize: "1.05rem", fontWeight: 700, color: "white", background: loading ? "#999" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", border: "none", borderRadius: 12, cursor: loading ? "not-allowed" : "pointer", marginBottom: 16 }}
        >{loading ? "⏳ 正在生成方案..." : "✨ 生成分钱方案"}</button>

        {/* 错误提示 */}
        {error && (
          <div style={{ padding: 14, background: "#fff0f0", border: "1px solid #ffd4d4", borderRadius: 10, color: "#c00", fontSize: "0.85rem", marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        {/* 报告区域 */}
        {showResult && result && (
          <div ref={reportRef} id="result-section">
            <div style={{ background: "#f8ffed", border: "1px solid #c8e6a0", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: "0.85rem", color: "#2e7d32" }}>
              ✅ 方案已生成
              {editHistory.length > 0 && <span style={{ marginLeft: 8, fontSize: "0.75rem", color: "#ff9800" }}>已修改 {editHistory.length} 次</span>}
              {result.caseId && <span style={{ fontSize: "0.75rem", color: "#888", marginLeft: 8 }}>ID: {result.caseId.slice(0, 8)}...</span>}
            </div>

            <div style={{ background: "white", border: "1px solid #e8ecf2", borderRadius: 12, padding: 20, marginBottom: 16, lineHeight: 1.6, fontSize: "0.9rem" }}>
              {result.previewMarkdown ? renderPreview(result.previewMarkdown) : <p style={{ color: "#888" }}>报告内容加载中...</p>}
            </div>

            {/* 修改报告区 */}
            <div style={{ marginBottom: 16 }}>
              <button onClick={() => setShowEditDialog(!showEditDialog)}
                style={{ width: "100%", padding: "10px 0", fontSize: "0.85rem", fontWeight: 600, background: showEditDialog ? "#667eea" : "#f5f7ff", color: showEditDialog ? "white" : "#667eea", border: showEditDialog ? "1px solid #667eea" : "1px dashed #667eea", borderRadius: 10, cursor: "pointer" }}
              >{showEditDialog ? "▲ 收起修改面板" : "✏️ 让 AI 修改报告（支持局部调整）"}</button>

              {showEditDialog && (
                <div style={{ background: "#fafbff", border: "1px solid #d0d9f0", borderRadius: 12, padding: 16, marginTop: 8 }}>
                  <p style={{ fontSize: "0.8rem", color: "#777", marginBottom: 12, lineHeight: 1.4 }}>
                    告诉 AI 你想怎么改——可以<strong>只改某一部分</strong>（如"把方案三的A改成6，B改成4"），也可以<strong>全部重做</strong>。
                  </p>
                  <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder={`示例：\n- 把方案三的A和B分成改成6:4\n- 帮我补充退出机制，要求三年回本后才能退\n- 全部重做，A和B平均分配`}
                    style={{ width: "100%", minHeight: 80, padding: 10, fontSize: "0.85rem", border: "1px solid #dde2eb", borderRadius: 8, resize: "vertical", fontFamily: "inherit", marginBottom: 10 }} />
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select value={editTarget} onChange={(e) => setEditTarget(e.target.value)}
                      style={{ fontSize: "0.8rem", padding: "8px 10px", border: "1px solid #dde2eb", borderRadius: 6, background: "white", flexShrink: 0 }}>
                      <option value="auto">自动识别改哪部分</option>
                      <option value="合伙关系摘要">合伙关系摘要</option>
                      <option value="核心矛盾诊断">核心矛盾诊断</option>
                      <option value="贡献估值表">贡献估值表</option>
                      <option value="五权结构诊断">五权结构诊断</option>
                      <option value="三套分钱方案">三套分钱方案</option>
                      <option value="利润模拟表">利润模拟表</option>
                      <option value="推荐方案与调整条件">推荐方案</option>
                      <option value="风险清单">风险清单</option>
                      <option value="协议条款草稿">协议条款草稿</option>
                      <option value="沟通话术与下一步行动">沟通话术</option>
                      <option value="全部">全部重做</option>
                    </select>
                    <button onClick={handleEditReport} disabled={editLoading || !editPrompt.trim()}
                      style={{ flex: 1, padding: "10px 0", fontSize: "0.85rem", fontWeight: 600, color: "white", background: editLoading || !editPrompt.trim() ? "#999" : "#667eea", border: "none", borderRadius: 8, cursor: editLoading || !editPrompt.trim() ? "not-allowed" : "pointer" }}
                    >{editLoading ? "⏳ 修改中..." : "🚀 应用修改"}</button>
                  </div>
                </div>
              )}

              {editHistory.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: "0.75rem", color: "#888", marginBottom: 6, fontWeight: 600 }}>修改记录</div>
                  {editHistory.map((h, i) => (
                    <div key={i} style={{ padding: "8px 12px", marginBottom: 4, borderRadius: 6,
                      background: h.status === "success" ? "#f0faf0" : "#fff5f5",
                      border: "1px solid", borderColor: h.status === "success" ? "#c8e6c8" : "#ffd4d4",
                      fontSize: "0.8rem", color: h.status === "success" ? "#2e7d32" : "#c00" }}>
                      <strong>第{i+1}次：</strong>{h.prompt}
                      <span style={{ float: "right", fontSize: "0.75rem" }}>{h.status === "success" ? "✅" : "❌"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 付款转化 */}
            <div style={{ background: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)", borderRadius: 12, padding: 20, textAlign: "center" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 6 }}>📋 获取完整报告</h3>
              <p style={{ fontSize: "0.85rem", color: "#555", marginBottom: 16, lineHeight: 1.5 }}>
                预览版只展示了部分内容。<br />完整版含人工审核和完整协议草稿。
              </p>
              <div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
                <div style={{ background: "white", borderRadius: 10, padding: 12, textAlign: "left" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>29.9 元 · 体验版</div>
                      <ul style={{ fontSize: "0.78rem", color: "#666", margin: "6px 0 0", paddingLeft: 16, lineHeight: 1.6 }}>
                        <li>完整 AI 报告（含五权诊断）</li>
                        <li>三套分钱方案 + 利润模拟</li>
                        <li>基础条款草稿</li>
                      </ul>
                    </div>
                    <button onClick={() => handlePayment("full_report_29_9")}
                      style={{ padding: "10px 20px", fontSize: "0.85rem", fontWeight: 600, color: "white", background: "#667eea", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" }}
                    >解锁</button>
                  </div>
                </div>
                <div style={{ background: "#fff8e1", borderRadius: 10, padding: 12, border: "2px solid #ffb300", textAlign: "left" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>99 元 · 人工审核版 <span style={{ fontSize: "0.7rem", background: "#ffb300", color: "white", padding: "2px 6px", borderRadius: 4, marginLeft: 6 }}>推荐</span></div>
                      <ul style={{ fontSize: "0.78rem", color: "#666", margin: "6px 0 0", paddingLeft: 16, lineHeight: 1.6 }}>
                        <li>全部体验版权益</li>
                        <li>人工快速审核一次</li>
                        <li>可补充信息后重新生成</li>
                        <li>重点条款草稿 + 协议清单</li>
                      </ul>
                    </div>
                    <button onClick={() => handlePayment("reviewed_draft_99")}
                      style={{ padding: "10px 20px", fontSize: "0.85rem", fontWeight: 600, color: "#ff8f00", background: "white", border: "2px solid #ffb300", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" }}
                    >解锁</button>
                  </div>
                </div>
                <p style={{ fontSize: "0.75rem", color: "#888", marginTop: 8 }}>付款意向已记录，客服会通过微信/手机联系您</p>
              </div>
              {result.paymentRecorded && (
                <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(255,255,255,0.7)", borderRadius: 8, fontSize: "0.8rem", color: "#2e7d32" }}>
                  ✅ 已记录您的选择
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "16px 20px", fontSize: "0.75rem", color: "#aaa", borderTop: "1px solid #eee" }}>
        右侧聊天可 AI 顾问辅助 · 仅供参考不构成法律意见
      </footer>
    </div>
  );
}

const inputStyle = {
  padding: "8px 10px", fontSize: "0.85rem", border: "1px solid #dde2eb", borderRadius: 6, outline: "none", width: "100%", boxSizing: "border-box",
};
