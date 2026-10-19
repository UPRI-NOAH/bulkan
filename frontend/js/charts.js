import { state } from './state.js';
import { THRESHOLDS } from './config.js';

const DAYS_BY_RANGE = { daily: 7, weekly: 28, monthly: 90, yearly: 365 };

function daysToShow() {
  return DAYS_BY_RANGE[state.currentTimeRange] ?? 7;
}

export function getDataForTimeRange() {
  const data = state.dashboardData[state.currentVolcano] || [];
  const d = daysToShow();
  const offset = state.currentPeriodIndex * d;
  const end = data.length - offset;
  const start = Math.max(0, end - d);
  return data.slice(start, end);
}

export function updateNavigationButtons() {
  const data = state.dashboardData[state.currentVolcano] || [];
  const maxPeriods = Math.ceil(data.length / daysToShow());
  const btns = document.querySelectorAll('.nav-btn');
  if (btns.length >= 2) {
    btns[0].disabled = state.currentPeriodIndex >= maxPeriods - 1;
    btns[1].disabled = state.currentPeriodIndex <= 0;
  }
}

export function selectTimeRange(event, range) {
  state.currentTimeRange = range;
  state.currentPeriodIndex = 0;
  document.querySelectorAll('.time-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  updateTrendChart();
  updateNavigationButtons();
}

export function selectParameter(event, param) {
  state.currentParameter = param;
  document.querySelectorAll('.param-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  updateTrendChart();
}

export function navigatePeriod(direction) {
  const data = state.dashboardData[state.currentVolcano] || [];
  const maxPeriods = Math.ceil(data.length / daysToShow());
  if (direction === 'prev' && state.currentPeriodIndex < maxPeriods - 1) state.currentPeriodIndex++;
  else if (direction === 'next' && state.currentPeriodIndex > 0) state.currentPeriodIndex--;
  updateTrendChart();
  updateNavigationButtons();
}

function updateStats(data) {
  const avg = arr => {
    const nums = arr.map(v => parseFloat(v) || 0).filter(v => v > 0);
    return nums.length > 0 ? (nums.reduce((a, b) => a + b) / nums.length).toFixed(2) : '--';
  };
  document.getElementById('avg-veq').textContent = avg(data.map(d => d.VEQ));
  document.getElementById('avg-rockfall').textContent = avg(data.map(d => d.Rockfall));
  document.getElementById('avg-pdc').textContent = avg(data.map(d => d.PDCEvents));
  document.getElementById('avg-so2').textContent = avg(data.map(d => d.SO2Flux));
  document.getElementById('avg-plume').textContent = avg(data.map(d => d.PlumeHeight));
}

export function updateTrendChart() {
  const data = getDataForTimeRange();
  const ctx = document.getElementById('trendChart');
  if (state.trendChart) state.trendChart.destroy();
  if (data.length === 0) return;

  const dates = data.map(d => (d.DATE || '').toString().substring(0, 10));
  const datasets = [];
  const param = state.currentParameter;

  let eventsMax = 0, so2Max = 0, plumeMax = 0;

  const pushSeries = (key, label, color, group) => {
    const vals = data.map(d => parseFloat(d[key]) || 0);
    const localMax = Math.max(...vals);
    if (group === 'events') eventsMax = Math.max(eventsMax, localMax);
    else if (group === 'so2') so2Max = localMax;
    else if (group === 'plume') plumeMax = localMax;
    datasets.push({
      label,
      data: vals,
      borderColor: color,
      backgroundColor: color + '1a',
      tension: 0.4,
      fill: true,
      yAxisID: (group === 'so2' || group === 'plume') && param === 'all' ? 'y1' : 'y',
    });
  };

  if (param === 'all' || param === 'veq') pushSeries('VEQ', 'VEQ (events/day)', '#ff4444', 'events');
  if (param === 'all' || param === 'rockfall') pushSeries('Rockfall', 'Rockfall (events/day)', '#ffc62a', 'events');
  if (param === 'all' || param === 'pdc') pushSeries('PDCEvents', 'PDC (events/day)', '#44cc66', 'events');
  if (param === 'all' || param === 'so2') pushSeries('SO2Flux', 'SO₂ (tons/day)', '#4488ff', 'so2');
  if (param === 'all' || param === 'plume') pushSeries('PlumeHeight', 'Plume (m)', '#ff00ff', 'plume');

  eventsMax = eventsMax > 0 ? eventsMax * 1.1 : undefined;
  so2Max = so2Max > 0 ? so2Max * 1.1 : undefined;
  plumeMax = plumeMax > 0 ? plumeMax * 1.1 : undefined;

  let leftLabel = 'events/day', leftMax = eventsMax, rightLabel = '', rightMax;
  if (param === 'so2') { leftLabel = 'tons/day'; leftMax = so2Max; }
  else if (param === 'plume') { leftLabel = 'meters'; leftMax = plumeMax; }
  else if (param === 'all') { rightLabel = 'tons/day, meters'; rightMax = Math.max(so2Max || 0, plumeMax || 0); }

  state.trendChart = new Chart(ctx, {
    type: 'line',
    data: { labels: dates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: '#8892a8', font: { family: 'JetBrains Mono', size: 10 } } },
      },
      scales: {
        y: {
          type: 'linear', display: true, position: 'left',
          ticks: { color: '#8892a8', stepSize: 1, callback: v => Math.round(v) },
          grid: { color: '#2a3040' }, beginAtZero: true, max: leftMax,
          title: { display: true, text: leftLabel, color: '#8892a8', font: { size: 10 } },
        },
        y1: {
          type: 'linear', display: param === 'all', position: 'right',
          ticks: { color: '#8892a8', stepSize: 1, callback: v => Math.round(v) },
          grid: { drawOnChartArea: false }, beginAtZero: true, max: rightMax,
          title: { display: param === 'all', text: rightLabel, color: '#8892a8', font: { size: 10 } },
        },
        x: {
          ticks: { color: '#8892a8', maxRotation: 45, minRotation: 0, autoSkip: true, maxTicksLimit: 10 },
          grid: { color: '#2a3040' },
          title: { display: false },
        },
      },
    },
  });

  updateStats(data);
}

