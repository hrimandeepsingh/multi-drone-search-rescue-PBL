# engine.py
# Multi-UAV Search & Rescue System - simulation engine
# This is the Python version of our C++ code (Graph, UAV, Mission, Coordinator).
# Same logic as the C++ program so that the website shows the same results.

import heapq

BATTERY_PER_COST = 10     # 10% battery used per unit of route cost (same as C++)
LOW_BATTERY_LIMIT = 20    # UAV with battery <= 20% cannot take missions
AUTO_DISPATCH_PRIORITY = 4  # missions with priority >= 4 are auto-allocated as soon as they arrive


# ---------------------------------------------------------------
# DISASTER AREA (12 nodes)
# Nodes 1-6 and their 8 edges are SAME as Phase-II report,
# nodes 7-12 are the extended area.
# ---------------------------------------------------------------
NODE_NAMES = {
    1: "Base Camp",
    2: "City Hospital",
    3: "School",
    4: "Market",
    5: "River Bridge",
    6: "Village A",
    7: "Riverside Colony",
    8: "Hill Top",
    9: "Factory Area",
    10: "Railway Station",
    11: "Village B",
    12: "Dam Site",
}

# x, y position of each node (only used for drawing the map)
NODE_POS = {
    1: (0, 3), 2: (2, 5), 3: (2, 1), 4: (4, 3), 5: (5, 0.5), 6: (6.5, 2.5),
    7: (8, 1), 8: (7, -1.2), 9: (3.5, 7), 10: (6, 5.5), 11: (8.5, 4.5), 12: (10.5, 2),
}

EDGES = [
    (1, 2, 4), (1, 3, 3), (2, 4, 2), (3, 4, 1),
    (3, 5, 5), (4, 5, 2), (4, 6, 4), (5, 6, 1),       # original 6-node graph
    (6, 7, 2), (5, 8, 3), (7, 8, 2), (2, 9, 3),
    (9, 10, 2), (4, 10, 3), (10, 11, 2), (6, 10, 3),
    (7, 11, 3), (11, 12, 2), (8, 12, 4), (7, 12, 3),  # extended area
]

# 20 UAVs: (id, start node, battery)
# UAVs start from 4 drone stations: Base Camp(1), Market(4), Railway Station(10), Riverside Colony(7)
FLEET = [
    ("A", 1, 100), ("B", 1, 90), ("C", 1, 85), ("D", 1, 95), ("E", 1, 70),
    ("F", 4, 90), ("G", 4, 75), ("H", 4, 60), ("I", 4, 95), ("J", 4, 85),
    ("K", 10, 65), ("L", 10, 80), ("M", 10, 90), ("N", 10, 100), ("O", 10, 55),
    ("P", 7, 75), ("Q", 7, 90), ("R", 7, 80), ("S", 7, 45), ("T", 7, 95),
]

MISSION_TYPES = ["Search", "Medical Supply", "Food Drop", "Survivor Rescue",
                 "Surveillance", "Fire Check", "Flood Survey"]


# ---------------------------------------------------------------
# UAV CLASS
# ---------------------------------------------------------------
class UAV:
    def __init__(self, uid, location, battery):
        self.id = uid
        self.location = location
        self.start_location = location
        self.battery = battery
        self.busy = False
        self.failed = False
        self.missions_done = 0
        self.total_distance = 0

    def is_available(self):
        return (not self.busy) and (not self.failed) and self.battery > LOW_BATTERY_LIMIT

    def status(self):
        if self.failed:
            return "FAILED"
        if self.busy:
            return "BUSY"
        if self.battery <= LOW_BATTERY_LIMIT:
            return "LOW BATTERY"
        return "AVAILABLE"

    def reduce_battery(self, amount):
        self.battery = max(0, self.battery - amount)

    def set_battery(self, value):
        self.battery = max(0, min(100, value))


# ---------------------------------------------------------------
# MISSION CLASS
# ---------------------------------------------------------------
class Mission:
    def __init__(self, mid, destination, priority, mtype, seq, step):
        self.id = mid
        self.destination = destination
        self.priority = priority
        self.type = mtype
        self.seq = seq                # arrival number, used for tie breaking
        self.status = "Pending"
        self.assigned_uav = "None"
        self.route = []
        self.cost = 0
        self.battery_used = 0
        self.created_step = step
        self.assigned_step = None
        self.completed_step = None
        self.reassign_count = 0

    def reset_to_pending(self):
        self.status = "Pending"
        self.assigned_uav = "None"
        self.route = []
        self.cost = 0
        self.battery_used = 0
        self.reassign_count += 1


