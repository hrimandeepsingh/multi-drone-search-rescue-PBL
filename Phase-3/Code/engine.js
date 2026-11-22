// engine.js
// Multi-UAV Search & Rescue System - simulation engine (JavaScript version)
// Same logic as engine.py / main.cpp, so the offline website works without Python.

const BATTERY_PER_COST = 10;       // 10% battery per unit of route cost
const LOW_BATTERY_LIMIT = 20;      // UAV with battery <= 20% cannot take missions
const AUTO_DISPATCH_PRIORITY = 4;  // priority >= 4 is allocated as soon as it arrives

const NODE_NAMES = {
    1: "Base Camp", 2: "City Hospital", 3: "School", 4: "Market",
    5: "River Bridge", 6: "Village A", 7: "Riverside Colony", 8: "Hill Top",
    9: "Factory Area", 10: "Railway Station", 11: "Village B", 12: "Dam Site"
};

// x, y position of each node (only used for drawing the map)
const NODE_POS = {
    1: [0, 3], 2: [2, 5], 3: [2, 1], 4: [4, 3], 5: [5, 0.5], 6: [6.5, 2.5],
    7: [8, 1], 8: [7, -1.2], 9: [3.5, 7], 10: [6, 5.5], 11: [8.5, 4.5], 12: [10.5, 2]
};

const EDGES = [
    [1, 2, 4], [1, 3, 3], [2, 4, 2], [3, 4, 1],
    [3, 5, 5], [4, 5, 2], [4, 6, 4], [5, 6, 1],       // original 6-node graph
    [6, 7, 2], [5, 8, 3], [7, 8, 2], [2, 9, 3],
    [9, 10, 2], [4, 10, 3], [10, 11, 2], [6, 10, 3],
    [7, 11, 3], [11, 12, 2], [8, 12, 4], [7, 12, 3]   // extended area
];

// 20 UAVs at 4 drone stations: Base Camp(1), Market(4), Railway Station(10), Riverside Colony(7)
const FLEET = [
    ["A", 1, 100], ["B", 1, 90], ["C", 1, 85], ["D", 1, 95], ["E", 1, 70],
    ["F", 4, 90], ["G", 4, 75], ["H", 4, 60], ["I", 4, 95], ["J", 4, 85],
    ["K", 10, 65], ["L", 10, 80], ["M", 10, 90], ["N", 10, 100], ["O", 10, 55],
    ["P", 7, 75], ["Q", 7, 90], ["R", 7, 80], ["S", 7, 45], ["T", 7, 95]
];

const MISSION_TYPES = ["Search", "Medical Supply", "Food Drop", "Survivor Rescue",
                       "Surveillance", "Fire Check", "Flood Survey"];


// ---------------------------------------------------------------
// BINARY HEAP (min-heap on tuples, same idea as Python heapq)
// Missions are stored as [-priority, seq, id] so the top is the highest priority.
// ---------------------------------------------------------------
function compareTuple(a, b) {
    for (let i = 0; i < a.length; i++) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
    }
    return 0;
}

class MinHeap {
    constructor(items) {
        this.a = items || [];
    }
    size() { return this.a.length; }
    peek() { return this.a[0]; }

    push(item) {
        const a = this.a;
        a.push(item);
        let i = a.length - 1;
        while (i > 0) {                               // sift up
            const parent = Math.floor((i - 1) / 2);
            if (compareTuple(a[i], a[parent]) >= 0) break;
            [a[i], a[parent]] = [a[parent], a[i]];
            i = parent;
        }
    }

    pop() {
        const a = this.a;
        const top = a[0];
        const last = a.pop();
        if (a.length > 0) {
            a[0] = last;
            let i = 0;
            while (true) {                            // sift down
                const l = 2 * i + 1, r = 2 * i + 2;
                let small = i;
                if (l < a.length && compareTuple(a[l], a[small]) < 0) small = l;
                if (r < a.length && compareTuple(a[r], a[small]) < 0) small = r;
                if (small === i) break;
                [a[i], a[small]] = [a[small], a[i]];
                i = small;
            }
        }
        return top;
    }
}


