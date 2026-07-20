const CITIES = [
  { id: "tokyo",   name: "東京",   lat: 35.6762, lon: 139.6503, slot: 1, default: true },
  { id: "osaka",   name: "大阪",   lat: 34.6937, lon: 135.5023, slot: 2, default: true },
  { id: "sapporo", name: "札幌",   lat: 43.0618, lon: 141.3545, slot: 3, default: true },
  { id: "nagoya",  name: "名古屋", lat: 35.1815, lon: 136.9066, slot: 4, default: false },
  { id: "fukuoka", name: "福岡",   lat: 33.5904, lon: 130.4017, slot: 5, default: false },
  { id: "naha",    name: "那覇",   lat: 26.2124, lon: 127.6809, slot: 6, default: false },
];

const state = {
  days: 30,
  selected: new Set(CITIES.filter(c => c.default).map(c => c.id)),
  cache: new Map(), // key: `${cityId}:${days}` -> { dates, tempMean, precip }
};

let tempChart = null;
let precipChart = null;

const root = document.documentElement;
const els = {
  cityRow: document.getElementById("city-checkboxes"),
  presetRow: document.getElementById("range-presets"),
  statRow: document.getElementById("stat-row"),
  legendTemp: document.getElementById("legend-temp"),
  legendPrecip: document.getElementById("legend-precip"),
  tableToggle: document.getElementById("table-toggle"),
  tableWrap: document.getElementById("table-wrap"),
  status: document.getElementById("status-line"),
  themeToggle: document.getElementById("theme-toggle"),
};

function seriesColor(slot) {
  return getComputedStyle(document.querySelector(".viz-root")).getPropertyValue(`--series-${slot}`).trim();
}

function buildCityChips() {
  els.cityRow.innerHTML = "";
  CITIES.forEach(city => {
    const label = document.createElement("label");
    label.className = "city-chip";
    label.innerHTML = `
      <input type="checkbox" data-city="${city.id}" ${state.selected.has(city.id) ? "checked" : ""} />
      <span class="city-swatch" style="background:${seriesColor(city.slot)}"></span>
      ${city.name}
    `;
    label.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) state.selected.add(city.id);
      else state.selected.delete(city.id);
      refresh();
    });
    els.cityRow.appendChild(label);
  });
}

function buildPresetButtons() {
  els.presetRow.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.days = Number(btn.dataset.days);
      els.presetRow.querySelectorAll(".preset-btn").forEach(b => b.classList.toggle("is-selected", b === btn));
      refresh();
    });
  });
}

async function fetchCityData(city, days) {
  const key = `${city.id}:${days}`;
  if (state.cache.has(key)) return state.cache.get(key);

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", city.lat);
  url.searchParams.set("longitude", city.lon);
  url.searchParams.set("daily", "temperature_2m_mean,precipitation_sum");
  url.searchParams.set("past_days", String(days));
  url.searchParams.set("forecast_days", "0");
  url.searchParams.set("timezone", "Asia/Tokyo");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`${city.name}のデータ取得に失敗しました (${res.status})`);
  const json = await res.json();
  const data = {
    dates: json.daily.time,
    tempMean: json.daily.temperature_2m_mean,
    precip: json.daily.precipitation_sum,
  };
  state.cache.set(key, data);
  return data;
}

