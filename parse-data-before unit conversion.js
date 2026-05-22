// --------------------------------------------------------------------------
// -------------------------  DATA EXTRACTION -------------------------------
// Robust parsing of month/year from a label to find the right row in the CSV
// --------------------------------------------------------------------------
const SINGLE_VALUE_STORE = new Map(); // key -> { value:number, units:string }
const SINGLE_VALUE_DIM = new Map();   // key -> "volume" | "depth" | "flow"

function resolveWaterYearFromSpec(yearSpec) {
  const s = String(yearSpec ?? "").trim().toLowerCase();
  const currentWY = getCurrentWaterYear();

  if (!s) return currentWY;

  if (s === "current" || s === "curr") return currentWY;
  if (s === "previous" || s === "prev") return currentWY - 1;

  // Accept 4-digit year
  if (/^\d{4}$/.test(s)) return Number(s);

  throw new Error(`Invalid data-year "${yearSpec}". Use "current", "previous", or 4-digit year like "2026".`);
}

function waterYearToCalendarYearForMonth(wy, monthIndex) {
  // WY 2026 runs Oct 2025 .. Sep 2026
  // monthIndex: 0=Jan..11=Dec
  // Oct/Nov/Dec belong to calendar year wy-1
  // Jan..Sep belong to calendar year wy
  return (monthIndex >= 9) ? (wy - 1) : wy;
}


function pickSingleValueRowIndex(labels, { monthAbbr, wy }) {
  // If month specified: find exact matching calendar month+year inside that WY
  if (monthAbbr) {
    const mi = MONTH_INDEX[monthAbbr];
    if (mi == null) throw new Error(`Invalid month "${monthAbbr}"`);

    const calendarYear = waterYearToCalendarYearForMonth(wy, mi);

    const idx = labels.findIndex(l => labelMatchesMonthYear(l, monthAbbr, calendarYear));
    return idx; // can be -1 (caller handles)
  }

  // If month NOT specified: choose latest month row inside WY
  return findLatestIndexInWaterYear(labels, wy);
}

const MONTH_ABBR = {
  january: "jan", february: "feb", march: "mar", april: "apr", may: "may", june: "jun",
  july: "jul", august: "aug", september: "sep", october: "oct", november: "nov", december: "dec",
  jan: "jan", feb: "feb", mar: "mar", apr: "apr", jun: "jun", jul: "jul", aug: "aug",
  sep: "sep", sept: "sep", oct: "oct", nov: "nov", dec: "dec"
};

const WY_MONTHS = ["Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep"];

function wyMonthOrderFromLabel(label) {
  const p = parseMonthYear(label);
  if (!p) return null;
  return (p.monthIndex >= 9) ? (p.monthIndex - 9) : (p.monthIndex + 3); // Oct=0 ... Sep=11
}

function isYearOnlyLabel(label) {
  if (!label) return null;
  const s = String(label).trim();
  // 4-digit year
  if (/^\d{4}$/.test(s)) return Number(s);
  // (optional) 2-digit year support, if you ever have "26". Buggy with 1990s
  // if (/^\d{2}$/.test(s)) return 2000 + Number(s);
  return null;
}

// Helper function to parse data that does not contain years (Historical Averages, for example)
function isMonthOnlyLabel(label) {
  const m = normalizeMonth(label);
  return !!m; // "Oct", "October", "oct" -> true
}

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


  // 0) Handle your main format: "25-Oct" or "23-Sep" (YY-Mon)
  let m0 = s.match(/^(\d{2})\s*[-/.\s_]\s*([a-z]{3,9})$/i);
  if (m0) {
    const year = 2000 + Number(m0[1]);
    const monthAbbr = normalizeMonth(m0[2]);
    const monthIndex = MONTH_INDEX[monthAbbr];
    if (monthIndex != null) return { monthIndex, year };
  }

  // Also handle "Oct-25" (Mon-YY) just in case
  m0 = s.match(/^([a-z]{3,9})\s*[-/.\s_]\s*(\d{2})$/i);
  if (m0) {
    const monthAbbr = normalizeMonth(m0[1]);
    const year = 2000 + Number(m0[2]);
    const monthIndex = MONTH_INDEX[monthAbbr];
    if (monthIndex != null) return { monthIndex, year };
  }

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
    // const wy = (p.monthIndex >= 9) ? p.year : (p.year - 1);
    const wy = (p.monthIndex >= 9) ? (p.year + 1) : p.year;

    if (wy !== targetWY) continue;

    // score increases with later months in the WY
    // map Oct..Dec to 0..2, Jan..Sep to 3..11 so ordering is consistent
    const wyMonthOrder = wyMonthOrderFromLabel(labels[i]);
    if (wyMonthOrder == null) continue;

    // primary: latest month; secondary: later row wins (in case duplicates)
    const score = wyMonthOrder * 10000 + i;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}




