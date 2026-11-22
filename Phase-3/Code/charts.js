// charts.js
// Draws the disaster area map and all analytics charts as SVG (no internet / library needed).

const STATUS_COLORS = { "AVAILABLE": "#2e9e44", "BUSY": "#f0a020", "LOW BATTERY": "#8e44ad", "FAILED": "#d62c2c" };
const MISSION_COLORS = { "Pending": "#d62c2c", "Assigned": "#f0a020", "Completed": "#2e9e44" };
const PRIORITY_COLORS = { 5: "#d62c2c", 4: "#ef6c2f", 3: "#f0a020", 2: "#3c8dbc", 1: "#7f8c8d" };
const STATIONS = [...new Set(FLEET.map(f => f[1]))];      // nodes where UAVs start

function esc(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}


// ---------------------------------------------------------------
// MAP OF DISASTER AREA
// highlight = list of nodes of a route to show in blue
// ---------------------------------------------------------------
function drawMap(c, highlight) {
    const W = 1300, H = 820;
    const X = x => (x + 1) / 12.8 * W;
    const Y = y => (8.3 - y) / 10.6 * H;
    const P = n => [X(NODE_POS[n][0]), Y(NODE_POS[n][1])];
    const g = c.graph;
    highlight = highlight || [];
    let s = "";

    // background grid
    s += `<rect width="${W}" height="${H}" fill="#eaf1f8"/>`;
    for (let gx = 0; gx <= W; gx += 65) s += `<line x1="${gx}" y1="0" x2="${gx}" y2="${H}" stroke="white"/>`;
    for (let gy = 0; gy <= H; gy += 65) s += `<line x1="0" y1="${gy}" x2="${W}" y2="${gy}" stroke="white"/>`;

    // highest active priority at each node -> coloured "mission zone"
    const zone = {};
    for (const m of c.missions)
        if (m.status === "Pending" || m.status === "Assigned")
            zone[m.destination] = Math.max(zone[m.destination] || 0, m.priority);
    for (const n in zone) {
        const [x, y] = P(n), col = PRIORITY_COLORS[zone[n]];
        s += `<circle cx="${x}" cy="${y}" r="${55 + 12 * zone[n]}" fill="${col}" opacity="0.10"/>`;
        s += `<circle cx="${x}" cy="${y}" r="${45 + 8 * zone[n]}" fill="${col}" opacity="0.15"/>`;
    }

    // edges of the selected route
    const pathEdges = [];
    for (let i = 0; i + 1 < highlight.length; i++) pathEdges.push(g.key(highlight[i], highlight[i + 1]));

    // edges
    let labels = "";
    for (const [u, v, w] of g.edgeList()) {
        const [x1, y1] = P(u), [x2, y2] = P(v);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        if (g.isBlocked(u, v)) {
            s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d62c2c" stroke-width="3" stroke-dasharray="10 7"/>`;
            labels += `<g><title>Route ${u} - ${v} BLOCKED</title><circle cx="${mx}" cy="${my}" r="13" fill="#d62c2c" stroke="white" stroke-width="2"/>
                <text x="${mx}" y="${my + 5}" text-anchor="middle" font-size="15" font-weight="bold" fill="white">X</text></g>`;
            continue;
        }
        let col = "#34495e";
        if (pathEdges.includes(g.key(u, v))) {
            s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7fb2ff" stroke-width="16" opacity="0.45" stroke-linecap="round"/>`;
            s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1f5fbf" stroke-width="6" stroke-linecap="round"/>`;
            col = "#1f5fbf";
        } else {
            s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9aa9bb" stroke-width="${2 + w * 0.5}" stroke-linecap="round"/>`;
        }
        labels += `<g><title>Route ${u} - ${v}, cost ${w}</title><rect x="${mx - 12}" y="${my - 11}" width="24" height="22" rx="5" fill="white" stroke="${col}"/>
            <text x="${mx}" y="${my + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="${col}">${w}</text></g>`;
    }
    s += labels;

    // arrows showing direction of the selected route
    for (let i = 0; i + 1 < highlight.length; i++) {
        const [x1, y1] = P(highlight[i]), [x2, y2] = P(highlight[i + 1]);
        const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        const ax = x1 + 0.68 * (x2 - x1), ay = y1 + 0.68 * (y2 - y1);
        s += `<polygon points="-11,-8 11,0 -11,8" fill="#0d3c8c" transform="translate(${ax},${ay}) rotate(${ang})"/>`;
    }

    // nodes
    for (const n in NODE_NAMES) {
        const [x, y] = P(n);
        const station = STATIONS.includes(+n);
        let tip = `Node ${n}: ${NODE_NAMES[n]}` + (station ? " (drone station)" : "");
        if (zone[n]) tip += `, active mission priority ${zone[n]}`;
        s += `<g><title>${esc(tip)}</title>`;
        s += `<ellipse cx="${x + 3}" cy="${y + 4}" rx="27" ry="27" fill="black" opacity="0.15"/>`;   // shadow
        if (station) {
            let pts = "";
            for (let k = 0; k < 6; k++) {
                const a = Math.PI / 3 * k + Math.PI / 6;
                pts += `${x + 29 * Math.cos(a)},${y + 29 * Math.sin(a)} `;
            }
            s += `<polygon points="${pts}" fill="#1a3d6d" stroke="white" stroke-width="3"/>`;
        } else {
            let fill = "white";
            if (zone[n]) fill = "#ffe9c7";
            if (highlight.includes(+n)) fill = "#cfe0ff";
            s += `<circle cx="${x}" cy="${y}" r="25" fill="${fill}" stroke="#1a3d6d" stroke-width="3"/>`;
        }
        s += `<text x="${x}" y="${y + 6}" text-anchor="middle" font-size="18" font-weight="bold" fill="${station ? "white" : "#1a3d6d"}">${n}</text></g>`;
        s += `<rect x="${x - NODE_NAMES[n].length * 3.6 - 4}" y="${y + 33}" width="${NODE_NAMES[n].length * 7.2 + 8}" height="18" rx="4" fill="white" opacity="0.8"/>`;
        s += `<text x="${x}" y="${y + 46}" text-anchor="middle" font-size="12" fill="#2c3e50">${NODE_NAMES[n]}</text>`;

        // priority badge
        if (zone[n]) {
            s += `<rect x="${x + 18}" y="${y - 34}" width="28" height="18" rx="4" fill="${PRIORITY_COLORS[zone[n]]}" stroke="white"/>
                <text x="${x + 32}" y="${y - 21}" text-anchor="middle" font-size="11" font-weight="bold" fill="white">P${zone[n]}</text>`;
        }

        // UAVs at this node
        c.uavs.filter(u => u.location === +n).forEach((u, i) => {
            const ux = x - 48 + (i % 5) * 24, uy = y - 45 - Math.floor(i / 5) * 24;
            s += `<g><title>UAV-${u.id} | ${u.status()} | Battery ${u.battery}%</title>
                <circle cx="${ux}" cy="${uy}" r="10" fill="${STATUS_COLORS[u.status()]}" stroke="white" stroke-width="2"/>
                <text x="${ux}" y="${uy + 4}" text-anchor="middle" font-size="10" font-weight="bold" fill="white">${u.id}</text></g>`;
        });
    }

    // start and target of selected route
    if (highlight.length > 1) {
        const [sx, sy] = P(highlight[0]), [ex, ey] = P(highlight[highlight.length - 1]);
        s += `<rect x="${sx - 88}" y="${sy - 10}" width="52" height="20" rx="4" fill="#2e9e44"/>
            <text x="${sx - 62}" y="${sy + 4}" text-anchor="middle" font-size="11" font-weight="bold" fill="white">START</text>`;
        s += `<rect x="${ex + 36}" y="${ey - 10}" width="58" height="20" rx="4" fill="#d62c2c"/>
            <text x="${ex + 65}" y="${ey + 4}" text-anchor="middle" font-size="11" font-weight="bold" fill="white">TARGET</text>`;
    }

    s += `<text x="15" y="28" font-size="20" font-weight="bold" fill="#1a3d6d">Disaster Area Map | ` +
         `${Object.keys(NODE_NAMES).length} locations, ${g.edgeList().length} routes, ${c.uavs.length} UAVs</text>`;

    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Arial">${s}</svg>`;
}