# ---------------------------------------------------------------
# GRAPH CLASS (adjacency list + blocked flags)
# ---------------------------------------------------------------
class Graph:
    def __init__(self, vertices):
        self.vertices = vertices
        self.adj = {i: [] for i in range(1, vertices + 1)}
        self.blocked = set()          # stores (min(u,v), max(u,v))

    def add_edge(self, u, v, w):
        if u < 1 or u > self.vertices or v < 1 or v > self.vertices or w < 0:
            return
        self.adj[u].append((v, w))
        self.adj[v].append((u, w))

    def edge_list(self):
        edges = []
        for u in self.adj:
            for v, w in self.adj[u]:
                if u < v:
                    edges.append((u, v, w))
        return edges

    def edge_exists(self, u, v):
        return any(n == v for n, _ in self.adj.get(u, []))

    def is_blocked(self, u, v):
        return (min(u, v), max(u, v)) in self.blocked

    def block_route(self, u, v):
        if not self.edge_exists(u, v):
            return False
        self.blocked.add((min(u, v), max(u, v)))
        return True

    def unblock_route(self, u, v):
        key = (min(u, v), max(u, v))
        if key in self.blocked:
            self.blocked.remove(key)
            return True
        return False

    def bfs(self, start, destination):
        """Returns (reachable, visit_order)"""
        visited = {start}
        order = []
        q = [start]
        while q:
            cur = q.pop(0)
            order.append(cur)
            if cur == destination:
                return True, order
            for nxt, _ in self.adj[cur]:
                if nxt not in visited and not self.is_blocked(cur, nxt):
                    visited.add(nxt)
                    q.append(nxt)
        return False, order

    def dijkstra_all(self, source):
        """Returns distance and parent dictionaries from source"""
        INF = float("inf")
        dist = {i: INF for i in self.adj}
        parent = {i: -1 for i in self.adj}
        dist[source] = 0
        pq = [(0, source)]                     # min-heap
        while pq:
            d, cur = heapq.heappop(pq)
            if d != dist[cur]:
                continue
            for nxt, w in self.adj[cur]:
                if self.is_blocked(cur, nxt):
                    continue
                if dist[cur] + w < dist[nxt]:
                    dist[nxt] = dist[cur] + w
                    parent[nxt] = cur
                    heapq.heappush(pq, (dist[nxt], nxt))
        return dist, parent

    def dijkstra(self, source, destination):
        """Returns (cost, path). cost = -1 if no route"""
        dist, parent = self.dijkstra_all(source)
        if dist[destination] == float("inf"):
            return -1, []
        path = []
        cur = destination
        while cur != -1:
            path.append(cur)
            cur = parent[cur]
        path.reverse()
        return dist[destination], path