// Current month index in WY order (Oct=0..Sep=11) for "today"
function currentWyMonthIndex(today = new Date()) {
  const calMonth = today.getMonth(); // 0=Jan..11=Dec
  return (calMonth >= 9) ? (calMonth - 9) : (calMonth + 3);
}

// Split y into [pastY, futureY] where future includes current month index and after
function splitPastFuture(y, splitIdx) {
  const past = y.map((v, i) => (i < splitIdx ? v : null));
  const future = y.map((v, i) => (i >= splitIdx ? v : null));
  return { past, future };
}


//
// ------------------------ UNITS ---------------------------


// --------------------------------------------------------------------------
// ------------------------- SINGLE VALUE LOGIC -----------------------------
// --------------------------------------------------------------------------
// For rendering a single value from a CSV
// Reads <div class="single-value" data-csv data-col data-month ...> and prints one value
// --------------------------------------------------------------------------


// Sum column for water year
function sumColumnForWaterYear(labels, values, targetWY) {
  let sum = 0;
  let found = 0;

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const raw = values[i];

    // Skip non-numeric
    const v = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(v)) continue;

    // If the CSV is month-only (no year), we cannot WY-filter reliably.
    // Decide your rule; simplest: skip these in WY sums.
    if (isMonthOnlyLabel(label)) continue;

    const wy = getLabelWaterYear(label);
    if (wy === targetWY) {
      sum += v;
      found++;
    }
  }

  return { sum, found };
}