function mapLegend() {
    let html = '<p class="legend">';
    for (const st in STATUS_COLORS) html += `<span><i style="background:${STATUS_COLORS[st]}"></i>UAV ${st.toLowerCase()}</span>`;
    html += '<span><i style="background:#1a3d6d;border-radius:0"></i>Drone station</span>';
    html += '<span><i style="background:#d62c2c;height:3px;border-radius:0"></i>Blocked route (X)</span>';
    html += '<span><i style="background:#1f5fbf;height:5px;border-radius:0"></i>Selected route</span>';
    html += '<span><i style="background:#f4a6a6"></i>Active mission zone (P = priority)</span>';
    return html + "<br><em>Tip: move the mouse over a node, route or UAV for details.</em></p>";
}


// ---------------------------------------------------------------
// CHART HELPERS
// ---------------------------------------------------------------
function niceMax(v) {
    if (v <= 5) return 5;
    const step = Math.pow(10, Math.floor(Math.log10(v)));
    return Math.ceil(v / step) * step;
}

// common frame: title, y axis with grid lines, returns svg text
function chartFrame(W, H, title, yMax, yLabel, L, T, B) {
    let s = `<text x="${W / 2}" y="22" text-anchor="middle" font-size="16" font-weight="bold" fill="#1a3d6d">${title}</text>`;
    for (let i = 0; i <= 5; i++) {
        const y = T + (H - T - B) * (1 - i / 5);
        const v = Math.round(yMax * i / 5 * 10) / 10;
        s += `<line x1="${L}" y1="${y}" x2="${W - 15}" y2="${y}" stroke="#e3e8ef"/>`;
        s += `<text x="${L - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#555">${v}</text>`;
    }
    s += `<line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="#555"/>`;
    s += `<line x1="${L}" y1="${H - B}" x2="${W - 15}" y2="${H - B}" stroke="#555"/>`;
    s += `<text x="14" y="${(T + H - B) / 2}" font-size="12" fill="#333" transform="rotate(-90 14 ${(T + H - B) / 2})" text-anchor="middle">${yLabel}</text>`;
    return s;
}

