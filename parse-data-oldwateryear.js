// --------------------------------------------------------------------------
// -------------------------  DATA EXTRACTION -------------------------------
// Robust parsing of month/year from a label to find the right row in the CSV
// --------------------------------------------------------------------------
const SINGLE_VALUE_STORE = new Map(); // key -> number (already in TAF)

const MONTH_ABBR = {
  january: "jan", february: "feb", march: "mar", april: "apr", may: "may", june: "jun",
  july: "jul", august: "aug", september: "sep", october: "oct", november: "nov", december: "dec",
  jan: "jan", feb: "feb", mar: "mar", apr: "apr", jun: "jun", jul: "jul", aug: "aug",
  sep: "sep", sept: "sep", oct: "oct", nov: "nov", dec: "dec"
};

const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

function normalizeMonth(m) {
  if (!m) return null;
  const key = String(m).trim().toLowerCase();
  return MONTH_ABBR[key] || null;
}

function parseMonthYear(label) {
  if (!label) return null;
  const s = String(label).trim().toLowerCase();

  // 1) Match formats like: "Apr 2026", "April 2026", "Apr-26", "26-Apr", "2026 Apr"
  // capture groups: month text + year 2/4 digits
  const monthWords = "(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)";
  let m = s.match(new RegExp(`\\b${monthWords}\\b[^0-9]*?(\\d{2,4})\\b`, "i"));
  if (!m) m = s.match(new RegExp(`\\b(\\d{2,4})\\b[^a-z]*?\\b${monthWords}\\b`, "i"));

  if (m) {
    const monthAbbr = normalizeMonth(m[1]);          // if month first
    const yearRaw = m[2];                            // year captured
    const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
    const monthIndex = MONTH_INDEX[monthAbbr];       // you already have MONTH_INDEX
    if (monthIndex != null && Number.isFinite(year)) return { monthIndex, year };
  }

  // 2) Match numeric formats: "2026-04", "04/2026", "2026/4"
  let n = s.match(/\b(\d{4})[-/.\s_](\d{1,2})\b/);   // yyyy-mm
  if (n) {
    const year = Number(n[1]);
    const mm = Number(n[2]);
    if (mm >= 1 && mm <= 12) return { monthIndex: mm - 1, year };
  }

  n = s.match(/\b(\d{1,2})[-/.\s_](\d{4})\b/);       // mm-yyyy
  if (n) {
    const mm = Number(n[1]);
    const year = Number(n[2]);
    if (mm >= 1 && mm <= 12) return { monthIndex: mm - 1, year };
  }

  return null;
}


function labelMatchesMonthYear(label, monthAbbr, year4) {
  const parsed = parseMonthYear(label);
  if (!parsed) return false;
  return parsed.year === year4 && parsed.monthIndex === MONTH_INDEX[monthAbbr];
}


function isValidMonthYear(parsed) {
  return parsed && Number.isFinite(parsed.year) && Number.isFinite(parsed.monthIndex);
}

// Given a water year (e.g., 2025), return the latest row index within that WY.
// WY runs Oct (monthIndex 9) ... Sep (8)
function findLatestIndexInWaterYear(labels, targetWY) {
  let bestIdx = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < labels.length; i++) {
    const p = parseMonthYear(labels[i]);
    if (!isValidMonthYear(p)) continue;

    // compute label's WY (Oct-Dec => same year, Jan-Sep => year-1)
    const wy = (p.monthIndex >= 9) ? p.year : (p.year - 1);
    if (wy !== targetWY) continue;

    // score increases with later months in the WY
    // map Oct..Dec to 0..2, Jan..Sep to 3..11 so ordering is consistent
    const wyMonthOrder = (p.monthIndex >= 9) ? (p.monthIndex - 9) : (p.monthIndex + 3);

    // primary: latest month; secondary: later row wins (in case duplicates)
    const score = wyMonthOrder * 10000 + i;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}





// --------------------------------------------------------------------------
// ------------------------- SINGLE VALUE LOGIC -----------------------------
// --------------------------------------------------------------------------
// For rendering a single value from a CSV
// Reads <div class="single-value" data-csv data-col data-month ...> and prints one value
// --------------------------------------------------------------------------


// Decide whether to divide by 1000 for TAF display.
// If your CSV column/header indicates "Thousand", assume it's already TAF.
function toTAF(rawValue, colName, units) {
  const v = Number(String(rawValue).replace(/,/g, ""));
  if (!Number.isFinite(v)) return null;

  const u = String(units || "").trim().toUpperCase();
  if (u !== "TAF") return v; // if you ever use other units later

  const col = String(colName || "").toLowerCase();
  const alreadyThousand =
    col.includes("thousand") || col.includes("taf") || col.includes("kaf") || col.includes("thousand af");

  return alreadyThousand ? v : (v / 1000);
}