// Decide whether to divide by 1000 to convert to TAF
// If  CSV column/header indicates "Thousand", assume it's already TAF
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
    // const label = el.dataset.label || "";
    let labelTemplate = el.dataset.label || ""; // make html labels dynamic with years
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
    // Determine target Water Year from data-year
    const wy = resolveWaterYearFromSpec(el.dataset.year);
    // Replace {year} placeholder in HTML label
    const label = labelTemplate.replace(/\{year\}/gi, String(wy));

    // Load + parse CSV
    const text = await fetchText(csv);
    const { labels, values } = parseFirstColumnAndNamedValue(text, col);


    // Sum the values for the water year if sumWY is true
    const wantsSum = String(el.dataset.sumwy || "").toLowerCase() === "true";

    // If sum mode: sum all values in the WY
    if (wantsSum) {
      const { sum, found } = sumColumnForWaterYear(labels, values, wy);

      if (!found) {
        throw new Error(`No monthly rows found for WY ${wy} in ${csv}`);
      }

      const tafSum = toTAF(sum, col, units);
      if (tafSum == null) throw new Error(`Sum is not numeric for WY ${wy}`);

      const key = (el.dataset.key || "").trim();
      if (key) SINGLE_VALUE_STORE.set(key, tafSum);

      el.innerHTML = `
        <div class="single-value-label"><strong>${label}</strong></div>
        <div class="single-value-number">${tafSum.toFixed(1)} ${units}</div>
      `;
      return;
    }


    let idx = pickSingleValueRowIndex(labels, { monthAbbr, wy });

    if (monthAbbr && idx === -1) {
      const mi = MONTH_INDEX[monthAbbr];
      const calendarYear = waterYearToCalendarYearForMonth(wy, mi);
      throw new Error(`No row found for ${monthAbbr.toUpperCase()} ${calendarYear} (WY ${wy}) in ${csv}`);
    }

    if (!monthAbbr && idx === -1) {
      // keep  existing year-only fallback for now (task #2 will strengthen this)
      const wyStr = String(wy);

      idx = labels.findIndex(l => String(l).trim() === wyStr);

      if (idx === -1) {
        let bestYear = -Infinity;
        let bestIdx = -1;

        for (let i = 0; i < labels.length; i++) {
          const y = isYearOnlyLabel(labels[i]);
          if (y != null && y > bestYear) {
            bestYear = y;
            bestIdx = i;
          }
        }

        idx = bestIdx;
      }

      if (idx === -1) {
        throw new Error(`No monthly WY rows or year-only rows found for WY ${wy} in ${csv}`);
      }
    }


    const taf = toTAF(values[idx], col, units);
    // if (taf == null) throw new Error(`Value is not numeric for ${monthAbbr.toUpperCase()} ${targetYear}`);
    if (taf == null) {
      const desc = monthAbbr
        ? `${monthAbbr.toUpperCase()} (WY ${wy})`
        : `latest value (WY ${wy})`;
      throw new Error(`Value is not numeric for ${desc}`);
    }
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
// Contains logic to parse when cfg.y is empty/missing
function parseFirstColumnAndNamedValue(text, valueColumnName) {

  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const rows = lines.map(line =>
    line.split(/\t|,/).map(s => s.trim().replace(/^"|"$/g, ""))
  );

  const cleanName = String(valueColumnName || "").trim();
  const hasName = cleanName.length > 0;

  let headerIndex = -1;
  let yIndex = -1;

  // Case A) No y provided: automatically determine column
  if (!hasName) {

    // Find first row that looks like actual data:
    // It must have at least one numeric value after first column
    const firstDataRow = rows.findIndex(cols => {
      if (!cols || cols.length < 2) return false;

      for (let j = 1; j < cols.length; j++) {
        const v = Number(String(cols[j]).replace(/,/g, ""));
        if (Number.isFinite(v)) return true;
      }

      return false;
    });

    if (firstDataRow === -1) {
      throw new Error(`Could not find any numeric data column.`);
    }

    // Prefer "next column" (index 1) IF it is numeric.
    // This matches your requirement: "use the next column"
    const colsAtFirstData = rows[firstDataRow];
    const nextColVal = Number(String(colsAtFirstData[1]).replace(/,/g, ""));

    if (Number.isFinite(nextColVal)) {
      yIndex = 1;
    } else {

      // If column 1 isn't numeric, fall back to:
      // First numeric column AFTER column 0
      yIndex = -1;

      for (let j = 1; j < colsAtFirstData.length; j++) {
        const v = Number(String(colsAtFirstData[j]).replace(/,/g, ""));
        if (Number.isFinite(v)) {
          yIndex = j;
          break;
        }
      }

      if (yIndex === -1) {
        throw new Error(`Could not determine numeric value column.`);
      }
    }


    // If row before firstDataRow exists AND its value column is NON-numeric, treat that row as header.
    // But also handles CSVs with No header at all.
    if (firstDataRow > 0) {
      const maybeHeader = rows[firstDataRow - 1];
      const hv = maybeHeader?.[yIndex];
      const hvNum = Number(String(hv ?? "").replace(/,/g, ""));

      headerIndex = Number.isFinite(hvNum)
        ? -1                  // previous row was numeric → no header
        : (firstDataRow - 1); // previous row non-numeric → header row
    } else {
      headerIndex = -1; // Data starts immediately → no header
    }

    // Case B) y provided: find header row and matching column
  } else {

    const target = cleanName.toLowerCase();

    // Find header row that contains the target value column
    headerIndex = rows.findIndex(cols =>
      cols.some(c => String(c).toLowerCase() === target)
    );

    if (headerIndex === -1) {
      throw new Error(`Could not find value column "${cleanName}" in CSV.`);
    }

    const headerCols = rows[headerIndex];

    yIndex = headerCols.findIndex(c =>
      String(c).toLowerCase() === target
    );

    if (yIndex === -1) {
      throw new Error(`Could not find value column "${cleanName}" in CSV header.`);
    }
  }

  // --------------------------------------------------
  // Build labels and values arrays
  // --------------------------------------------------
  const labels = [];
  const values = [];

  // If headerIndex is -1, slice(0) returns all rows (correct behavior)
  for (const cols of rows.slice(headerIndex + 1)) {

    if (!cols || cols.length <= yIndex) continue;

    const xLabel = cols[0];      // first column = x-axis label
    const rawValue = cols[yIndex];
    const value = Number(String(rawValue).replace(/,/g, ""));

    if (xLabel && Number.isFinite(value)) {
      labels.push(xLabel);
      values.push(value);
    }
  }

  return { labels, values };
}
// function parseFirstColumnAndNamedValue(text, valueColumnName) {
//   if (!valueColumnName) {
//     throw new Error("Value column name (y) must be provided for this CSV.");
//   }

