/* ===== CHART HELPERS (Chart.js) ===== */
const PALETTE = ['#2563EB','#E66C37','#16A34A','#DC2626','#7C3AED','#D97706','#0891B2','#BE185D','#65A30D','#9333EA'];

// Plugin: desenha o valor de cada barra
const barValueLabels = {
  id: 'barValueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const horizontal = chart.options.indexAxis === 'y';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      meta.data.forEach((el, i) => {
        const val = ds.data[i];
        if (val == null || val === 0) return;
        ctx.save();
        ctx.font = '600 11px sans-serif';
        ctx.fillStyle = '#374151';
        if (horizontal) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(val, el.x + 6, el.y);
        } else {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(val, el.x, el.y - 4);
        }
        ctx.restore();
      });
    });
  }
};

const ChartManager = (() => {
  const instances = {};

  // Normaliza todos os rótulos de categoria para MAIÚSCULO
  const UP = arr => (arr || []).map(l => (l == null ? l : String(l).toUpperCase()));

  function destroy(id) {
    if (instances[id]) { instances[id].destroy(); delete instances[id]; }
  }

  function bar(canvasId, labels, datasets, opts = {}) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const horizontal = !!opts.horizontal;
    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: UP(labels),
        datasets: datasets.map((d, i) => ({
          label: d.label || '',
          data: d.data,
          backgroundColor: d.color || PALETTE[i % PALETTE.length],
          borderRadius: 4,
          barPercentage: .7,
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: horizontal ? 'y' : 'x',
        layout: opts.dataLabels
          ? { padding: horizontal ? { right: 30 } : { top: 18 } }
          : {},
        plugins: { legend: { display: datasets.length > 1 } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, ticks: { font: { size: 11 }, precision: 0 } }
        },
        ...opts.chartOpts
      },
      plugins: opts.dataLabels ? [barValueLabels] : []
    });
  }

  function donut(canvasId, labels, data, opts = {}) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    instances[canvasId] = new Chart(ctx, {
      type: opts.pie ? 'pie' : 'doughnut',
      data: {
        labels: UP(labels),
        datasets: [{ data, backgroundColor: PALETTE.slice(0, data.length), borderWidth: 1 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 11 }, boxWidth: 12, padding: 8 }
          }
        }
      }
    });
  }

  function line(canvasId, labels, datasets, opts = {}) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: UP(labels),
        datasets: datasets.map((d, i) => ({
          label: d.label,
          data: d.data,
          borderColor: PALETTE[i],
          backgroundColor: PALETTE[i] + '22',
          tension: .3, fill: true,
          pointRadius: 4,
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: opts.dataLabels ? { padding: { top: 20 } } : {},
        plugins: { legend: { display: datasets.length > 1, position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      },
      plugins: opts.dataLabels ? [barValueLabels] : []
    });
  }

  return { bar, donut, line, destroy };
})();

// ---- Count items by field ----
function countBy(arr, field) {
  const map = {};
  arr.forEach(r => {
    const k = r[field] || 'Outros';
    map[k] = (map[k] || 0) + 1;
  });
  return map;
}
function mapToLabelData(map) {
  return { labels: Object.keys(map), data: Object.values(map) };
}