// ---------------------------------------------------------------
// UAV CLASS
// ---------------------------------------------------------------
class UAV {
    constructor(id, location, battery) {
        this.id = id;
        this.location = location;
        this.battery = battery;
        this.busy = false;
        this.failed = false;
        this.missionsDone = 0;
        this.totalDistance = 0;
    }

    isAvailable() {
        return !this.busy && !this.failed && this.battery > LOW_BATTERY_LIMIT;
    }

    status() {
        if (this.failed) return "FAILED";
        if (this.busy) return "BUSY";
        if (this.battery <= LOW_BATTERY_LIMIT) return "LOW BATTERY";
        return "AVAILABLE";
    }

    reduceBattery(amount) { this.battery = Math.max(0, this.battery - amount); }
    setBattery(value) { this.battery = Math.max(0, Math.min(100, value)); }
}


// ---------------------------------------------------------------
// MISSION CLASS
// ---------------------------------------------------------------
class Mission {
    constructor(id, destination, priority, type, seq, step) {
        this.id = id;
        this.destination = destination;
        this.priority = priority;
        this.type = type;
        this.seq = seq;                 // arrival number, used for tie breaking
        this.status = "Pending";
        this.assignedUAV = "None";
        this.route = [];
        this.cost = 0;
        this.batteryUsed = 0;
        this.createdStep = step;
        this.assignedStep = null;
        this.completedStep = null;
        this.reassignCount = 0;
    }

    resetToPending() {
        this.status = "Pending";
        this.assignedUAV = "None";
        this.route = [];
        this.cost = 0;
        this.batteryUsed = 0;
        this.reassignCount++;
    }
}


// ---------------------------------------------------------------
// GRAPH CLASS (adjacency list + blocked flags)
// ---------------------------------------------------------------
class Graph {
    constructor(vertices) {
        this.vertices = vertices;
        this.adj = {};
        for (let i = 1; i <= vertices; i++) this.adj[i] = [];
        this.blocked = [];              // list of "u-v" keys with u < v
    }

    key(u, v) { return Math.min(u, v) + "-" + Math.max(u, v); }

    addEdge(u, v, w) {
        if (u < 1 || u > this.vertices || v < 1 || v > this.vertices || w < 0) return;
        this.adj[u].push([v, w]);
        this.adj[v].push([u, w]);
    }

    edgeList() {
        const edges = [];
        for (let u = 1; u <= this.vertices; u++)
            for (const [v, w] of this.adj[u])
                if (u < v) edges.push([u, v, w]);
        return edges;
    }

    edgeExists(u, v) { return (this.adj[u] || []).some(e => e[0] === v); }
    isBlocked(u, v) { return this.blocked.includes(this.key(u, v)); }

    blockRoute(u, v) {
        if (!this.edgeExists(u, v)) return false;
        if (!this.isBlocked(u, v)) this.blocked.push(this.key(u, v));
        return true;
    }

    unblockRoute(u, v) {
        const i = this.blocked.indexOf(this.key(u, v));
        if (i === -1) return false;
        this.blocked.splice(i, 1);
        return true;
    }

    // returns {reachable, order}
    bfs(start, destination) {
        const visited = new Set([start]);
        const order = [];
        const q = [start];
        while (q.length) {
            const cur = q.shift();
            order.push(cur);
            if (cur === destination) return { reachable: true, order };
            for (const [nxt] of this.adj[cur]) {
                if (!visited.has(nxt) && !this.isBlocked(cur, nxt)) {
                    visited.add(nxt);
                    q.push(nxt);
                }
            }
        }
        return { reachable: false, order };
    }

    // distance and parent of every node from source
    dijkstraAll(source) {
        const dist = {}, parent = {};
        for (let i = 1; i <= this.vertices; i++) { dist[i] = Infinity; parent[i] = -1; }
        dist[source] = 0;
        const pq = new MinHeap([[0, source]]);
        while (pq.size()) {
            const [d, cur] = pq.pop();
            if (d !== dist[cur]) continue;
            for (const [nxt, w] of this.adj[cur]) {
                if (this.isBlocked(cur, nxt)) continue;
                if (dist[cur] + w < dist[nxt]) {
                    dist[nxt] = dist[cur] + w;
                    parent[nxt] = cur;
                    pq.push([dist[nxt], nxt]);
                }
            }
        }
        return { dist, parent };
    }

