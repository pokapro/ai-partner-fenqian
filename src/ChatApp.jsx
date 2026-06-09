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
    data: {
      partnerCount: 2,
      partners: [
        { name: "A", capital: 200000, effortType: "不出力", responsibility: "仅出资" },
        { name: "B", capital: 50000, effortType: "全职运营", responsibility: "日常运营管理" },
      ],
      annualProfit: 300000,
    },
  },
  {
    label: "两人都出钱，一人全职一人兼职",
    data: {
      partnerCount: 2,
      partners: [
        { name: "A", capital: 100000, effortType: "全职运营", responsibility: "全面负责公司运营" },
        { name: "B", capital: 100000, effortType: "兼职", responsibility: "周末协助管理" },
      ],
      annualProfit: 200000,
    },
  },
  {
    label: "三人合伙：资金+运营+技术",
    data: {
      partnerCount: 3,
      partners: [
        { name: "A", capital: 150000, effortType: "不出力", responsibility: "仅出资" },
        { name: "B", capital: 50000, effortType: "全职运营", responsibility: "日常管理+销售" },
        { name: "C", capital: 0, effortType: "技术", responsibility: "产品开发和技术维护" },
      ],
      annualProfit: 500000,
    },
  },
];

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

  // 进阶诊断（默认折叠）
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

    // 进阶诊断字段
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

      setTimeout(() => {
        reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (e) {
      setError("网络错误，请检查连接后重试");
      setLoading(false);
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
    const previewLines = lines.slice(0, Math.min(lines.length, 50));

    return (
      <div className="prose prose-sm max-w-none">
        {previewLines.map((line, i) => {
          if (line.startsWith("## ")) return <h3 key={i} className="text-lg font-bold mt-4 mb-2">{line.replace("## ", "")}</h3>;
          if (line.startsWith("### ")) return <h4 key={i} className="font-bold mt-3 mb-1">{line.replace("### ", "")}</h4>;
          if (line.startsWith("| ") || line.startsWith("|:")) return <p key={i} className="text-xs font-mono text-gray-600 my-1">{line}</p>;
          if (line.startsWith("- ")) return <li key={i} className="ml-4 list-disc">{line.replace("- ", "")}</li>;
          if (line.startsWith("> ")) return <blockquote key={i} className="border-l-4 border-blue-300 pl-3 italic text-gray-600 my-2">{line.replace("> ", "")}</blockquote>;
          if (line.startsWith("---")) return <hr key={i} className="my-3" />;
          return <p key={i} className="my-1">{line}</p>;
        })}
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* 顶部 */}
      <header style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", padding: "40px 20px 30px", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: 8 }}>🤝 AI 合伙分钱诊断</h1>
        <p style={{ fontSize: "0.95rem", opacity: 0.9, maxWidth: 500, margin: "0 auto", lineHeight: 1.6 }}>
          输入合伙人的出资、出力、利润预期，生成<strong>分钱方案 + 五权结构诊断 + 贡献估值 + 协议草稿</strong>。
        </p>
      </header>

      <main style={{ flex: 1, maxWidth: 720, margin: "0 auto", padding: "20px 16px 80px", width: "100%" }}>
        {/* 示例场景 */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#666", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>快速填一个场景试试</h2>
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

        {/* 合伙人数 */}
        <section ref={formRef} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#666", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>合伙人数</h2>
          <div style={{ display: "flex", gap: 10 }}>
            {[2, 3, 4].map((n) => (
              <button key={n} onClick={() => handlePartnerCountChange(n)}
                style={{ flex: 1, padding: "12px 0", fontSize: "1rem", fontWeight: 600, border: partnerCount === n ? "2px solid #667eea" : "1px solid #ddd", borderRadius: 10, background: partnerCount === n ? "#f0f4ff" : "white", cursor: "pointer", color: partnerCount === n ? "#667eea" : "#555" }}
              >{n} 人合伙</button>
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
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.8rem", color: "#777" }}>姓名/代号</label>
                    <input type="text" placeholder={cfg.id} value={partners[idx]?.name || ""} onChange={(e) => updatePartner(idx, "name", e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.8rem", color: "#777" }}>出资金额</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="number" placeholder="0" value={partners[idx]?.capital || ""} onChange={(e) => updatePartner(idx, "capital", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                      <span style={{ fontSize: "0.8rem", color: "#999", minWidth: 20 }}>元</span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.8rem", color: "#777" }}>出力类型</label>
                    <select value={partners[idx]?.effortType || ""} onChange={(e) => updatePartner(idx, "effortType", e.target.value)}
                      style={{ ...inputStyle, background: "white", cursor: "pointer", color: !partners[idx]?.effortType ? "#999" : "#333" }}>
                      <option value="" disabled>选择出力类型</option>
                      {EFFORT_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.8rem", color: "#777" }}>职责描述</label>
                    <input type="text" placeholder="例如：日常运营管理、技术开发" value={partners[idx]?.responsibility || ""} onChange={(e) => updatePartner(idx, "responsibility", e.target.value)} style={inputStyle} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 经营预期 */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#666", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>经营预期</h2>
          <div style={{ background: "white", border: "1px solid #e8ecf2", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: "0.8rem", color: "#777" }}>预计年利润</label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" placeholder="0" value={annualProfit} onChange={(e) => setAnnualProfit(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <span style={{ fontSize: "0.8rem", color: "#999" }}>元</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: "0.8rem", color: "#777" }}>口头约定</label>
              <input type="text" placeholder="已有口头约定？例如：五五分" value={oralAgreement} onChange={(e) => setOralAgreement(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: "0.8rem", color: "#777" }}>顾虑</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input type="text" placeholder="关于亏损？例如：亏损怎么承担" value={lossConcern} onChange={(e) => setLossConcern(e.target.value)} style={inputStyle} />
                <input type="text" placeholder="关于退出？例如：某人想退出怎么办" value={exitConcern} onChange={(e) => setExitConcern(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>
        </section>

        {/* === 进阶诊断（默认折叠） === */}
        <section style={{ marginBottom: 24 }}>
          <button onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ width: "100%", padding: "12px 16px", fontSize: "0.9rem", fontWeight: 600, background: showAdvanced ? "#667eea" : "#f5f7ff", color: showAdvanced ? "white" : "#667eea", border: showAdvanced ? "2px solid #667eea" : "2px dashed #c8d4f0", borderRadius: 12, cursor: "pointer" }}>
            {showAdvanced ? "△ 收起进阶诊断" : "▽ 进阶诊断：股权、决策权和退出机制"}
          </button>

          {showAdvanced && (
            <div style={{ background: "#fafbff", border: "1px solid #d0d9f0", borderRadius: 12, padding: 16, marginTop: 8 }}>
              <p style={{ fontSize: "0.8rem", color: "#777", marginBottom: 14, lineHeight: 1.4 }}>
                填写进阶信息后，报告将包含<strong>五权结构诊断</strong>、<strong>贡献估值表</strong>和<strong>完善协议草稿</strong>。
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: "0.8rem", color: "#777", minWidth: 120 }}>是否已注册公司</label>
                  {["是","否"].map(v => (
                    <button key={v} onClick={() => setHasCompany(v)}
                      style={{ padding: "6px 16px", fontSize: "0.8rem", borderRadius: 6, border: hasCompany===v ? "2px solid #667eea" : "1px solid #ddd", background: hasCompany===v ? "#f0f4ff" : "white", cursor: "pointer", color: hasCompany===v ? "#667eea" : "#555" }}
                    >{v}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: "0.8rem", color: "#777", minWidth: 120 }}>股权是否已登记</label>
                  {["是","否"].map(v => (
                    <button key={v} onClick={() => setHasEquityRegistration(v)}
                      style={{ padding: "6px 16px", fontSize: "0.8rem", borderRadius: 6, border: hasEquityRegistration===v ? "2px solid #667eea" : "1px solid #ddd", background: hasEquityRegistration===v ? "#f0f4ff" : "white", cursor: "pointer", color: hasEquityRegistration===v ? "#667eea" : "#555" }}
                    >{v}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: "0.8rem", color: "#777", minWidth: 120 }}>是否存在代持</label>
                  {["是","否"].map(v => (
                    <button key={v} onClick={() => setHasNomineeHolding(v)}
                      style={{ padding: "6px 16px", fontSize: "0.8rem", borderRadius: 6, border: hasNomineeHolding===v ? "2px solid #667eea" : "1px solid #ddd", background: hasNomineeHolding===v ? "#f0f4ff" : "white", cursor: "pointer", color: hasNomineeHolding===v ? "#667eea" : "#555" }}
                    >{v}</button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: "0.8rem", color: "#777" }}>日常运营负责人</label>
                  <input type="text" placeholder="例如：A负责日常管理" value={operatorPerson} onChange={(e) => setOperatorPerson(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: "0.8rem", color: "#777" }}>财务/账户负责人</label>
                  <input type="text" placeholder="谁掌握财务账户" value={financeController} onChange={(e) => setFinanceController(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: "0.8rem", color: "#777" }}>重大事项谁拍板</label>
                  <input type="text" placeholder="例如：A说了算 / 投票决定" value={decisionMaker} onChange={(e) => setDecisionMaker(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: "0.8rem", color: "#777", minWidth: 120 }}>有人只分红不经营？</label>
                  {["是","否"].map(v => (
                    <button key={v} onClick={() => setHasNonOperatingPartner(v)}
                      style={{ padding: "6px 16px", fontSize: "0.8rem", borderRadius: 6, border: hasNonOperatingPartner===v ? "2px solid #667eea" : "1px solid #ddd", background: hasNonOperatingPartner===v ? "#f0f4ff" : "white", cursor: "pointer", color: hasNonOperatingPartner===v ? "#667eea" : "#555" }}
                    >{v}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: "0.8rem", color: "#777", minWidth: 120 }}>需某一方保持控制权？</label>
                  {["是","否"].map(v => (
                    <button key={v} onClick={() => setNeedsControlRight(v)}
                      style={{ padding: "6px 16px", fontSize: "0.8rem", borderRadius: 6, border: needsControlRight===v ? "2px solid #667eea" : "1px solid #ddd", background: needsControlRight===v ? "#f0f4ff" : "white", cursor: "pointer", color: needsControlRight===v ? "#667eea" : "#555" }}
                    >{v}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: "0.8rem", color: "#777", minWidth: 120 }}>担心合伙人退出？</label>
                  {["是","否"].map(v => (
                    <button key={v} onClick={() => setWorriesExit(v)}
                      style={{ padding: "6px 16px", fontSize: "0.8rem", borderRadius: 6, border: worriesExit===v ? "2px solid #667eea" : "1px solid #ddd", background: worriesExit===v ? "#f0f4ff" : "white", cursor: "pointer", color: worriesExit===v ? "#667eea" : "#555" }}
                    >{v}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: "0.8rem", color: "#777", minWidth: 120 }}>需要协议文件清单？</label>
                  {["是","否"].map(v => (
                    <button key={v} onClick={() => setNeedsProtocolList(v)}
                      style={{ padding: "6px 16px", fontSize: "0.8rem", borderRadius: 6, border: needsProtocolList===v ? "2px solid #667eea" : "1px solid #ddd", background: needsProtocolList===v ? "#f0f4ff" : "white", cursor: "pointer", color: needsProtocolList===v ? "#667eea" : "#555" }}
                    >{v}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 联系方式 */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#666", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>联系方式（获取完整报告用）</h2>
          <div style={{ background: "white", border: "1px solid #e8ecf2", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: "0.8rem", color: "#777" }}>微信/手机号</label>
              <input type="text" placeholder="必填，用于接收完整报告" value={contact} onChange={(e) => setContact(e.target.value)} style={inputStyle} />
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
              <span style={{ background: "#f0f0f0", padding: "2px 8px", borderRadius: 4, marginLeft: 8, fontSize: "0.75rem", color: "#666" }}>
                {showAdvanced ? "进阶诊断" : "基础诊断"}
              </span>
              {result.caseId && <span style={{ fontSize: "0.75rem", color: "#888", marginLeft: 8 }}>ID: {result.caseId.slice(0, 12)}...</span>}
            </div>

            <div style={{ background: "white", border: "1px solid #e8ecf2", borderRadius: 12, padding: 20, marginBottom: 16, lineHeight: 1.6, fontSize: "0.9rem" }}>
              {result.previewMarkdown ? renderPreview(result.previewMarkdown) : <p style={{ color: "#888" }}>报告内容加载中...</p>}
            </div>

            {/* 付款转化（V0.4 升级档位） */}
            <div style={{ background: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)", borderRadius: 12, padding: 20, textAlign: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 6 }}>📋 获取完整报告</h3>
              <p style={{ fontSize: "0.85rem", color: "#555", marginBottom: 16, lineHeight: 1.5 }}>
                预览版只展示了部分内容。<br />
                完整版包含五权结构诊断、协议草稿和人工审核。
              </p>
              <div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
                <div style={{ background: "white", borderRadius: 10, padding: 12, textAlign: "left" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>29.9 元 · 体验版</div>
                      <ul style={{ fontSize: "0.78rem", color: "#666", margin: "6px 0 0", paddingLeft: 16, lineHeight: 1.6 }}>
                        <li>完整 AI 报告（含五权结构诊断）</li>
                        <li>三套分钱方案 + 利润模拟表</li>
                        <li>基础风险提示 + 条款草稿</li>
                      </ul>
                    </div>
                    <button onClick={() => handlePayment("full_report_29_9")}
                      style={{ padding: "10px 20px", fontSize: "0.85rem", fontWeight: 600, color: "white", background: "#667eea", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" }}
                    >解锁</button>
                  </div>
                </div>
                <div style={{ background: "#fff8e1", borderRadius: 10, padding: 12, border: "2px solid #ffb300", textAlign: "left" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>99 元 · 人工审核版 <span style={{ fontSize: "0.7rem", background: "#ffb300", color: "white", padding: "2px 6px", borderRadius: 4, marginLeft: 6 }}>推荐</span></div>
                      <ul style={{ fontSize: "0.78rem", color: "#666", margin: "6px 0 0", paddingLeft: 16, lineHeight: 1.6 }}>
                        <li>全部体验版权益</li>
                        <li>人工快速审核一次</li>
                        <li>可补充信息后重新生成</li>
                        <li>重点条款草稿 + 协议文件清单</li>
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
                  ✅ 已记录您的选择：{result.paymentRecorded === "full_report_29_9" ? "29.9元体验版" : result.paymentRecorded === "reviewed_draft_99" ? "99元人工审核版" : result.paymentRecorded}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "16px 20px", fontSize: "0.75rem", color: "#aaa", borderTop: "1px solid #eee" }}>
        💡 右侧聊天可 AI 顾问辅助填写 · 平台数据加密存储 · 仅供参考不构成法律意见
      </footer>
    </div>
  );
}

const inputStyle = {
  padding: "8px 10px", fontSize: "0.85rem", border: "1px solid #dde2eb", borderRadius: 6, outline: "none", width: "100%", boxSizing: "border-box",
};