//   const lines = text
//     .split(/\r?\n/)
//     .map(l => l.trim())
//     .filter(Boolean);

//   const target = valueColumnName.toLowerCase();

//   // Find header row that contains the target value column
//   const headerIndex = lines.findIndex(line => {
//     const cols = line.split(/\t|,/).map(s =>
//       s.trim().replace(/^"|"$/g, "")
//     );
//     return cols.some(c => c.toLowerCase() === target);
//   });

//   if (headerIndex === -1) {
//     throw new Error(`Could not find value column "${valueColumnName}" in CSV.`);
//   }

//   const headerCols = lines[headerIndex]
//     .split(/\t|,/)
//     .map(s => s.trim().replace(/^"|"$/g, ""));

//   const yIndex = headerCols.findIndex(c => c.toLowerCase() === target);
//   if (yIndex === -1) {
//     throw new Error(`Could not find value column "${valueColumnName}" in CSV header.`);
//   }

//   const labels = [];
//   const values = [];

//   for (const line of lines.slice(headerIndex + 1)) {
//     const cols = line.split(/\t|,/).map(s =>
//       s.trim().replace(/^"|"$/g, "")
//     );

//     if (cols.length <= yIndex) continue;

//     const xLabel = cols[0]; // first column = x-axis label
//     const rawValue = cols[yIndex];
//     const value = Number(String(rawValue).replace(/,/g, ""));

//     if (xLabel && !Number.isNaN(value)) {
//       labels.push(xLabel);
//       values.push(value);
//     }
//   }

//   return { labels, values };
// }

// -------- WATER YEAR HELPERS ----------
// WY is defined by END year: Oct 2025–Sep 2026 => WY 2026
function getLabelWaterYear(label) {
  const p = parseMonthYear(label);
  if (!p) return null;

  // Oct–Dec => WY = year + 1
  // Jan–Sep => WY = year
  return (p.monthIndex >= 9) ? (p.year + 1) : p.year;
}


function getCurrentWaterYear() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth(); // 0=Jan ... 9=Oct
  return (m >= 9) ? (y + 1) : y;
}

function getPreviousWaterYear() {
  return getCurrentWaterYear() - 1;
}


// ------- HTML Water Year Helpers ---------------
function formatWyRange(wy) {
  return `Oct 1 ${wy - 1} - Sep 30 ${wy}`;
}