    // returns {cost, path}, cost = -1 if no route
    dijkstra(source, destination) {
        const { dist, parent } = this.dijkstraAll(source);
        if (dist[destination] === Infinity) return { cost: -1, path: [] };
        const path = [];
        for (let cur = destination; cur !== -1; cur = parent[cur]) path.push(cur);
        path.reverse();
        return { cost: dist[destination], path };
    }
}


// ---------------------------------------------------------------
// COORDINATOR CLASS
// ---------------------------------------------------------------
class Coordinator {
    constructor() { this.reset(); }

    reset() {
        this.graph = new Graph(Object.keys(NODE_NAMES).length);
        for (const [u, v, w] of EDGES) this.graph.addEdge(u, v, w);
        this.uavs = FLEET.map(([id, loc, b]) => new UAV(id, loc, b));
        this.missions = [];
        this.queue = new MinHeap();     // heap of [-priority, seq, missionId]
        this.seq = 0;
        this.step = 0;                  // simulation step (increases at each event)
        this.log = [];                  // [step, tag, message]
        this.history = [];              // numbers after every step (for charts)
        this.lastRoute = [];
        this.addLog("SYSTEM", `Simulation started with ${Object.keys(NODE_NAMES).length} nodes, ` +
                    `${EDGES.length} edges and ${this.uavs.length} UAVs.`);
        this.saveHistory();
    }

    // ----- save / load (browser localStorage) -----
    toJSON() {
        return {
            uavs: this.uavs, missions: this.missions, queue: this.queue.a, seq: this.seq,
            step: this.step, log: this.log, history: this.history, lastRoute: this.lastRoute,
            blocked: this.graph.blocked
        };
    }

    static fromJSON(data) {
        const c = new Coordinator();
        c.uavs = data.uavs.map(u => Object.assign(new UAV(), u));
        c.missions = data.missions.map(m => Object.assign(new Mission(), m));
        c.queue = new MinHeap(data.queue);
        c.graph.blocked = data.blocked;
        c.seq = data.seq;
        c.step = data.step;
        c.log = data.log;
        c.history = data.history;
        c.lastRoute = data.lastRoute;
        return c;
    }

    // ----- helpers -----
    addLog(tag, msg) { this.log.push([this.step, tag, msg]); }
    nextStep() { this.step++; }

    saveHistory() {
        const count = s => this.missions.filter(m => m.status === s).length;
        const avg = this.uavs.reduce((t, u) => t + u.battery, 0) / this.uavs.length;
        this.history.push({
            step: this.step, pending: count("Pending"), assigned: count("Assigned"),
            completed: count("Completed"),
            availableUavs: this.uavs.filter(u => u.isAvailable()).length,
            avgBattery: Math.round(avg * 10) / 10
        });
    }

    findUAV(id) { return this.uavs.find(u => u.id === id) || null; }
    findMission(id) { return this.missions.find(m => m.id === id) || null; }

    // priority queue contents in the order they will be served
    queueView() {
        return [...this.queue.a].sort(compareTuple)
            .map(([, , id]) => this.findMission(id))
            .filter(m => m && m.status === "Pending");
    }

    // ----- core: choose best UAV -----
    // eligible = available AND reachable AND battery >= 10 x cost
    // choose lowest cost, tie -> higher battery
    findBestUAV(destination) {
        let best = null, bestCost = 0, bestRoute = [];
        for (const u of this.uavs) {
            if (!u.isAvailable()) continue;
            const { cost, path } = this.graph.dijkstra(u.location, destination);
            if (cost === -1) continue;
            if (u.battery < cost * BATTERY_PER_COST) continue;
            if (best === null || cost < bestCost || (cost === bestCost && u.battery > best.battery)) {
                best = u; bestCost = cost; bestRoute = path;
            }
        }
        return { uav: best, cost: bestCost, route: bestRoute };
    }