// Main renderer
async function renderSingleValue(el) {


  try {
    const label = el.dataset.label || "";
    const csv = el.dataset.csv;
    const col = el.dataset.col;
    const units = el.dataset.units || "TAF";

    // Month you want (e.g., "Apr" or "April")
    const monthAbbr = normalizeMonth(el.dataset.month);
    // if (!monthAbbr) throw new Error(`single-value "${label}": invalid data-month`);

    if (!csv) throw new Error(`single-value "${label}": missing data-csv`);
    if (!col) throw new Error(`single-value "${label}": missing data-col`);

    // Year logic:
    // default: "forecast year" = current WY + 1 (WY 2025 => forecast year 2026)
    const wy = getCurrentWaterYear();
    const forecastYear = wy + 1;

    // Allow override if you ever want it later:
    // data-year="2026" OR data-year-mode="waterYearEnd" / "waterYearStart" / "calendar"
    let targetYear = forecastYear;
    if (el.dataset.year && /^\d{4}$/.test(el.dataset.year.trim())) {
      targetYear = Number(el.dataset.year.trim());
    } else if (String(el.dataset.yearMode || "").toLowerCase() === "wateryearstart") {
      targetYear = wy;
    } else if (String(el.dataset.yearMode || "").toLowerCase() === "calendar") {
      targetYear = new Date().getFullYear();
    } // default is forecastYear

    // Load + parse CSV
    const text = await fetchText(csv);
    const { labels, values } = parseFirstColumnAndNamedValue(text, col);

    // Find the row for month/year 
      // If month is provided, find that exact month/year. 
      // If month is NOT provided, pick the latest row in the current water year.

    let idx;

    // If month is provided: find that exact month/year
    if (monthAbbr) {
      idx = labels.findIndex(l => labelMatchesMonthYear(l, monthAbbr, targetYear));
      if (idx === -1) {
        throw new Error(`No row found for ${monthAbbr.toUpperCase()} ${targetYear} in ${csv}`);
      }
    } else {
      // If month is NOT provided: pick the latest row in the current water year
      idx = findLatestIndexInWaterYear(labels, wy);
      if (idx === -1) {
        throw new Error(`No rows found in current water year (WY ${wy}) in ${csv}`);
      }
    }


    const taf = toTAF(values[idx], col, units);
    if (taf == null) throw new Error(`Value is not numeric for ${monthAbbr.toUpperCase()} ${targetYear}`);

    const key = (el.dataset.key || "").trim();
    if (key) SINGLE_VALUE_STORE.set(key, taf);

    // Render
    el.innerHTML = `
      <div class="single-value-label"><strong>${label}</strong></div>
      <div class="single-value-number">${taf.toFixed(1)} ${units}</div>
    `;
  } catch (err) {
    console.error(err);
    el.innerHTML = `<strong>Error:</strong> ${err.message}`;
  }
}

// Computer data-sum, data-diff, data-ratio values using data-key references
function renderComputedValue(el) {
  const label = el.dataset.label || "";
  const units = el.dataset.units || "TAF";

  const sumSpec = (el.dataset.sum || "").trim();
  const diffSpec = (el.dataset.diff || "").trim();
  const ratioSpec = (el.dataset.ratio || "").trim();

  let result = null;
  let keys = [];

  if (sumSpec) {
    keys = sumSpec.split(",").map(s => s.trim()).filter(Boolean);
    result = keys.reduce((acc, k) => acc + SINGLE_VALUE_STORE.get(k), 0);

  } else if (diffSpec) {
    keys = diffSpec.split(",").map(s => s.trim()).filter(Boolean);
    if (keys.length !== 2) {
      el.innerHTML = `<strong>Error:</strong> data-diff requires 2 keys`;
      return;
    }
    result = SINGLE_VALUE_STORE.get(keys[0]) - SINGLE_VALUE_STORE.get(keys[1]);

  } else if (ratioSpec) {
    keys = ratioSpec.split(",").map(s => s.trim()).filter(Boolean);
    if (keys.length !== 2) {
      el.innerHTML = `<strong>Error:</strong> data-ratio requires 2 keys`;
      return;
    }
    result = SINGLE_VALUE_STORE.get(keys[0]) / SINGLE_VALUE_STORE.get(keys[1]);
  }

  if (!keys.length) return;

  const missing = keys.filter(k => !SINGLE_VALUE_STORE.has(k));
  if (missing.length) {
    el.innerHTML = `<strong>Error:</strong> Missing inputs: ${missing.join(", ")}`;
    return;
  }

  el.innerHTML = `
    <div class="single-value-label"><strong>${label}</strong></div>
    <div class="single-value-number">${result.toFixed(1)} ${units}</div>
  `;
}








