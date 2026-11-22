// common.js
// Code shared by every page: saving the simulation, header + menu, messages, small helpers.
// The simulation is saved in the browser (localStorage) so all pages see the same data,
// just like the Flask server keeps one simulation for all pages.

const SAVE_KEY = "multi_uav_sar_state";

function loadCoordinator() {
    let data = null;
    try {
        const saved = localStorage.getItem(SAVE_KEY);
        if (saved) data = JSON.parse(saved);
    } catch (e) { /* localStorage not allowed */ }

    // backup copy kept in window.name (works even if a browser blocks localStorage for files)
    try {
        if (window.name.startsWith("{")) {
            const backup = JSON.parse(window.name);
            if (!data || backup.savedAt > data.savedAt) data = backup;
        }
    } catch (e) { /* ignore */ }

    if (data && data.state) {
        try { return Coordinator.fromJSON(data.state); } catch (e) { /* old or broken data */ }
    }
    return new Coordinator();
}

function saveCoordinator() {
    const text = JSON.stringify({ savedAt: Date.now(), state: coord.toJSON() });
    try { localStorage.setItem(SAVE_KEY, text); } catch (e) { /* ignore */ }
    window.name = text;
}

const coord = loadCoordinator();


// ---------- header and menu ----------
const PAGES = [
    ["index.html", "Home"],
    ["dashboard.html", "Dashboard"],
    ["missions.html", "Missions &amp; Queue"],
    ["fleet.html", "UAV Fleet"],
    ["routes.html", "Graph &amp; Routes"],
    ["analytics.html", "Analytics"],
    ["log.html", "Event Log"],
    ["code.html", "Source Code"],
    ["about.html", "About"]
];

function drawHeader() {
    const current = location.pathname.split("/").pop() || "index.html";
    let nav = "";
    for (const [file, name] of PAGES)
        nav += `<a href="${file}" class="${file === current ? "active" : ""}">${name}</a>`;

    document.getElementById("header").innerHTML = `
        <header>
            <h1>Multi-UAV Search &amp; Rescue System</h1>
            <p>Dynamic Disaster Response using Graph-Based Path Planning and Priority Task Allocation</p>
        </header>
        <nav>${nav}<span class="step">Simulation Step: <span id="stepNo">${coord.step}</span></span></nav>`;

    document.getElementById("footer").innerHTML =
        "<footer>Multi-UAV Search &amp; Rescue System - Offline Version (HTML, CSS, JavaScript)</footer>";
}


// ---------- after every action ----------
// result = [ok, message] returned by the Coordinator
function done(result) {
    saveCoordinator();
    showMessage(result[0], result[1]);
    document.getElementById("stepNo").textContent = coord.step;
    if (typeof render === "function") render();     // every page has its own render()
    return false;                                   // stop the form from reloading the page
}

function showMessage(ok, msg) {
    const box = document.getElementById("message");
    box.innerHTML = `<div class="flash ${ok ? "ok" : "error"}">${msg}</div>`;
    window.scrollTo(0, 0);
}

function resetSimulation() {
    if (!confirm("Reset whole simulation?")) return;
    coord.reset();
    done([true, "Simulation reset to starting state."]);
}


// ---------- small helpers ----------
function val(id) { return document.getElementById(id).value.trim(); }
function num(id) { return parseInt(document.getElementById(id).value, 10); }
function setHTML(id, html) { document.getElementById(id).innerHTML = html; }

function nodeOptions(selected) {
    let html = "";
    for (const n in NODE_NAMES)
        html += `<option value="${n}" ${+n === selected ? "selected" : ""}>${n} - ${NODE_NAMES[n]}</option>`;
    return html;
}

function typeOptions() {
    return MISSION_TYPES.map(t => `<option>${t}</option>`).join("");
}

function logHTML(entries) {
    return entries.map(([s, tag, msg]) =>
        `<div>[${s}] <span class="tag ${tag}">[${tag}]</span> ${msg}</div>`).join("");
}

function statusBadge(status) {
    return `<span class="status ${status.split(" ")[0]}">${status}</span>`;
}

document.addEventListener("DOMContentLoaded", drawHeader);