    // Pop missions from the priority queue (highest priority first) and assign.
    // Default: only high priority missions (auto-dispatch).
    // minPriority = 1: every pending mission (batch processing).
    autoAssign(minPriority = AUTO_DISPATCH_PRIORITY) {
        const waiting = [];
        let assignedNow = 0;
        // heap top always has the highest priority, so stop as soon as it is too low
        while (this.queue.size() && -this.queue.peek()[0] >= minPriority) {
            const item = this.queue.pop();
            const m = this.findMission(item[2]);
            if (!m || m.status !== "Pending") continue;
            const { uav, cost, route } = this.findBestUAV(m.destination);
            if (!uav) {
                this.addLog("PENDING", `${m.id} (P${m.priority}) waiting - no suitable UAV available.`);
                waiting.push(item);
                continue;
            }
            const used = cost * BATTERY_PER_COST;
            uav.reduceBattery(used);
            uav.busy = true;
            uav.totalDistance += cost;
            m.status = "Assigned";
            m.assignedUAV = uav.id;
            m.route = route;
            m.cost = cost;
            m.batteryUsed = used;
            m.assignedStep = this.step;
            this.lastRoute = route;
            assignedNow++;
            const tag = m.priority >= AUTO_DISPATCH_PRIORITY ? "AUTO-DISPATCH" : "ASSIGN";
            this.addLog(tag, `${m.id} (P${m.priority}, ${m.type}) -> UAV-${uav.id} | Route ${route.join(" -> ")} ` +
                        `| Cost ${cost} | Battery used ${used}%, left ${uav.battery}%`);
        }
        for (const item of waiting) this.queue.push(item);
        return assignedNow;
    }

    // ----- user actions / events (each returns [ok, message]) -----
    addMission(id, dest, priority, type) {
        if (!id) return [false, "Mission ID cannot be empty."];
        if (this.findMission(id)) return [false, "Mission ID already exists. Please use a unique ID."];
        if (!NODE_NAMES[dest]) return [false, "Invalid destination node."];
        if (priority < 1 || priority > 5) return [false, "Priority must be between 1 and 5."];
        this.nextStep();
        this.seq++;
        const m = new Mission(id, dest, priority, type || "General", this.seq, this.step);
        this.missions.push(m);
        this.queue.push([-priority, this.seq, id]);
        this.addLog(priority === 5 ? "URGENT" : "MISSION",
                    `Mission ${id} added | Node ${dest} (${NODE_NAMES[dest]}) | Priority ${priority} | Type ${m.type}`);
        this.autoAssign();
        this.saveHistory();
        if (m.status === "Assigned")
            return [true, `Mission ${id} auto-dispatched to UAV-${m.assignedUAV} (high priority).`];
        if (priority >= AUTO_DISPATCH_PRIORITY)
            return [true, `Mission ${id} is high priority but no UAV is free - waiting at top of queue.`];
        return [true, `Mission ${id} added to priority queue. Click 'Process Pending Missions' to allocate.`];
    }

    processMissions() {
        this.nextStep();
        this.addLog("MENU", "Processing all pending missions (every priority level)...");
        const n = this.autoAssign(1);
        this.saveHistory();
        return [true, `${n} mission(s) assigned.`];
    }

    completeMission(id) {
        const m = this.findMission(id);
        if (!m) return [false, "Mission not found."];
        if (m.status !== "Assigned") return [false, "Mission is not currently assigned."];
        this.nextStep();
        m.status = "Completed";
        m.completedStep = this.step;
        const uav = this.findUAV(m.assignedUAV);
        if (uav) {
            uav.location = m.destination;
            uav.busy = false;
            uav.missionsDone++;
        }
        this.addLog("DONE", `Mission ${id} completed. UAV-${m.assignedUAV} now at node ${m.destination}.`);
        this.autoAssign();
        this.saveHistory();
        return [true, `Mission ${id} completed.`];
    }

    completeAll() {
        const ids = this.missions.filter(m => m.status === "Assigned").map(m => m.id);
        for (const id of ids) this.completeMission(id);
        return [true, `${ids.length} mission(s) completed.`];
    }

