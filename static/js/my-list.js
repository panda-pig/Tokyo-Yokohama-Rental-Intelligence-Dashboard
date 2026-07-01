// ===== 物件分析页：URL解析 + 单套报告 + 房源池(累积/点选/多选对比/收藏) =====

const CHART_FONT = "'Noto Sans JP', sans-serif";
const COLORS = { primary: '#2563EB', good: '#059669', warn: '#D97706', bad: '#DC2626', text: '#5A6B7E', muted: '#8B9AAA', border: '#E4E8EC',
  palette: ['#2563EB', '#059669', '#D97706', '#8B5CF6', '#EC4899', '#14B8A6', '#6366F1', '#F43F5E'] };
const BASE_OPT = {
  textStyle: { fontFamily: CHART_FONT, color: COLORS.text, fontSize: 12 },
  tooltip: { backgroundColor: '#FFFFFF', borderColor: COLORS.border, borderWidth: 1,
    textStyle: { fontFamily: CHART_FONT, color: '#1A2332', fontSize: 12 },
    extraCssText: 'box-shadow: 0 2px 8px rgba(16,24,40,0.08); border-radius: 8px;' },
};

const state = { data: null, selectedId: null, sort: 'score_desc' };
const regionCache = {};

// ---------- URL导入 ----------
async function importAndAnalyze() {
  const url = document.getElementById('import-url').value.trim();
  const el = document.getElementById('import-result');
  if (!url) { el.innerHTML = '<span style="color:var(--bad);">URLを入力してください</span>'; return; }
  el.innerHTML = '<span style="color:var(--text-muted);">解析中... (数秒かかります)</span>';
  try {
    const res = await fetch('/api/import/detail', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const errText = await res.text();
      try {
        const errJson = JSON.parse(errText);
        el.innerHTML = '<span style="color:var(--bad);">' + (errJson.error || '解析エラー') + '</span>';
      } catch (e2) {
        el.innerHTML = '<span style="color:var(--bad);">解析に失敗しました(HTTP ' + res.status + ')</span>';
      }
      return;
    }
    const d = await res.json();
    if (d.error) {
      el.innerHTML = '<span style="color:var(--bad);">' + d.error + '</span>';
    } else {
      el.innerHTML = '<span style="color:var(--good);font-weight:600;">' + (d.message || '解析しました') + '</span>';
      document.getElementById('import-url').value = '';
      if (d.id) state.selectedId = d.id;   // 新解析的这套优先显示
      await loadAnalysis();
    }
  } catch (e) {
    el.innerHTML = '<span style="color:var(--bad);">通信エラー: ' + e.message + '</span>';
  }
}

// ---------- 数据加载 ----------
async function loadAnalysis() {
  const res = await fetch('/api/my-list');
  state.data = await res.json();
  const pool = state.data.compare_rows || [];
  if (!pool.some(l => l.id === state.selectedId)) {
    state.selectedId = pool.length ? pool[0].id : null;
  }
  await render();
}

async function getRegion(ward) {
  if (!ward) return null;
  if (ward in regionCache) return regionCache[ward];
  try {
    const r = await fetch('/api/regions/' + encodeURIComponent(ward));
    regionCache[ward] = r.ok ? await r.json() : null;
  } catch (e) { regionCache[ward] = null; }
  return regionCache[ward];
}

function deviationOf(l) {
  if (l.total_monthly_cost && l.region_avg_rent)
    return (l.total_monthly_cost - l.region_avg_rent) / l.region_avg_rent;
  return null;
}

function sortPool(rows) {
  const dev = l => { const d = deviationOf(l); return d == null ? Infinity : d; };
  const cmp = {
    score_desc: (a, b) => (b.total_score || 0) - (a.total_score || 0),
    price_asc: (a, b) => (a.total_monthly_cost || 1e12) - (b.total_monthly_cost || 1e12),
    area_desc: (a, b) => (b.area_m2 || 0) - (a.area_m2 || 0),
    ppm_asc: (a, b) => (a.price_per_m2 || 1e12) - (b.price_per_m2 || 1e12),
    dev_asc: (a, b) => dev(a) - dev(b),
  }[state.sort] || (() => 0);
  return [...rows].sort(cmp);
}