function svgWrap(W, H, s) {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Arial">${s}</svg>`;
}

function legendRow(items, x, y) {
    let s = "";
    items.forEach(([name, col], i) => {
        s += `<rect x="${x + i * 110}" y="${y - 10}" width="12" height="12" fill="${col}"/>
              <text x="${x + i * 110 + 17}" y="${y}" font-size="12">${name}</text>`;
    });
    return s;
}

// simple bar chart. opt: {labels, values, colors, title, yLabel, yMax, refLine, refLabel, width}
function barChart(opt) {
    const W = opt.width || 1100, H = 380, L = 55, T = 40, B = 60;
    const yMax = opt.yMax || niceMax(Math.max(1, ...opt.values));
    let s = chartFrame(W, H, opt.title, yMax, opt.yLabel || "", L, T, B);
    const slot = (W - 15 - L) / opt.values.length, bw = slot * 0.65;
    opt.values.forEach((v, i) => {
        const h = (H - T - B) * v / yMax, x = L + i * slot + (slot - bw) / 2;
        const col = Array.isArray(opt.colors) ? opt.colors[i] : opt.colors;
        s += `<g><title>${esc(opt.labels[i])}: ${v}</title><rect x="${x}" y="${H - B - h}" width="${bw}" height="${h}" fill="${col}" rx="2"/></g>`;
        s += `<text x="${x + bw / 2}" y="${H - B - h - 4}" text-anchor="middle" font-size="10" fill="#333">${v}</text>`;
        s += `<text x="${x + bw / 2}" y="${H - B + 14}" text-anchor="end" font-size="11" transform="rotate(-45 ${x + bw / 2} ${H - B + 14})">${esc(opt.labels[i])}</text>`;
    });
    if (opt.refLine !== undefined) {
        const y = T + (H - T - B) * (1 - opt.refLine / yMax);
        s += `<line x1="${L}" y1="${y}" x2="${W - 15}" y2="${y}" stroke="#d62c2c" stroke-dasharray="6 4" stroke-width="2"/>
              <text x="${W - 20}" y="${y - 5}" text-anchor="end" font-size="12" fill="#d62c2c">${opt.refLabel}</text>`;
    }
    return svgWrap(W, H, s);
}

