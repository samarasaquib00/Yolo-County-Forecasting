# HTML Field Name Reference

## `<div class="chart">` attributes

| Attribute | What it does |
|---|---|
| `id` | Section anchor (e.g. `#clear-lake`) used by nav/timeline links |
| `data-title` | Chart title text |
| `data-subtitle` | Chart subtitle (supports `{wyRange}` template) |
| `data-stacked` | `"true"` / `"false"` — flag to indicate whether series can stack on top of each other |
| `data-series` | JSON array of series configs (see below) |
| `data-units` | Chart-level default output units (e.g. `"TAF"`) — overridden by per-series `units` |
| `data-source-units` | Chart-level input units override; overrides auto-detection from CSV |
| `data-note` | Optional footnote/note text rendered below the chart |
| `data-condition-bands` | `"true"` to show water year type background bands |
| `data-condition-bands-csv` | CSV file to read condition bands from, such as `"../Data/Water Year Types.csv"` |

---

## `<div class="single-value">` attributes

| Attribute | What it does |
|---|---|
| `data-key` | Unique ID for this value; lets other elements reference it via `data-sum`, `data-diff`, `data-ratio` |
| `data-label` | Display label (supports `{year}`, `{curr year}` templates) |
| `data-csv` | CSV file to read |
| `data-col` | Column name in the CSV to pull the value from |
| `data-month` | Month abbreviation (e.g. `"Apr"`) to pick a specific row; if omitted, uses the latest row in the water year |
| `data-year` | Target water year: `"current"`, `"previous"`, or a 4-digit year; defaults to current WY |
| `data-units` | Output units (e.g. `"TAF"`) |
| `data-source-units` | Override auto-detected input units from the CSV |
| `data-sum-wy` | `"true"` to sum all monthly rows in the water year instead of picking one |
| `data-sum` | Comma-separated `data-key` values to add together (computed value) |
| `data-diff` | Two comma-separated `data-key` values to subtract (key1 − key2) |
| `data-ratio` | Two comma-separated `data-key` values to divide (key1 ÷ key2) |

---

## `<div class="plotly-map">` attributes

| Attribute | What it does |
|---|---|
| `data-title` | Map title text |
| `data-grid-geojson` | GeoJSON polygon grid file to draw as water table elevation cells |
| `data-grid-value` | Numeric grid property to color by, such as `"24-Sep"` |
| `data-points-geojson` | GeoJSON point file to draw as impacted well markers |
| `data-point-name` | Legend label for the point markers |

---

## JSON fields inside `data-series`

| Field | What it does |
|---|---|
| `csv` | CSV file path to load |
| `csvs` | Array of CSV file paths to stitch in order; earlier files take priority on overlapping months |
| `csvHistorical` | CSV file for the historical portion (stitched mode only) |
| `csvForecast` | CSV file for the forecast portion (stitched mode only) |
| `stitch` | Set to `"back-to-back"` to join multiple CSVs into one continuous line; missing months remain as gaps |
| `name` | Legend label for this series |
| `y` | Column name in the CSV to use as Y values |
| `type` | Series render style: `"line"`, `"area"`, or `"bar"` |
| `adjust` | Numeric offset added to every value (e.g. `-841000` subtracts Clear Lake dead pool) |
| `dashFromCurrentMonth` | `true` = dashes the line from the current month forward to indicate forecast |
| `waterYear` | `"current"` (default), `"previous"`, or a 4-digit year — controls which WY is shown |
| `units` | Per-series output units; overrides chart-level `data-units` |
| `sourceUnits` | Per-series input units override; overrides auto-detection from CSV |
| `yAxisIndex` | `0` = left axis, `1` = right axis (for dual-axis charts like Solano Decree) |
| `stack` | `true` to include this series in stacked area totals |
| `color` | Line/fill color override |
| `fillColor` | Fill color override for area series (separate from line color) |
| `width` | Line width in pixels |
| `monthlyChange` | `true` to display month-over-month change instead of raw values |

---

## Label/subtitle template placeholders

### Current water year — all aliases are equivalent:
`{year}` `{curr}` `{current}` `{curryear}` `{currentyear}` `{current year}` `{curr year}`

### Previous water year — all aliases are equivalent:
`{prev}` `{previous}` `{prevyear}` `{previousyear}` `{previous year}` `{prev year}`

### Other:

| Placeholder | Replaced with |
|---|---|
| `{wyRange}` | Current water year range, e.g. `"Oct 2025 – Sep 2026"` |

> Note: `{year}` inside a `single-value` label is replaced with the water year from that element's `data-year` attribute (which may be current or previous). In chart subtitles, `{year}` always resolves to the current water year.