function formatDateLabel(iso) {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function buildLegend(container, cities) {
  container.innerHTML = "";
  cities.forEach(city => {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:${seriesColor(city.slot)}"></span>${city.name}`;
    container.appendChild(item);
  });
}

function renderCharts(citiesData) {
  const labels = citiesData[0].data.dates.map(formatDateLabel);

  const tempDatasets = citiesData.map(({ city, data }) => ({
    label: city.name,
    data: data.tempMean,
    borderColor: seriesColor(city.slot),
    backgroundColor: seriesColor(city.slot),
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0,
  }));

  const precipDatasets = citiesData.map(({ city, data }) => ({
    label: city.name,
    data: data.precip,
    backgroundColor: seriesColor(city.slot),
    borderRadius: 4,
    maxBarThickness: 18,
  }));

  const gridColor = getComputedStyle(document.querySelector(".viz-root")).getPropertyValue("--gridline").trim();
  const textColor = getComputedStyle(document.querySelector(".viz-root")).getPropertyValue("--text-muted").trim();

  const commonScales = {
    x: {
      grid: { display: false },
      ticks: { color: textColor, maxRotation: 0, autoSkip: true, autoSkipPadding: 16 },
    },
    y: {
      grid: { color: gridColor, drawTicks: false },
      border: { display: false },
      ticks: { color: textColor },
    },
  };

  if (tempChart) tempChart.destroy();
  tempChart = new Chart(document.getElementById("chart-temp"), {
    type: "line",
    data: { labels, datasets: tempDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}°C` },
        },
      },
      interaction: { mode: "index", intersect: false },
      scales: {
        ...commonScales,
        y: { ...commonScales.y, ticks: { ...commonScales.y.ticks, callback: (v) => `${v}°C` } },
      },
    },
  });

  if (precipChart) precipChart.destroy();
  precipChart = new Chart(document.getElementById("chart-precip"), {
    type: "bar",
    data: { labels, datasets: precipDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}mm` },
        },
      },
      interaction: { mode: "index", intersect: false },
      scales: {
        ...commonScales,
        y: { ...commonScales.y, ticks: { ...commonScales.y.ticks, callback: (v) => `${v}mm` } },
      },
    },
  });
}

function renderStatTiles(citiesData) {
  els.statRow.innerHTML = "";
  citiesData.forEach(({ city, data }) => {
    const lastIdx = data.tempMean.length - 1;
    const lastTemp = data.tempMean[lastIdx];
    const totalPrecip = data.precip.reduce((a, b) => a + (b || 0), 0);
    const tile = document.createElement("div");
    tile.className = "stat-tile";
    tile.innerHTML = `
      <div class="stat-label">
        <span class="city-swatch" style="background:${seriesColor(city.slot)}"></span>${city.name}
      </div>
      <div class="stat-value">${lastTemp?.toFixed(1) ?? "-"}°C</div>
      <div class="stat-sub">期間降水量合計 ${totalPrecip.toFixed(0)}mm</div>
    `;
    els.statRow.appendChild(tile);
  });
}

function renderTable(citiesData) {
  const dates = citiesData[0].data.dates;
  let html = "<table><thead><tr><th>日付</th>";
  citiesData.forEach(({ city }) => {
    html += `<th>${city.name} 気温</th><th>${city.name} 降水量</th>`;
  });
  html += "</tr></thead><tbody>";
  dates.forEach((date, i) => {
    html += `<tr><td>${date}</td>`;
    citiesData.forEach(({ data }) => {
      const t = data.tempMean[i];
      const p = data.precip[i];
      html += `<td>${t?.toFixed(1) ?? "-"}°C</td><td>${p?.toFixed(1) ?? "-"}mm</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  els.tableWrap.innerHTML = html;
}

async function refresh() {
  const cities = CITIES.filter(c => state.selected.has(c.id));
  if (cities.length === 0) {
    els.status.textContent = "都市を1つ以上選択してください。";
    return;
  }
  els.status.textContent = "読み込み中…";
  try {
    const citiesData = await Promise.all(
      cities.map(async city => ({ city, data: await fetchCityData(city, state.days) }))
    );
    renderCharts(citiesData);
    renderStatTiles(citiesData);
    buildLegend(els.legendTemp, cities);
    buildLegend(els.legendPrecip, cities);
    renderTable(citiesData);
    els.status.textContent = `最終更新: ${new Date().toLocaleString("ja-JP")}`;
  } catch (err) {
    els.status.textContent = `エラー: ${err.message}`;
  }
}

els.tableToggle.addEventListener("click", () => {
  const isHidden = els.tableWrap.hidden;
  els.tableWrap.hidden = !isHidden;
  els.tableToggle.setAttribute("aria-expanded", String(isHidden));
  els.tableToggle.textContent = isHidden ? "表形式を隠す" : "表形式で見る";
});

els.themeToggle.addEventListener("click", () => {
  const current = root.getAttribute("data-theme");
  if (current === "dark") root.setAttribute("data-theme", "light");
  else if (current === "light") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", "dark");
  buildCityChips();
  refresh();
});

buildCityChips();
buildPresetButtons();
refresh();
