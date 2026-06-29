// 6 维并行检测引擎 — 同时扫描用户输入的所有维度
// 替代旧决策树的单一入口 4 条线路模式
// 创建：2026-06-26 v1.0.0

// ============= 维度定义 =============

const DIMENSIONS = {
  // 行业维度
  industry: {
    key: 'industry',
    label: '行业',
    priority: 1,
    detect: (text) => {
      const map = [
        { kw: ['餐厅','饭店','餐饮','开店','门店','实体','奶茶','咖啡','美发','美容','超市','便利店'], val: '实体门店', prompt: '门店经营专属条款（备用金/存货/装修折旧）' },
        { kw: ['电商','直播','淘宝','抖音','带货','亚马逊','速卖通','tiktok','shopee'], val: '电商/直播', prompt: '电商/直播专属条款（账号归属/IP/流量分成）' },
        { kw: ['科技','saas','软件','app','小程序','技术','开发','代码','产品经理'], val: '科技/服务', prompt: '科技服务专属条款（IP归属/技术入股/vesting）' },
        { kw: ['单项目','一单','短期','项目制','承揽','工程'], val: '单项目合伙', prompt: '单项目合伙专属条款（项目周期/收益分配/退出）' },
        { kw: ['加盟','连锁','分店','扩店','品牌授权','加盟商','直营'], val: '连锁加盟', prompt: '连锁加盟专属条款（品牌隔离/区域合伙人/加盟管理）' },
        { kw: ['制造','工厂','生产','代工','工厂'], val: '生产制造', prompt: '生产制造专属条款（设备折旧/产能/供应链）' },
      ];
      for (const m of map) {
        if (m.kw.some(k => text.includes(k))) return m;
      }
      return null;
    }
  },

  // 人数维度
  partnerCount: {
    key: 'partnerCount',
    label: '合伙人数',
    priority: 2,
    detect: (text) => {
      if (/八个|8人|8个人|八个人|我们八个/.test(text)) return { val: 8, prompt: '6+人平台持股/GP-LP架构' };
      if (/七个|7人|7个人/.test(text)) return { val: 7, prompt: '6+人平台持股/GP-LP架构' };
      if (/六个|6人|6个人|六个人|我们六个/.test(text)) return { val: 6, prompt: '6+人平台持股/GP-LP架构' };
      if (/五个|5人|5个人|五个人|我们五个/.test(text)) return { val: 5, prompt: '4-5人均衡治理/加盟合伙' };
      if (/四个|4人|4个人|四个人|我们四个/.test(text)) return { val: 4, prompt: '4-5人1天使+3执行/均分治理' };
      if (/三个|3人|3个人|三个人|我们三个/.test(text)) return { val: 3, prompt: '3人1+2主导/三角色/均分' };
      if (/两个|2人|2个人|两个人|我俩|我们俩|我和一个|我和我/.test(text)) return { val: 2, prompt: '2人资金+运营/资金+技术/夫妻' };
      return null;
    }
  },

  // 阶段维度
  stage: {
    key: 'stage',
    label: '公司阶段',
    priority: 3,
    detect: (text) => {
      if (/已注册|公司已经|工商登记|营业执照/.test(text)) return { val: '已注册', prompt: '协议对接章程/工商变更' };
      if (/没注册|未注册|筹备|准备开|计划/.test(text)) return { val: '未注册', prompt: '协议就是全部/建议注册' };
      if (/做了\s*\d+\s*年|经营了|运营了/.test(text)) return { val: '已运营', prompt: '历史权益追溯/架构重整' };
      if (/投资.*进来|融资|天使|pre-?a|a轮/.test(text)) return { val: '融资中', prompt: '对赌/反稀释/优先清算/期权池' };
      if (/亏|赔|亏损|倒闭|清盘/.test(text)) return { val: '亏损/异常', prompt: '亏损分担/退出/债务处理' };
      if (/想散伙|闹翻|拆伙|不干了/.test(text)) return { val: '退出/散伙', prompt: '退出机制/估值/回购/清算' };
      return null;
    }
  },

  // 资本维度
  capital: {
    key: 'capital',
    label: '资本结构',
    priority: 4,
    detect: (text) => {
      const hits = [];
      if (/对赌|业绩承诺|回购.*协议|1\.\d+倍|年化/.test(text)) hits.push('对赌条款');
      if (/反稀释|稀释|股权.*稀释/.test(text)) hits.push('反稀释条款');
      if (/优先清算|清算权|优先权/.test(text)) hits.push('优先清算权');
      if (/期权|期权池|员工持股|esop|vesting|成熟.*期/.test(text)) hits.push('期权池/Vesting');
      if (/gp|lp|有限合伙|持股平台/.test(text)) hits.push('GP LP架构');
      if (/ab股|同股不同权|双层股权|投票权分离/.test(text)) hits.push('AB股架构');
      if (/技术入股|资源入股|干股/.test(text)) hits.push('技术/资源入股');
      if (/人力股|动态股权|人力.*股/.test(text)) hits.push('人力股/Vesting');
      if (hits.length > 0) return { val: hits.join('+'), prompt: hits.join('、') + '展开' };
      return null;
    }
  },

  // 治理维度
  governance: {
    key: 'governance',
    label: '治理需求',
    priority: 5,
    detect: (text) => {
      const hits = [];
      if (/代持|隐名|显名|名义股东/.test(text)) hits.push('代持安排');
      if (/一致行动/ .test(text)) hits.push('一致行动人');
      if (/董事会|董事.*席位/.test(text)) hits.push('董事会设置');
      if (/一票否决|否决权/.test(text)) hits.push('一票否决权');
      if (/控制权|投票权|表决权/.test(text)) hits.push('控制权设计');
      if (/竞业|挖客户|保密/.test(text)) hits.push('竞业/保密');
      if (/离婚|夫妻/.test(text)) hits.push('婚姻对股权影响');
      if (hits.length > 0) return { val: hits.join('+'), prompt: hits.join('、') + '展开' };
      return null;
    }
  },

  // 风险维度
  risk: {
    key: 'risk',
    label: '风险/异常',
    priority: 6,
    detect: (text) => {
      const hits = [];
      if (/退出|退股|想走|不干了|离职/.test(text)) hits.push('合伙人退出');
      if (/亏损|赔|亏钱|亏本/.test(text)) hits.push('亏损分担');
      if (/僵|谈不拢|吵架|闹翻/.test(text)) hits.push('僵局破解');
      if (/失联|联系不上|找不到/.test(text)) hits.push('失联处理');
      if (/离婚|分手/.test(text)) hits.push('婚变对股权影响');
      if (/去世|身故|死亡/.test(text)) hits.push('身故继承');
      if (/违约|违反/.test(text)) hits.push('违约处理');
      if (hits.length > 0) return { val: hits.join('+'), prompt: hits.join('、') + '专项处理' };
      return null;
    }
  }
};