export function updateRadarChart() {
  const data = state.dashboardData[state.currentVolcano] || [];
  if (data.length === 0) return;
  const latest = data[data.length - 1];

  const pct = (value, t) => {
    value = parseFloat(value) || 0;
    if (value <= t.normal) return (value / t.normal) * 25;
    if (value <= t.elevated) return 25 + ((value - t.normal) / (t.elevated - t.normal)) * 25;
    if (value <= t.high) return 50 + ((value - t.elevated) / (t.high - t.elevated)) * 25;
    return 75 + Math.min(((value - t.high) / (t.critical - t.high)) * 25, 25);
  };

  const radarData = {
    VEQ: pct(latest.VEQ, THRESHOLDS.VEQ),
    Rockfall: pct(latest.Rockfall, THRESHOLDS.Rockfall),
    PDC: pct(latest.PDCEvents, THRESHOLDS.PDCEvents),
    SO2: pct(latest.SO2Flux, THRESHOLDS.SO2Flux),
    Plume: pct(latest.PlumeHeight, THRESHOLDS.PlumeHeight),
  };

  const ctx = document.getElementById('radarChart');
  if (!ctx) return;
  if (state.radarChart) state.radarChart.destroy();

  state.radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['VEQ', 'Rockfall', 'PDC Events', 'SO₂ Flux', 'Plume Height'],
      datasets: [{
        label: 'Current Levels',
        data: Object.values(radarData),
        backgroundColor: 'rgba(255,107,53,0.2)',
        borderColor: '#ff6b35',
        borderWidth: 2,
        pointBackgroundColor: '#ff6b35',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#ff6b35',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { stepSize: 25, color: '#5a6478', font: { family: 'JetBrains Mono', size: 9 }, backdropColor: 'transparent' },
          grid: { color: '#2a3040' },
          pointLabels: { color: '#8892a8', font: { family: 'JetBrains Mono', size: 10, weight: 600 } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)', titleColor: '#fff', bodyColor: '#fff',
          borderColor: '#ff6b35', borderWidth: 1, padding: 8,
          titleFont: { size: 11, weight: 600 }, bodyFont: { size: 10 },
        },
      },
    },
  });
}