// ------------------------------------------------------------------------
// -----------------------MULTIPLE CHARTS LOGIC ---------------------------
// ------------------------------------------------------------------------
// Reads a JSON series config from #chart[data-series] and overlays any number of CSVs
// ------------------------------------------------------------------------


// ------------------ CSV PARSING ------------------
function parseFirstColumnAndNamedValue(text, valueColumnName) {
  if (!valueColumnName) {
    throw new Error("Value column name (y) must be provided for this CSV.");
  }

  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const target = valueColumnName.toLowerCase();

  // Find header row that contains the target value column
  const headerIndex = lines.findIndex(line => {
    const cols = line.split(/\t|,/).map(s =>
      s.trim().replace(/^"|"$/g, "")
    );
    return cols.some(c => c.toLowerCase() === target);
  });

  if (headerIndex === -1) {
    throw new Error(`Could not find value column "${valueColumnName}" in CSV.`);
  }

  const headerCols = lines[headerIndex]
    .split(/\t|,/)
    .map(s => s.trim().replace(/^"|"$/g, ""));

  const yIndex = headerCols.findIndex(c => c.toLowerCase() === target);
  if (yIndex === -1) {
    throw new Error(`Could not find value column "${valueColumnName}" in CSV header.`);
  }

  const labels = [];
  const values = [];

  for (const line of lines.slice(headerIndex + 1)) {
    const cols = line.split(/\t|,/).map(s =>
      s.trim().replace(/^"|"$/g, "")
    );

    if (cols.length <= yIndex) continue;

    const xLabel = cols[0]; // first column = x-axis label
    const rawValue = cols[yIndex];
    const value = Number(String(rawValue).replace(/,/g, ""));

    if (xLabel && !Number.isNaN(value)) {
      labels.push(xLabel);
      values.push(value);
    }
  }

  return { labels, values };
}

// -------- WATER YEAR HELPERS ----------

// Oct–Dec → WY = 2000 + YY
// Jan–Sep → WY = 2000 + YY - 1
function getLabelWaterYear(label) {
  let month, year;

  // Mon-YY
  let m = label.match(/^([A-Za-z]{3})-(\d{2})$/);
  if (m) {
    month = MONTH_INDEX[m[1].toLowerCase()];
    year = 2000 + Number(m[2]);
  } else {
    // YY-Mon
    m = label.match(/^(\d{2})-([A-Za-z]{3})$/);
    if (!m) return null;
    year = 2000 + Number(m[1]);
    month = MONTH_INDEX[m[2].toLowerCase()];
  }

  // Oct–Dec → WY = year
  // Jan–Sep → WY = year - 1
  return month >= 9 ? year : year - 1;
}

function getCurrentWaterYear() {
  const today = new Date();
  return today >= new Date(today.getFullYear(), 9, 1)
    ? today.getFullYear()
    : today.getFullYear() - 1;
}
// function getPreviousWaterYear() {
//   const today = new Date();
//   return today >= new Date(today.getFullYear(), 9, 1)
//     ? today.getFullYear() - 1
//     : today.getFullYear() - 2;
// }

// Finish to calculate previous water year for average line
function getPreviousWaterYear() {
  const today = new Date();
  return today >= new Date(today.getFullYear(), 9, 1)
    ? today.getFullYear() - 1
    : today.getFullYear() - 2;
}

// -------------- FETCHING ---------------

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.text();
}

// -------------- RENDERING ---------------