// ============= 并行扫描 =============

function scan(text) {
  const results = {};
  for (const [key, dim] of Object.entries(DIMENSIONS)) {
    const hit = dim.detect(text);
    if (hit) {
      results[key] = {
        dimension: dim.label,
        value: hit.val,
        prompt: hit.prompt,
        priority: dim.priority
      };
    }
  }
  return results;
}

// ============= 优先级排序 =============

function prioritize(scans) {
  // 按优先级排序：风险 > 资本 > 治理 > 阶段 > 行业 > 人数
  const order = ['risk', 'capital', 'governance', 'stage', 'industry', 'partnerCount'];
  const sorted = [];
  for (const key of order) {
    if (scans[key]) sorted.push({ key, ...scans[key] });
  }
  return sorted;
}

// ============= 生成维度摘要（feed to prompt） =============

function buildDimensionSummary(scans, freeText) {
  const parts = [];
  if (scans.industry) parts.push(`行业=${scans.industry.value}`);
  if (scans.partnerCount) parts.push(`人数=${scans.partnerCount.value}`);
  if (scans.stage) parts.push(`阶段=${scans.stage.value}`);
  if (scans.capital) parts.push(`资本=[${scans.capital.value}]`);
  if (scans.governance) parts.push(`治理=[${scans.governance.value}]`);
  if (scans.risk) parts.push(`风险=[${scans.risk.value}]`);
  return parts.join(' | ') || '未识别';
}

module.exports = {
  DIMENSIONS,
  scan,
  prioritize,
  buildDimensionSummary
};