// ---------- 主渲染 ----------
async function render() {
  const container = document.getElementById('analysis-container');
  const d = state.data;
  if (!d || !d.total) { await renderEmpty(container); return; }

  const pool = d.compare_rows || [];
  const selected = pool.find(l => l.id === state.selectedId) || pool[0];
  state.selectedId = selected ? selected.id : null;
  const region = selected ? await getRegion(selected.ward) : null;

  container.innerHTML = reportHtml(selected, region) +
    (pool.length ? poolHtml(sortPool(pool), d) : '');

  drawReportCharts(selected, region);
  if (pool.length >= 2) drawScatter(d.scatter_data);
  wirePoolHandlers();
}

// ---------- 空状态：区域基准看板 ----------
async function renderEmpty(container) {
  let d = null;
  try { d = await (await fetch('/api/dashboard')).json(); } catch (e) {}
  if (!d) { container.innerHTML = '<div class="empty-state">物件をインポートすると分析が表示されます。</div>'; return; }

  const regionRows = (d.regions || []).slice(0, 30).map(r => `
    <tr>
      <td style="font-weight:600;color:var(--text-primary);">${r.ward || r.city || '-'}</td>
      <td>${(r.avg_rent || 0).toLocaleString()}円</td>
      <td>${r.avg_area || '-'}㎡</td>
      <td>${r.safety_level || '-'}</td>
      <td>${r.convenience_level || '-'}</td>
      <td>${r.environment_level || '-'}</td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="card" style="margin-top:20px;background:var(--accent-bg,#EFF4FF);border:1px solid var(--accent-border,#C7D7FE);">
      <p style="font-size:13px;color:var(--text-secondary);margin:0;">
        まだ物件がありません。気になる物件の詳細ページURLを上に貼り付けて解析すると、
        エリア平均との比較レポートが表示され、この物件があなたの<strong>物件プール</strong>に追加されます。<br>
        下は参考用の<strong>エリア基準データ</strong>です。
      </p>
    </div>
    <div class="card"><h2>東京23区 平均相場</h2><div id="chart-tokyo" class="chart"></div></div>
    <div class="card"><h2>横浜市 各区 平均相場</h2><div id="chart-yokohama" class="chart"></div></div>
    <div class="card" style="padding:0;overflow:hidden;">
      <h2 style="padding:24px 24px 0;">エリア基準データ (${(d.regions || []).length}件)</h2>
      <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>エリア</th><th>平均相場</th><th>平均面積</th><th>治安</th><th>利便性</th><th>環境</th></tr></thead>
          <tbody>${regionRows}</tbody>
        </table>
      </div>
    </div>`;

  drawRegionBar('chart-tokyo', d.tokyo_region_rent);
  drawRegionBar('chart-yokohama', d.yokohama_region_rent);
}

function drawRegionBar(elId, rows) {
  const el = document.getElementById(elId);
  if (!el || !rows || !rows.length) { if (el) el.innerHTML = '<div class="empty-state">データなし</div>'; return; }
  echarts.init(el).setOption({
    ...BASE_OPT,
    grid: { left: 90, right: 30, top: 10, bottom: 30 },
    xAxis: { type: 'value', axisLabel: { color: COLORS.muted, formatter: v => (v / 10000) + '万' } },
    yAxis: { type: 'category', data: rows.map(r => r.name), inverse: true, axisLabel: { color: COLORS.text, fontSize: 11 } },
    series: [{
      type: 'bar', data: rows.map(r => r.value), itemStyle: { color: COLORS.primary, borderRadius: [0, 4, 4, 0] },
      barMaxWidth: 16, label: { show: true, position: 'right', formatter: p => (p.value / 10000).toFixed(1) + '万', fontSize: 11, color: COLORS.text },
    }],
  });
}

// ---------- 单套报告 ----------
function reportHtml(l, region) {
  if (!l) return '';
  const yen = v => (v || 0).toLocaleString() + '円';
  const dev = deviationOf(l);
  let devText = '-';
  if (dev != null) {
    const diff = l.total_monthly_cost - l.region_avg_rent;
    const color = diff > 0 ? COLORS.bad : COLORS.good;
    devText = `<span style="color:${color};font-weight:600;">${diff > 0 ? '+' : ''}${diff.toLocaleString()}円 (${Math.round(dev * 100)}%)</span>`;
  }

  const rows = [
    ['物件名', l.title || '-', '-'],
    ['プラットフォーム', `<span class="badge platform">${l.platform || '-'}</span>`, '-'],
    ['スコア', `<span class="badge score">${l.total_score ?? '-'}</span>`, '-'],
    ['月額', yen(l.total_monthly_cost), l.region_avg_rent ? yen(l.region_avg_rent) : '-'],
    ['家賃', yen(l.rent), '-'],
    ['管理費', yen(l.management_fee), '-'],
    ['面積', `${l.area_m2 || '?'}㎡`, l.region_avg_area ? `${l.region_avg_area}㎡` : '-'],
    ['間取り', l.layout || '-', '-'],
    ['階数', `${l.floor || '?'}階`, '-'],
    ['築年数', `築${l.building_age ?? '?'}年`, l.region_avg_age ? `築${l.region_avg_age}年` : '-'],
    ['徒歩', `${l.walk_minutes ?? '?'}分`, '-'],
    ['敷金', yen(l.deposit), '-'],
    ['礼金', yen(l.key_money), '-'],
    ['初期費用', yen(l.initial_cost_estimate), '-'],
    ['㎡単価', l.price_per_m2 ? Math.round(l.price_per_m2).toLocaleString() + '円' : '-', '-'],
    ['ペット', l.pet_allowed ? '<span class="tag good">可</span>' : '不可', '-'],
    ['エリア平均との偏差', devText, '-'],
  ];
  if (region) {
    rows.push(['エリア治安 <span class="tag muted">参考</span>', region.safety_level || '-', '-']);
    rows.push(['エリア利便性 <span class="tag muted">参考</span>', region.convenience_level || '-', '-']);
    rows.push(['エリア環境 <span class="tag muted">参考</span>', region.environment_level || '-', '-']);
  }

  const isFav = !!l.fav_status;
  const favBtn = `<button class="btn ${isFav ? 'btn-good' : 'btn-outline'}" id="report-fav" data-id="${l.id}" data-favid="${l.fav_status_id || ''}">
      ${isFav ? '★ ' + l.fav_status : '☆ 気になる'}</button>`;

  let html = `
    <div class="card" style="margin-top:20px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div>
          <h2 style="margin-bottom:4px;">物件詳細レポート</h2>
          <p style="font-size:13px;color:var(--text-secondary);margin:0;">
            ${l.ward || '地域不明'} の物件解析結果。${l.region_avg_rent ? `エリア平均(${l.ward})と比較しています。` : 'このエリアの基準データがありません。'}
          </p>
        </div>
        <div style="display:flex;gap:8px;">
          ${favBtn}
          ${l.detail_url ? `<a class="btn btn-outline" href="${l.detail_url}" target="_blank" rel="noopener">原平台で見る</a>` : ''}
        </div>
      </div>
      <table style="width:100%;margin-top:16px;">
        <thead><tr><th>項目</th><th>この物件</th><th>エリア平均</th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr><td style="font-weight:600;color:var(--text-primary);">${r[0]}</td><td>${r[1]}</td><td style="color:var(--text-muted);">${r[2]}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  if (l.total_score != null) {
    html += `<div class="card"><h2>スコアレーダー <span style="font-size:12px;font-weight:400;color:var(--text-muted);">8次元評価</span></h2><div id="chart-radar-single" class="chart"></div></div>`;
    if (l.region_avg_rent && l.total_monthly_cost)
      html += `<div class="card"><h2>エリア平均との比較</h2><div id="chart-compare-bar" class="chart"></div></div>`;
    html += `<div class="card"><h2>推薦理由</h2>
      <div style="background:var(--good-bg);border:1px solid var(--good-border);border-radius:var(--radius-sm);padding:12px 16px;font-size:13px;color:var(--good);">
        ${l.score_reason || 'スコア理由がありません'}
      </div></div>`;
  }
  return html;
}

function drawReportCharts(l, region) {
  if (!l || l.total_score == null) return;
  const rEl = document.getElementById('chart-radar-single');
  if (rEl) {
    echarts.init(rEl).setOption({
      ...BASE_OPT,
      radar: {
        indicator: [
          { name: '予算', max: 20 }, { name: '面積', max: 15 }, { name: '通勤', max: 15 },
          { name: '階数', max: 10 }, { name: 'ペット', max: 15 }, { name: '駅距離', max: 10 },
          { name: '築年数', max: 10 }, { name: '初期費用', max: 5 },
        ],
        shape: 'polygon', radius: '65%',
        axisName: { color: COLORS.text, fontFamily: CHART_FONT, fontSize: 11 },
      },
      series: [{
        type: 'radar',
        data: [{
          value: [l.budget_score || 0, l.area_score || 0, l.commute_score || 0, l.floor_score || 0,
                  l.pet_score || 0, l.station_score || 0, l.age_score || 0, l.initial_cost_score || 0],
          name: l.title,
          itemStyle: { color: COLORS.primary }, areaStyle: { opacity: 0.15 },
        }],
      }],
    });
  }
  const bEl = document.getElementById('chart-compare-bar');
  if (bEl && l.region_avg_rent && l.total_monthly_cost) {
    echarts.init(bEl).setOption({
      ...BASE_OPT,
      xAxis: { type: 'category', data: ['この物件', 'エリア平均'] },
      yAxis: { type: 'value', name: '月額(円)', axisLabel: { color: COLORS.muted } },
      series: [{
        type: 'bar', barMaxWidth: 80,
        data: [
          { value: l.total_monthly_cost, itemStyle: { color: COLORS.primary } },
          { value: l.region_avg_rent, itemStyle: { color: COLORS.warn } },
        ],
        label: { show: true, formatter: p => p.value.toLocaleString() + '円', fontFamily: CHART_FONT, fontSize: 12 },
      }],
    });
  }
}

// ---------- 房源池列表 ----------
function poolHtml(pool, d) {
  const sortOptions = [
    ['score_desc', 'スコア高い順'], ['price_asc', '月額安い順'], ['area_desc', '面積広い順'],
    ['ppm_asc', '㎡単価安い順'], ['dev_asc', 'エリア偏差(お得)順'],
  ].map(([v, t]) => `<option value="${v}" ${state.sort === v ? 'selected' : ''}>${t}</option>`).join('');

  const rows = pool.map(l => {
    const dev = deviationOf(l);
    const devHtml = dev == null ? '-' :
      `<span style="color:${dev > 0 ? 'var(--bad)' : 'var(--good)'};font-weight:600;">${dev > 0 ? '+' : ''}${Math.round(dev * 100)}%</span>`;
    const sel = l.id === state.selectedId ? ' style="background:var(--accent-bg,#EFF4FF);"' : '';
    const favMark = l.fav_status ? `<span class="tag good" title="${l.fav_status}">★</span>` : '';
    return `<tr data-id="${l.id}" class="pool-row"${sel}>
      <td><input type="checkbox" class="pool-check" data-id="${l.id}"></td>
      <td><span class="badge score">${l.total_score ?? '-'}</span></td>
      <td style="font-weight:600;color:var(--text-primary);">${l.title || ''} ${favMark}</td>
      <td>${l.ward || '-'}</td>
      <td>${(l.total_monthly_cost || 0).toLocaleString()}円</td>
      <td>${l.area_m2 || '?'}㎡</td>
      <td>${devHtml}</td>
      <td><button class="link-btn pool-fav" data-id="${l.id}" data-favid="${l.fav_status_id || ''}">${l.fav_status ? '解除' : '気になる'}</button></td>
      <td>${l.detail_url ? `<a href="${l.detail_url}" target="_blank" rel="noopener" style="color:var(--accent);">→</a>` : ''}</td>
    </tr>`;
  }).join('');

  return `
    <div class="card" style="padding:0;overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:24px 24px 12px;flex-wrap:wrap;gap:12px;">
        <h2 style="margin:0;">物件プール (${pool.length}件)</h2>
        <div style="display:flex;gap:8px;align-items:center;">
          <select id="pool-sort" class="select">${sortOptions}</select>
          <button class="btn btn-primary" id="pool-compare" disabled>選択して比較 (0)</button>
        </div>
      </div>
      <p style="font-size:12px;color:var(--text-muted);padding:0 24px 8px;margin:0;">行をクリックで上のレポートを切替 / チェックで2〜4件を横断比較</p>
      <div style="overflow-x:auto;">
        <table id="pool-table">
          <thead><tr><th></th><th>スコア</th><th>物件名</th><th>エリア</th><th>月額</th><th>面積</th><th>偏差</th><th>お気に入り</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    ${pool.length >= 2 ? '<div class="card"><h2>コスパ散布図 <span style="font-size:12px;font-weight:400;color:var(--text-muted);">面積 vs 月額</span></h2><div id="chart-scatter" class="chart"></div></div>' : ''}`;
}

function drawScatter(scatter) {
  const el = document.getElementById('chart-scatter');
  if (!el || !scatter || !scatter.length) return;
  const pts = scatter.filter(p => p.x && p.y);
  const avgLine = [];
  const withAvg = pts.filter(p => p.region_avg);
  if (withAvg.length) {
    const avg = withAvg.reduce((s, p) => s + p.region_avg, 0) / withAvg.length;
    avgLine.push({ yAxis: avg, label: { formatter: 'エリア平均 ' + Math.round(avg / 10000) + '万', color: COLORS.warn } });
  }
  echarts.init(el).setOption({
    ...BASE_OPT,
    tooltip: { ...BASE_OPT.tooltip, formatter: p => `${p.data.name}<br>${p.data.ward || ''}<br>面積 ${p.data.value[0]}㎡ / 月額 ${p.data.value[1].toLocaleString()}円` },
    grid: { left: 60, right: 30, top: 20, bottom: 40 },
    xAxis: { type: 'value', name: '面積(㎡)', axisLabel: { color: COLORS.muted } },
    yAxis: { type: 'value', name: '月額(円)', axisLabel: { color: COLORS.muted, formatter: v => (v / 10000) + '万' } },
    series: [{
      type: 'scatter', symbolSize: 14,
      itemStyle: { color: COLORS.primary, opacity: 0.75 },
      data: pts.map(p => ({ value: [p.x, p.y], name: p.name, ward: p.ward })),
      markLine: avgLine.length ? { silent: true, symbol: 'none', lineStyle: { color: COLORS.warn, type: 'dashed' }, data: avgLine } : undefined,
    }],
  });
}

// ---------- 交互 ----------
function updateCompareBtn() {
  const checked = document.querySelectorAll('.pool-check:checked');
  const btn = document.getElementById('pool-compare');
  if (!btn) return;
  btn.textContent = `選択して比較 (${checked.length})`;
  btn.disabled = checked.length < 2 || checked.length > 4;
}

async function toggleFav(id, favId) {
  if (favId) {
    await fetch('/api/status/' + favId, { method: 'DELETE' });
  } else {
    await fetch('/api/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: id, status: '気になる', priority: 1 }),
    });
  }
  await loadAnalysis();
}

function wirePoolHandlers() {
  // 行点击切换报告(排除 checkbox / 按钮 / 链接)
  document.querySelectorAll('.pool-row').forEach(tr => {
    tr.addEventListener('click', e => {
      if (e.target.closest('input,button,a')) return;
      state.selectedId = parseInt(tr.dataset.id, 10);
      render();
    });
  });
  document.querySelectorAll('.pool-check').forEach(cb => cb.addEventListener('change', updateCompareBtn));
  document.querySelectorAll('.pool-fav').forEach(b =>
    b.addEventListener('click', e => { e.stopPropagation(); toggleFav(parseInt(b.dataset.id, 10), b.dataset.favid || null); }));
  const reportFav = document.getElementById('report-fav');
  if (reportFav) reportFav.addEventListener('click', () => toggleFav(parseInt(reportFav.dataset.id, 10), reportFav.dataset.favid || null));

  const cmp = document.getElementById('pool-compare');
  if (cmp) cmp.addEventListener('click', () => {
    const ids = [...document.querySelectorAll('.pool-check:checked')].map(c => parseInt(c.dataset.id, 10));
    if (ids.length < 2) return;
    localStorage.setItem('compareIds', JSON.stringify(ids));
    location.href = '/compare';
  });
  const sortSel = document.getElementById('pool-sort');
  if (sortSel) sortSel.addEventListener('change', () => { state.sort = sortSel.value; render(); });
}

// ---------- 初始化 ----------
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('import-url');
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') importAndAnalyze(); });
  loadAnalysis();
});