    lowBatteryEvent(id, value) {
        const uav = this.findUAV(id);
        if (!uav) return [false, "UAV not found."];
        if (isNaN(value) || value < 0 || value > 100) return [false, "Invalid battery value."];
        this.nextStep();
        uav.setBattery(value);
        this.addLog("EVENT", `UAV-${id} battery changed to ${value}%.`);
        if (value <= LOW_BATTERY_LIMIT) this.addLog("WARNING", `UAV-${id} entered LOW BATTERY state.`);
        this.autoAssign();
        this.saveHistory();
        return [true, `Battery of UAV-${id} set to ${value}%.`];
    }

    recharge(id) {
        const uav = this.findUAV(id);
        if (!uav) return [false, "UAV not found."];
        this.nextStep();
        uav.battery = 100;
        this.addLog("RECHARGE", `UAV-${id} recharged to 100%.`);
        this.autoAssign();
        this.saveHistory();
        return [true, `UAV-${id} recharged.`];
    }

    failureEvent(id) {
        const uav = this.findUAV(id);
        if (!uav) return [false, "UAV not found."];
        if (uav.failed) return [false, `UAV-${id} has already failed.`];
        this.nextStep();
        uav.failed = true;
        uav.busy = false;
        this.addLog("EVENT", `UAV-${id} has FAILED.`);
        for (const m of this.missions) {
            if (m.assignedUAV === id && m.status === "Assigned") {
                this.addLog("ALERT", `Mission ${m.id} affected by UAV failure - returned to priority queue.`);
                m.resetToPending();
                this.queue.push([-m.priority, m.seq, m.id]);
            }
        }
        this.autoAssign();
        this.saveHistory();
        return [true, `UAV-${id} failed. Affected missions re-planned.`];
    }

    repair(id) {
        const uav = this.findUAV(id);
        if (!uav || !uav.failed) return [false, "UAV is not in failed state."];
        this.nextStep();
        uav.failed = false;
        this.addLog("REPAIR", `UAV-${id} repaired and back in fleet.`);
        this.autoAssign();
        this.saveHistory();
        return [true, `UAV-${id} repaired.`];
    }

    addUAV(id, location, battery) {
        if (!id || this.findUAV(id)) return [false, "UAV ID empty or already exists."];
        if (!NODE_NAMES[location] || isNaN(battery) || battery < 0 || battery > 100)
            return [false, "Invalid location or battery."];
        this.nextStep();
        this.uavs.push(new UAV(id, location, battery));
        this.addLog("SYSTEM", `New UAV-${id} added at node ${location} with ${battery}% battery.`);
        this.autoAssign();
        this.saveHistory();
        return [true, `UAV-${id} added to fleet.`];
    }

    blockRoute(u, v) {
        if (this.graph.isBlocked(u, v)) return [false, "Route already blocked."];
        if (!this.graph.blockRoute(u, v)) return [false, "That route does not exist in the graph."];
        this.nextStep();
        this.addLog("EVENT", `Route ${u} <-> ${v} has been BLOCKED. Future planning ignores this edge.`);
        this.autoAssign();
        this.saveHistory();
        return [true, `Route ${u} <-> ${v} blocked.`];
    }

    unblockRoute(u, v) {
        if (!this.graph.unblockRoute(u, v)) return [false, "Route was not blocked."];
        this.nextStep();
        this.addLog("EVENT", `Route ${u} <-> ${v} is OPEN again.`);
        this.autoAssign();
        this.saveHistory();
        return [true, `Route ${u} <-> ${v} opened.`];
    }

    // sample missions: high priority ones get auto-dispatched, others wait in queue
    loadDemo() {
        const demo = [["M-101", 6, 5, "Survivor Rescue"], ["M-102", 3, 3, "Medical Supply"],
                      ["M-103", 5, 2, "Food Drop"], ["M-104", 12, 4, "Flood Survey"],
                      ["M-105", 8, 1, "Surveillance"], ["M-106", 11, 5, "Survivor Rescue"],
                      ["M-107", 9, 3, "Fire Check"], ["M-108", 2, 2, "Search"]];
        let added = 0;
        for (const [id, d, p, t] of demo) if (this.addMission(id, d, p, t)[0]) added++;
        return [true, `${added} demo missions loaded. High priority (4-5) auto-dispatched, rest waiting in queue.`];
    }
}
