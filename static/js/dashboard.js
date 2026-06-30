const CHART = {
  primary: '#2563EB', primaryLight: '#3B82F6',
  good: '#059669', warn: '#D97706', bad: '#DC2626',
  text: '#5A6B7E', textMuted: '#8B9AAA', border: '#E4E8EC',
  palette: ['#2563EB', '#059669', '#D97706', '#8B5CF6', '#EC4899', '#14B8A6', '#6366F1', '#F43F5E'],
};
const CHART_FONT = "'Noto Sans JP', sans-serif";
const BASE_OPTION = {
  textStyle: { fontFamily: CHART_FONT, color: CHART.text, fontSize: 12 },
  tooltip: {
    backgroundColor: '#FFFFFF', borderColor: CHART.border, borderWidth: 1,
    textStyle: { fontFamily: CHART_FONT, color: '#1A2332', fontSize: 12 },
    extraCssText: 'box-shadow: 0 2px 8px rgba(16,24,40,0.08); border-radius: 8px;',
  },
  grid: { top: 30, right: 20, bottom: 30, left: 50, containLabel: true },
};

let regionData = [];

function bar(id, title, data, horizontal = false) {
  const el = document.getElementById(id); if (!el) return;
  const ch = echarts.init(el);
  ch.setOption({
    ...BASE_OPTION,
    xAxis: horizontal ? { type: 'value', splitLine: { lineStyle: { color: CHART.border } }, axisLabel: { color: CHART.textMuted } }
      : { type: 'category', data: data.map(x => x.name), axisLabel: { color: CHART.text, fontSize: 11, rotate: data.length > 8 ? 30 : 0 }, axisLine: { lineStyle: { color: CHART.border } } },
    yAxis: horizontal ? { type: 'category', data: data.map(x => x.name), axisLabel: { color: CHART.text, fontSize: 11 }, axisLine: { lineStyle: { color: CHART.border } } }
      : { type: 'value', splitLine: { lineStyle: { color: CHART.border } }, axisLabel: { color: CHART.textMuted } },
    series: [{ type: 'bar', data: data.map(x => x.value), itemStyle: { color: CHART.primary, borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] }, barMaxWidth: 40 }],
  });
}

function pie(id, title, data) {
  const el = document.getElementById(id); if (!el) return;
  const ch = echarts.init(el);
  ch.setOption({
    ...BASE_OPTION,
    legend: { bottom: 0, textStyle: { fontFamily: CHART_FONT, color: CHART.text, fontSize: 11 } },
    series: [{ type: 'pie', radius: ['40%', '65%'], center: ['50%', '45%'],
      data: data.map((x, i) => ({ name: x.name, value: x.value, itemStyle: { color: CHART.palette[i % CHART.palette.length] } })),
      label: { fontFamily: CHART_FONT, color: CHART.text, fontSize: 11 },
      itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 } }],
  });
}

function scatterWithBaseline(id, title, data) {
  const el = document.getElementById(id); if (!el) return;
  const ch = echarts.init(el);
  // 按区域分组,计算各区域均价
  const wardAvgs = {};
  data.forEach(d => { if (d.region_avg) wardAvgs[d.ward] = d.region_avg; });
  const markLines = Object.entries(wardAvgs).map(([ward, avg]) => ({
    name: `${ward}平均`, yAxis: avg, lineStyle: { type: 'dashed', color: CHART.warn, opacity: 0.5 },
    label: { formatter: `${ward} ${avg.toLocaleString()}円`, fontSize: 10, color: CHART.warn },
  }));
  ch.setOption({
    ...BASE_OPTION,
    xAxis: { name: '面積(㎡)', type: 'value', nameTextStyle: { color: CHART.textMuted, fontFamily: CHART_FONT }, splitLine: { lineStyle: { color: CHART.border } }, axisLabel: { color: CHART.textMuted } },
    yAxis: { name: '月額(円)', type: 'value', nameTextStyle: { color: CHART.textMuted, fontFamily: CHART_FONT }, splitLine: { lineStyle: { color: CHART.border } }, axisLabel: { color: CHART.textMuted } },
    tooltip: { trigger: 'item', formatter: p => `${p.data[2]}<br/>${p.data[0]}㎡ / ${p.data[1].toLocaleString()}円` },
    series: [{ type: 'scatter', symbolSize: 10,
      data: data.map(x => [x.x, x.y, x.title || '']),
      itemStyle: { color: CHART.primary, opacity: 0.7 },
      markLine: { data: markLines, symbol: 'none', animation: false, silent: true },
    }],
  });
}