function applyWyPlaceholders(root = document) {
  const currentWY = getCurrentWaterYear();
  const previousWY = currentWY - 1;
  const wyRange = formatWyRange(currentWY);

  // Replace tokens in a string (case-insensitive)
  const apply = (str) => {
    let out = String(str ?? "");

    // WY range
    out = out.replace(/\{wyrange\}/gi, wyRange);

    // Current WY synonyms
    out = out.replace(/\{(year|curr|current|curryear|currentyear|current year|curr year)\}/gi, String(currentWY));

    // Previous WY synonyms
    out = out.replace(/\{(prev|previous|prevyear|previousyear|previous year|prev year)\}/gi, String(previousWY));

    return out;
  };

  // 1) Any element text that opts in (header pills, etc.)
  root.querySelectorAll("[data-wy-range]").forEach(el => {
    el.textContent = apply(el.textContent);
  });

  // 2) Charts: title/subtitle + series JSON string
  root.querySelectorAll(".chart").forEach(el => {
    el.dataset.title = apply(el.dataset.title);
    el.dataset.subtitle = apply(el.dataset.subtitle);
    el.dataset.series = apply(el.dataset.series);
  });

  // 3) Single values: labels in HTML (global)

  root.querySelectorAll(".single-value").forEach(el => {
    el.dataset.label = apply(el.dataset.label);
  });
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


      const series = csvTexts.flatMap((csvText, idx) => {
      const cfg = seriesConfig[idx];
      const { labels, values } = parseFirstColumnAndNamedValue(csvText, cfg.y);

      const targetWY = cfg.waterYear === "previous" ? previousWY : currentWY;

      const filtered = labels
        .map((label, i) => ({
          label,
          value: values[i],
          wy: getLabelWaterYear(label)
        }))
        .filter(d => {
          // If the CSV is month-only (like for averages), keep everything
          if (isMonthOnlyLabel(d.label)) return true;

          // Otherwise do normal WY filtering
          return d.wy === targetWY;
        });

      if (!filtered.length) return [];

      if (!xAxisLabels) xAxisLabels = WY_MONTHS;

      const valueMap = new Map(
        filtered
          .map(d => {
            const k = wyMonthOrderFromLabel(d.label);

            // FIX LATER --> Doesn't work with stacked areas
            let adjustedValue = d.value;
            if (cfg.adjust) {
              adjustedValue += Number(cfg.adjust);
            }
            
            if (k == null) {
              // month-only fallback:
              const mo = normalizeMonth(d.label);
              if (!mo) return null;
              const monthIndex = MONTH_INDEX[mo]; // 9 for Oct etc.
              const kk = (monthIndex >= 9) ? (monthIndex - 9) : (monthIndex + 3);
              return [kk, adjustedValue / 1000]; // don't /1000 for inches (see note below)
            }




            return [k, adjustedValue / 1000]; // convert to TAF
          })
          .filter(Boolean)
      );

      const y = WY_MONTHS.map((_, k) => (valueMap.has(k) ? valueMap.get(k) : null));
      if (!y.some(v => v != null)) return [];

      const chartType = (cfg.type || "line").toLowerCase();
      const isArea = chartType === "area";

      const color = cfg.color;
      const fillColor = cfg.fillColor;
      const width = Number(cfg.width) || 2;

      // ---- Base series factory ----
      const makeSeries = (name, data, { dashed } = {}) => ({
        id: `${cfg.name || cfg.csv}-${name}-${dashed ? "forecast" : "hist"}`, // unique
        name: cfg.name || cfg.csv, // IMPORTANT: keep legend item as a single name
        type: isArea ? "line" : chartType,
        data,
        smooth: !isArea && chartType === "line",
        symbolSize: (!isArea && chartType === "line") ? 6 : 0,
        showSymbol: (!isArea && chartType === "line"),

        // areaStyle: isArea ? { color: fillColor } : undefined,
        areaStyle: isArea
          ? {
              color: fillColor,
              opacity: dashed ? 0.55 : 0.75   // make fill lighter for forecast (dashed) portion
            }
          : undefined,

        stack: stacked &&
          cfg.stack !== false &&
          (typeof cfg.stack === "string" ? cfg.stack : (isArea ? "total" : null)) || undefined,

        lineStyle: {
          ...(color ? { color } : {}),
          width,
          ...(dashed ? { type: "dashed" } : { type: "solid" })
        },
        itemStyle: color ? { color } : undefined,

        // for your layering sorter
        _isArea: isArea,
        _mag: isArea ? (() => {
          const ys = data.filter(v => v != null);
          return ys.length ? (ys.reduce((a,b)=>a+b,0) / ys.length) : null;
        })() : null,


        _stackOrder: idx
      });

      // ---- Split ONLY if:
      // 1) It's a LINE (not area)
      // 2) It's the CURRENT water year (not previous)
      // 3) cfg.dashFromCurrentMonth is not explicitly false
      // 4) not stacked
      const dashFromCurrentMonth = cfg.dashFromCurrentMonth !== false;
      const shouldSplit =
        (chartType === "line" || chartType === "area") &&
        targetWY === currentWY &&
        dashFromCurrentMonth && !stacked;

      if (!shouldSplit) {
        // Handle Stacked area graphs - create 2 series
        // make sure bridge point is not added twice. Have the value there be 0 for the future chart
        
        return [makeSeries("full", y, { dashed: false })];
      }



      const splitIdx = currentWyMonthIndex(new Date()); // Feb 18 => Feb index in WY
      const { past, future } = splitPastFuture(y, splitIdx);


      // Bridge: include the last historical point in the dashed series
      const futureConnected = future.slice();
      if (splitIdx > 0) futureConnected[splitIdx - 1] = y[splitIdx - 1];


      return [

        makeSeries("historical", past, { dashed: false}),
        makeSeries("forecast", futureConnected, { dashed: true })
      ];
    }).filter(Boolean);


    // ---------------- Light Overlay over forecasted areasfor stacked charts ----------------
    // STACKED - Cumulative dashes
    if (stacked) {
      const splitIdx = currentWyMonthIndex(new Date());

      const stackedAreas = series
        .filter(s => s.stack === "total" && s.areaStyle);

      // We need cumulative stack values in draw order
      let cumulative = new Array(WY_MONTHS.length).fill(0);

      stackedAreas.forEach((areaSeries, index) => {

        // add this series to cumulative stack
        cumulative = cumulative.map((sum, i) => {
          const v = areaSeries.data?.[i];
          return sum + (Number.isFinite(v) ? v : 0);
        });

        // forecast portion only
        const futureBoundary = cumulative.map((v, i) =>
          (i >= splitIdx ? v : null)
        );

        series.push({
          id: `STACK-forecast-overlay-${index}`,
          name: "__internal_stack_overlay__",
          type: "line",
          data: futureBoundary,
          showSymbol: false,
          symbolSize: 0,
          // make  the line color the same as the previous series in the stack, but dashed and semi-transparent
          lineStyle: { width: 2,  color: "rgba(255, 255, 255, 0.5)", type: [4, 12]  },
          // areaStyle: undefined,
          areaStyle: { color: "rgba(255,255,255,0.25)" },
          stack: undefined,
          tooltip: { show: false },
          zlevel: 10,
          z: 99999
        });
      });
    }

    



      // --- Robust layering rules ---
      // 1) Areas behind everything, and among areas: bigger behind smaller
      // 2) Lines always on top of areas

      series.sort((a, b) => {

        // Preserve stack order for stacked areas 
        if (stacked) {
          const aStackedArea = a.stack === "total" && a.areaStyle;
          const bStackedArea = b.stack === "total" && b.areaStyle;

          // Keep stacked areas in original config order
          if (aStackedArea && bStackedArea) return (a._stackOrder ?? 0) - (b._stackOrder ?? 0);

          // Keep stacked areas behind non-stacked things (like overlays)
          if (aStackedArea !== bStackedArea) return aStackedArea ? -1 : 1;

          return 0;
        }

        const aArea = !!a._isArea;
        const bArea = !!b._isArea;

        // Areas first (drawn earlier = behind)
        if (aArea !== bArea) return aArea ? -1 : 1;

        // Within areas: bigger first (behind), smaller last (on top)
        if (aArea && bArea) return (b._mag ?? -Infinity) - (a._mag ?? -Infinity);

        // Otherwise keep stable
        return 0;
      }); // end series.sort(a,b)

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
      series.forEach(s => { delete s._isArea; delete s._mag; delete s._stackOrder; });


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
          data: series
            .map(s => s.name)
            .filter(n => n !== "__internal_total_outline__")
            .filter(n => n !== "__internal_stack_overlay__")
            .slice()
            .sort((a, b) => a.localeCompare(b))
        },

        tooltip: {
          // trigger: "axis",
          // valueFormatter: v => (v == null ? "" : `${Number(v).toFixed(1)} TAF`)

          // Fix tooltip bug where dashed/solid causes duplicates
          trigger: "axis",
          formatter: (params) => {
            // params = array of points at this x
            const month = params?.[0]?.axisValueLabel ?? "";

            const byName = new Map();

            for (const p of params) {
              // p.data can be null because you split past/future
              if (p.data == null) continue;

              // keep one entry per series name
              if (!byName.has(p.seriesName)) byName.set(p.seriesName, p);
            }

            const rows = Array.from(byName.values()).map(p => {
              const v = Number(p.data).toFixed(1);
              return `
                <div style="display:flex;align-items:center;gap:8px;">
                  ${p.marker}
                  <span>${p.seriesName}</span>
                  <span style="margin-left:auto;font-weight:600;">${v} TAF</span>
                </div>`;
            });

            return `<div><strong>${month}</strong></div>${rows.join("")}`;
          }
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
          boundaryGap: series.some(s => s.type === "bar") ? true : false,
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

  applyWyPlaceholders();               // Water Year HTML
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