function renderChart(el) {
  // const el = document.getElementById("chart");
  // if (!el) return;

  const title = el.dataset.title || "Chart";
  const subtitle = el.dataset.subtitle || "";

  let seriesConfig;
  try {
    seriesConfig = JSON.parse(el.dataset.series || "[]");
  } catch (e) {
    el.innerHTML = `<strong>Error:</strong> data-series is not valid JSON.`;
    return;
  }

  if (!Array.isArray(seriesConfig) || seriesConfig.length === 0) {
    el.innerHTML = `<strong>Error:</strong> No series provided. Add data-series='[{"csv":"file.csv","name":"Label"}]'.`;
    return;
  }

  Promise.all(seriesConfig.map(s => fetchText(s.csv)))
    .then(csvTexts => {
      // check which water year to filter to (current WY by default, or previous if specified in any series)
      console.log("---------------------------------------------------")
      const currentWY = getCurrentWaterYear();
      console.log("Current water year:", currentWY);
      const previousWY = currentWY - 1;

      // Use the first series as the x-axis reference
      let xAxisLabels = null;

      //  Check if it is stacked
      const stacked = (el.dataset.stacked || "").toLowerCase() === "true";


      // Build ECharts series array
      const series = csvTexts.map((csvText, idx) => {
        const cfg = seriesConfig[idx];
        const { labels, values } = parseFirstColumnAndNamedValue(csvText, cfg.y);

        // Filter to target water year (current or previous)
        const targetWY = cfg.waterYear === "previous" ? previousWY : currentWY;
        console.log(targetWY);
        const filtered = labels
          .map((label, i) => {
            const wy = getLabelWaterYear(label);
            console.log("Label:", label, "WY:", wy);
            return {
              label,
              value: values[i],
              wy
            };
          })
          .filter(d => d.wy === targetWY);

        console.log("filtered: ", filtered);
        if (!filtered.length) return null;

        if (!xAxisLabels) {
          xAxisLabels = filtered.map(d => d.label);
        }

        // Map label --> TAF value (divide by 1000)
        const valueMap = new Map(filtered.map(d => [d.label, d.value / 1000]));

        // Map y values from x values
        const y = xAxisLabels.map(label => (valueMap.has(label) ? valueMap.get(label) : null));

        // Default: render as line chart if not specified
        const chartType = (cfg.type || "line").toLowerCase();
        console.log(`Configuring series "${cfg.name || cfg.csv}" with chart type: ${chartType}`);
        const isArea = chartType === "area";
        const echartsType = isArea ? "line" : chartType;
        const ys = y.filter(v => v != null);
        const mag = isArea ? (ys.reduce((a,b)=>a+b,0) / ys.length) : null;
        
        
        return {
          name: cfg.name || cfg.csv,
          type: chartType === "area" ? "line" : chartType,
          data: y,
          smooth: echartsType === "line",
          symbolSize: echartsType === "line" ? 6 : 0,
          showSymbol: echartsType === "line",
          areaStyle: chartType === "area" ? {} : undefined,  // comment out to disable area fill
          // emphasis: { focus: "series" },   // highlight entire series on hover
          stack: stacked ? "total" : undefined,

          // Layering
          _isArea: isArea,
          _mag: mag

        };
      }).filter(Boolean);


      // --- Robust layering rules ---
      // 1) Areas behind everything, and among areas: bigger behind smaller
      // 2) Lines always on top of areas

      series.sort((a, b) => {
        const aArea = !!a._isArea;
        const bArea = !!b._isArea;

        // Areas first (drawn earlier = behind)
        if (aArea !== bArea) return aArea ? -1 : 1;

        // Within areas: bigger first (behind), smaller last (on top)
        if (aArea && bArea) return (b._mag ?? -Infinity) - (a._mag ?? -Infinity);

        // Otherwise keep stable
        return 0;
      });

      // Assign zlevel AFTER sorting
      series.forEach((s, i) => {
        if (s._isArea) {
          s.zlevel = 0;   // area canvas
          s.z = i;        // respects sorted order
        } else if (s.type === "line") {
          s.zlevel = 1;   // line canvas above areas
          s.z = 1000 + i;
        }
      });

      // Clean up temp fields
      series.forEach(s => { delete s._isArea; delete s._mag; });



      if (!xAxisLabels || series.length === 0) {
        throw new Error("No data found for current water year across the provided series.");
      }

      const chart = echarts.init(el);

      chart.setOption({
        title: {
          text: title,
          subtext: subtitle,
          left: "center"
        },

        legend: {
          bottom: 60,
          left: "center",
          data: series.map(s => s.name).slice().sort((a, b) => a.localeCompare(b))
        },

        tooltip: {
          trigger: "axis",
          valueFormatter: v => (v == null ? "" : `${Number(v).toFixed(1)} TAF`)
        },

        grid: {
          left: 100,
          right: 80,
          top: 100,
          bottom: 150
        },

        xAxis: {
          type: "category",
          name: "Month",
          nameLocation: "middle",
          nameGap: 45,
          boundaryGap: false,
          data: xAxisLabels,
          axisLabel: { interval: 0 },
          axisTick: { alignWithLabel: true }
        },

        yAxis: {
          type: "value",
          name: "Storage (thousand acre-feet)",
          nameLocation: "middle",
          nameGap: 65
        },

        series
      });

      window.addEventListener("resize", () => chart.resize());
    })
    .catch(err => {
      console.error(err);
      el.innerHTML = `<strong>Error:</strong> ${err.message}`;
    });
}   // end of render function





document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".chart").forEach(renderChart);

  const allSingleEls = Array.from(document.querySelectorAll(".single-value"));

  const isComputed = (el) =>
    el.dataset.sum || el.dataset.diff || el.dataset.ratio; // add more ops here later

  const rawEls = allSingleEls.filter(el => !isComputed(el));
  const computedEls = allSingleEls.filter(el => isComputed(el));

  // 1) render all raw single values first (and store their numbers)
  await Promise.all(rawEls.map(renderSingleValue));

  // 2) now render computed ones (sum/diff/ratio)
  computedEls.forEach(renderComputedValue);
});