# ---------------------------------------------------------------
# COORDINATOR CLASS
# ---------------------------------------------------------------
class Coordinator:
    def __init__(self):
        self.reset()

    def reset(self):
        self.graph = Graph(len(NODE_NAMES))
        for u, v, w in EDGES:
            self.graph.add_edge(u, v, w)
        self.uavs = [UAV(i, loc, b) for i, loc, b in FLEET]
        self.missions = []
        self.queue = []          # heap of (-priority, seq, mission_id)
        self.seq = 0
        self.step = 0            # simulation time step (increases at each event)
        self.log = []            # event log [(step, tag, message)]
        self.history = []        # snapshot of numbers after every step (for charts)
        self.last_route = []
        self.add_log("SYSTEM", "Simulation started with %d nodes, %d edges and %d UAVs."
                     % (len(NODE_NAMES), len(EDGES), len(self.uavs)))
        self.save_history()

    # ----- helpers -----
    def add_log(self, tag, msg):
        self.log.append((self.step, tag, msg))

    def next_step(self):
        self.step += 1

    def save_history(self):
        self.history.append({
            "step": self.step,
            "pending": sum(m.status == "Pending" for m in self.missions),
            "assigned": sum(m.status == "Assigned" for m in self.missions),
            "completed": sum(m.status == "Completed" for m in self.missions),
            "available_uavs": sum(u.is_available() for u in self.uavs),
            "avg_battery": round(sum(u.battery for u in self.uavs) / len(self.uavs), 1),
        })

    def find_uav(self, uid):
        for u in self.uavs:
            if u.id == uid:
                return u
        return None

    def find_mission(self, mid):
        for m in self.missions:
            if m.id == mid:
                return m
        return None

    def queue_view(self):
        """Priority queue contents in the order they will be served"""
        result = []
        for negp, seq, mid in sorted(self.queue):
            m = self.find_mission(mid)
            if m and m.status == "Pending":
                result.append((len(result) + 1, m))
        return result

    def heap_array(self):
        """Raw heap array (how the binary heap stores it internally)"""
        return [(-p, s, mid) for p, s, mid in self.queue]

    # ----- core: choose best UAV -----
    def find_best_uav(self, destination):
        """Eligible = available AND reachable AND battery >= 10 x cost.
        Choose lowest cost, tie -> higher battery."""
        best, best_cost, best_route = None, None, []
        checked = []
        for u in self.uavs:
            if not u.is_available():
                checked.append((u.id, "-", "not available (" + u.status() + ")"))
                continue
            cost, path = self.graph.dijkstra(u.location, destination)
            if cost == -1:
                checked.append((u.id, "-", "no route"))
                continue
            need = cost * BATTERY_PER_COST
            if u.battery < need:
                checked.append((u.id, cost, "battery %d%% < needed %d%%" % (u.battery, need)))
                continue
            checked.append((u.id, cost, "eligible"))
            if best is None or cost < best_cost or (cost == best_cost and u.battery > best.battery):
                best, best_cost, best_route = u, cost, path
        return best, best_cost, best_route, checked

    def auto_assign(self, min_priority=AUTO_DISPATCH_PRIORITY):
        """Pop missions from the priority queue (highest priority first) and assign.
        By default only high priority missions (>= AUTO_DISPATCH_PRIORITY) are taken,
        they are dispatched automatically after every event. Lower priority missions
        stay in the queue until "Process Pending Missions" (min_priority = 1)."""
        waiting = []
        assigned_now = 0
        # heap top always has the highest priority, so we can stop as soon as it is too low
        while self.queue and -self.queue[0][0] >= min_priority:
            negp, seq, mid = heapq.heappop(self.queue)
            m = self.find_mission(mid)
            if m is None or m.status != "Pending":
                continue
            uav, cost, route, _ = self.find_best_uav(m.destination)
            if uav is None:
                self.add_log("PENDING", "%s (P%d) waiting - no suitable UAV available." % (m.id, m.priority))
                waiting.append((negp, seq, mid))
                continue
            used = cost * BATTERY_PER_COST
            uav.reduce_battery(used)
            uav.busy = True
            uav.total_distance += cost
            m.status = "Assigned"
            m.assigned_uav = uav.id
            m.route = route
            m.cost = cost
            m.battery_used = used
            m.assigned_step = self.step
            self.last_route = route
            assigned_now += 1
            tag = "AUTO-DISPATCH" if m.priority >= AUTO_DISPATCH_PRIORITY else "ASSIGN"
            self.add_log(tag, "%s (P%d, %s) -> UAV-%s | Route %s | Cost %d | Battery used %d%%, left %d%%"
                         % (m.id, m.priority, m.type, uav.id, " -> ".join(map(str, route)),
                            cost, used, uav.battery))
        for item in waiting:
            heapq.heappush(self.queue, item)
        return assigned_now

    # ----- user actions / events -----
    def add_mission(self, mid, dest, priority, mtype, auto=True):
        if not mid:
            return False, "Mission ID cannot be empty."
        if self.find_mission(mid):
            return False, "Mission ID already exists. Please use a unique ID."
        if dest not in NODE_NAMES:
            return False, "Invalid destination node."
        if priority < 1 or priority > 5:
            return False, "Priority must be between 1 and 5."
        self.next_step()
        self.seq += 1
        m = Mission(mid, dest, priority, mtype or "General", self.seq, self.step)
        self.missions.append(m)
        heapq.heappush(self.queue, (-priority, self.seq, mid))
        tag = "URGENT" if priority == 5 else "MISSION"
        self.add_log(tag, "Mission %s added | Node %d (%s) | Priority %d | Type %s"
                     % (mid, dest, NODE_NAMES[dest], priority, m.type))
        if auto:
            self.auto_assign()
        self.save_history()
        if m.status == "Assigned":
            return True, "Mission %s auto-dispatched to UAV-%s (high priority)." % (mid, m.assigned_uav)
        if priority >= AUTO_DISPATCH_PRIORITY:
            return True, "Mission %s is high priority but no UAV is free - waiting at top of queue." % mid
        return True, "Mission %s added to priority queue. Click 'Process Pending Missions' to allocate." % mid

    def process_missions(self):
        self.next_step()
        self.add_log("MENU", "Processing all pending missions (every priority level)...")
        n = self.auto_assign(min_priority=1)
        self.save_history()
        return "%d mission(s) assigned." % n

    def complete_mission(self, mid):
        m = self.find_mission(mid)
        if m is None:
            return False, "Mission not found."
        if m.status != "Assigned":
            return False, "Mission is not currently assigned."
        self.next_step()
        m.status = "Completed"
        m.completed_step = self.step
        uav = self.find_uav(m.assigned_uav)
        if uav:
            uav.location = m.destination
            uav.busy = False
            uav.missions_done += 1
        self.add_log("DONE", "Mission %s completed. UAV-%s now at node %d."
                     % (mid, m.assigned_uav, m.destination))
        self.auto_assign()
        self.save_history()
        return True, "Mission %s completed." % mid

    def complete_all(self):
        ids = [m.id for m in self.missions if m.status == "Assigned"]
        for mid in ids:
            self.complete_mission(mid)
        return "%d mission(s) completed." % len(ids)

    def low_battery_event(self, uid, value):
        uav = self.find_uav(uid)
        if uav is None:
            return False, "UAV not found."
        if value < 0 or value > 100:
            return False, "Invalid battery value."
        self.next_step()
        uav.set_battery(value)
        self.add_log("EVENT", "UAV-%s battery changed to %d%%." % (uid, value))
        if value <= LOW_BATTERY_LIMIT:
            self.add_log("WARNING", "UAV-%s entered LOW BATTERY state." % uid)
        self.auto_assign()
        self.save_history()
        return True, "Battery of UAV-%s set to %d%%." % (uid, value)

    def recharge(self, uid):
        uav = self.find_uav(uid)
        if uav is None:
            return False, "UAV not found."
        self.next_step()
        uav.battery = 100
        self.add_log("RECHARGE", "UAV-%s recharged to 100%%." % uid)
        self.auto_assign()
        self.save_history()
        return True, "UAV-%s recharged." % uid

    def failure_event(self, uid):
        uav = self.find_uav(uid)
        if uav is None:
            return False, "UAV not found."
        if uav.failed:
            return False, "UAV-%s has already failed." % uid
        self.next_step()
        uav.failed = True
        uav.busy = False
        self.add_log("EVENT", "UAV-%s has FAILED." % uid)
        for m in self.missions:
            if m.assigned_uav == uid and m.status == "Assigned":
                self.add_log("ALERT", "Mission %s affected by UAV failure - returned to priority queue." % m.id)
                m.reset_to_pending()
                heapq.heappush(self.queue, (-m.priority, m.seq, m.id))
        self.auto_assign()
        self.save_history()
        return True, "UAV-%s failed. Affected missions re-planned." % uid

    def repair(self, uid):
        uav = self.find_uav(uid)
        if uav is None or not uav.failed:
            return False, "UAV is not in failed state."
        self.next_step()
        uav.failed = False
        self.add_log("REPAIR", "UAV-%s repaired and back in fleet." % uid)
        self.auto_assign()
        self.save_history()
        return True, "UAV-%s repaired." % uid

    def add_uav(self, uid, location, battery):
        if not uid or self.find_uav(uid):
            return False, "UAV ID empty or already exists."
        if location not in NODE_NAMES or battery < 0 or battery > 100:
            return False, "Invalid location or battery."
        self.next_step()
        self.uavs.append(UAV(uid, location, battery))
        self.add_log("SYSTEM", "New UAV-%s added at node %d with %d%% battery." % (uid, location, battery))
        self.auto_assign()
        self.save_history()
        return True, "UAV-%s added to fleet." % uid

    def block_route(self, u, v):
        if self.graph.is_blocked(u, v):
            return False, "Route already blocked."
        if not self.graph.block_route(u, v):
            return False, "That route does not exist in the graph."
        self.next_step()
        self.add_log("EVENT", "Route %d <-> %d has been BLOCKED. Future planning ignores this edge." % (u, v))
        self.auto_assign()
        self.save_history()
        return True, "Route %d <-> %d blocked." % (u, v)

    def unblock_route(self, u, v):
        if not self.graph.unblock_route(u, v):
            return False, "Route was not blocked."
        self.next_step()
        self.add_log("EVENT", "Route %d <-> %d is OPEN again." % (u, v))
        self.auto_assign()
        self.save_history()
        return True, "Route %d <-> %d opened." % (u, v)

    def load_demo(self):
        """Sample missions. High priority ones get auto-dispatched,
        the others wait in the priority queue."""
        demo = [("M-101", 6, 5, "Survivor Rescue"), ("M-102", 3, 3, "Medical Supply"),
                ("M-103", 5, 2, "Food Drop"), ("M-104", 12, 4, "Flood Survey"),
                ("M-105", 8, 1, "Surveillance"), ("M-106", 11, 5, "Survivor Rescue"),
                ("M-107", 9, 3, "Fire Check"), ("M-108", 2, 2, "Search")]
        added = 0
        for mid, d, p, t in demo:
            ok, _ = self.add_mission(mid, d, p, t)
            added += ok
        return "%d demo missions loaded. High priority (4-5) auto-dispatched, rest waiting in queue." % added