// stacked bar chart. opt: {labels, series:[{name, values, color}], title, yLabel, xLabel}
function stackedBarChart(opt) {
    const W = 560, H = 380, L = 50, T = 55, B = 50;
    const totals = opt.labels.map((_, i) => opt.series.reduce((t, sr) => t + sr.values[i], 0));
    const yMax = niceMax(Math.max(1, ...totals));
    let s = chartFrame(W, H, opt.title, yMax, opt.yLabel, L, T, B);
    s += legendRow(opt.series.map(sr => [sr.name, sr.color]), L + 10, 45);
    const slot = (W - 15 - L) / opt.labels.length, bw = slot * 0.6;
    opt.labels.forEach((lab, i) => {
        const x = L + i * slot + (slot - bw) / 2;
        let base = H - B;
        for (const sr of opt.series) {
            const h = (H - T - B) * sr.values[i] / yMax;
            if (h > 0) s += `<g><title>${sr.name}: ${sr.values[i]}</title><rect x="${x}" y="${base - h}" width="${bw}" height="${h}" fill="${sr.color}"/></g>`;
            base -= h;
        }
        s += `<text x="${x + bw / 2}" y="${H - B + 16}" text-anchor="middle" font-size="12">${lab}</text>`;
    });
    s += `<text x="${(W + L) / 2}" y="${H - 8}" text-anchor="middle" font-size="12">${opt.xLabel}</text>`;
    return svgWrap(W, H, s);
}

// pie chart. opt: {labels, values, colors, title}
function pieChart(opt) {
    const W = 420, H = 380, cx = 200, cy = 210, r = 130;
    const total = opt.values.reduce((a, b) => a + b, 0);
    let s = `<text x="${W / 2}" y="24" text-anchor="middle" font-size="16" font-weight="bold" fill="#1a3d6d">${opt.title}</text>`;
    if (total === 0) return svgWrap(W, H, s + `<text x="${cx}" y="${cy}" text-anchor="middle">No data</text>`);
    let ang = -Math.PI / 2;
    opt.values.forEach((v, i) => {
        if (v === 0) return;
        const a2 = ang + 2 * Math.PI * v / total;
        const pct = Math.round(100 * v / total);
        const tip = `<title>${esc(opt.labels[i])}: ${v} (${pct}%)</title>`;
        if (v === total) {
            s += `<g>${tip}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${opt.colors[i]}" stroke="white" stroke-width="2"/></g>`;
        } else {
            const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
            const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
            const large = a2 - ang > Math.PI ? 1 : 0;
            s += `<g>${tip}<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z" fill="${opt.colors[i]}" stroke="white" stroke-width="2"/></g>`;
        }
        const mid = (ang + a2) / 2;
        s += `<text x="${cx + r * 0.62 * Math.cos(mid)}" y="${cy + r * 0.62 * Math.sin(mid) + 5}" text-anchor="middle" font-size="13" font-weight="bold" fill="white">${pct}%</text>`;
        ang = a2;
    });
    opt.labels.forEach((lab, i) => {
        s += `<rect x="${cx + r + 18}" y="${110 + i * 22}" width="12" height="12" fill="${opt.colors[i]}"/>
              <text x="${cx + r + 35}" y="${121 + i * 22}" font-size="12">${esc(lab)} (${opt.values[i]})</text>`;
    });
    return svgWrap(W + 30, H, s);
}

// line chart. opt: {x, series:[{name, values, color, dash}], title, xLabel, yLabel, width}
function lineChart(opt) {
    const W = opt.width || 1100, H = 380, L = 55, T = 55, B = 50;
    const all = opt.series.flatMap(sr => sr.values);
    const yMax = opt.yMax || niceMax(Math.max(1, ...all));
    let s = chartFrame(W, H, opt.title, yMax, opt.yLabel, L, T, B);
    s += legendRow(opt.series.map(sr => [sr.name, sr.color]), L + 10, 45);
    const n = opt.x.length;
    const px = i => L + 10 + (W - 40 - L) * (n === 1 ? 0 : i / (n - 1));
    const py = v => T + (H - T - B) * (1 - v / yMax);
    for (const sr of opt.series) {
        const pts = sr.values.map((v, i) => `${px(i)},${py(v)}`).join(" ");
        s += `<polyline points="${pts}" fill="none" stroke="${sr.color}" stroke-width="2.5" ${sr.dash ? 'stroke-dasharray="7 5"' : ""}/>`;
        sr.values.forEach((v, i) => {
            s += `<g><title>${sr.name} at step ${opt.x[i]}: ${v}</title><circle cx="${px(i)}" cy="${py(v)}" r="3.5" fill="${sr.color}"/></g>`;
        });
    }
    const every = Math.max(1, Math.ceil(n / 20));
    opt.x.forEach((x, i) => {
        if (i % every === 0) s += `<text x="${px(i)}" y="${H - B + 16}" text-anchor="middle" font-size="11">${x}</text>`;
    });
    s += `<text x="${(W + L) / 2}" y="${H - 8}" text-anchor="middle" font-size="12">${opt.xLabel}</text>`;
    return svgWrap(W, H, s);
}