function radar(id, title, indicators, seriesData) {
  const el = document.getElementById(id); if (!el) return;
  const ch = echarts.init(el);
  ch.setOption({
    ...BASE_OPTION,
    radar: {
      indicator: indicators,
      shape: 'polygon',
      splitArea: { areaStyle: { color: ['rgba(37,99,235,0.02)', 'rgba(37,99,235,0.04)', 'rgba(37,99,235,0.06)', 'rgba(37,99,235,0.08)'] } },
      axisName: { color: CHART.text, fontFamily: CHART_FONT, fontSize: 12 },
    },
    series: [{ type: 'radar', data: seriesData, symbol: 'circle', symbolSize: 6,
      areaStyle: { opacity: 0.1 },
      lineStyle: { width: 2 },
    }],
  });
}

function renderRegionRadar() {
  const ward = document.getElementById('region-selector').value;
  if (!ward || !regionData.length) return;
  const r = regionData.find(x => x.ward === ward);
  if (!r) return;
  const levelMap = { '高': 3, '中': 2, '低': 1 };
  radar('chart-region-radar', 'エリア評価',
    [
      { name: '安全性', max: 3 }, { name: '便利度', max: 3 }, { name: '環境', max: 3 },
      { name: '平均賃料(万円)', max: 20 }, { name: '平均面積(㎡)', max: 50 }, { name: '築年数(年)', max: 30, inverse: true },
    ],
    [{ value: [
      levelMap[r.safety_level] || 2, levelMap[r.convenience_level] || 2, levelMap[r.environment_level] || 2,
      r.avg_rent ? r.avg_rent / 10000 : 0, r.avg_area || 0, r.avg_building_age || 25,
    ], name: r.ward, itemStyle: { color: CHART.primary } }]
  );
}

async function load() {
  const res = await fetch('/api/dashboard');
  const d = await res.json();

  // 指标卡
  const metrics = [
    { label: 'インポート物件数', value: d.total_listings, cls: '' },
    { label: 'エリア数', value: d.region_count, cls: 'accent' },
    { label: '予算内物件', value: d.budget_match_count, cls: 'good' },
    { label: 'ペット可', value: d.pet_allowed_count, cls: 'accent' },
    { label: '平均月額', value: (d.average_total_cost || 0).toLocaleString() + '円', cls: '' },
    { label: '平均面積', value: (d.average_area || 0) + '㎡', cls: '' },
    { label: '平均スコア', value: d.average_score || 0, cls: 'accent' },
    { label: 'お気に入り', value: d.favorite_count, cls: '' },
  ];
  document.getElementById('metrics').innerHTML = metrics.map(m =>
    `<div class="metric ${m.cls}"><div class="num">${m.value ?? 0}</div><div class="label">${m.label}</div></div>`).join('');

  // 区域平均租金
  bar('chart-tokyo-rent', '東京都23区', d.tokyo_region_rent || [], true);
  bar('chart-yokohama-rent', '横浜市各区', d.yokohama_region_rent || [], true);

  // 区域选择器
  regionData = d.regions || [];
  const selector = document.getElementById('region-selector');
  selector.innerHTML = '<option value="">エリアを選択...</option>' +
    regionData.map(r => `<option value="${r.ward || r.city}">${r.ward || r.city} (${r.prefecture})</option>`).join('');

  // 用户导入物件散点
  if (d.user_scatter && d.user_scatter.length) {
    scatterWithBaseline('chart-user-scatter', 'インポート物件 vs エリア平均', d.user_scatter);
  } else {
    document.getElementById('chart-user-scatter').className = 'chart-empty';
    document.getElementById('chart-user-scatter').innerHTML = '物件をインポートすると表示されます';
  }

  // 用户区域分布
  if (d.user_ward_distribution && d.user_ward_distribution.length) {
    bar('chart-user-ward', 'エリア分布', d.user_ward_distribution);
  } else {
    document.getElementById('chart-user-ward').className = 'chart-empty';
    document.getElementById('chart-user-ward').innerHTML = '物件をインポートすると表示されます';
  }

  // 平台
  if (d.platform_distribution && d.platform_distribution.length) {
    pie('chart-platform', 'プラットフォーム', d.platform_distribution);
  } else {
    document.getElementById('chart-platform').className = 'chart-empty';
    document.getElementById('chart-platform').innerHTML = '物件をインポートすると表示されます';
  }
}

load();