# charts.py
# Draws the disaster area map and analytics graphs using pandas + matplotlib.
# Every function returns a base64 PNG string that we put directly in <img src="...">

import io
import base64

import matplotlib
matplotlib.use("Agg")            # no GUI window, just make images
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator
from matplotlib.patches import Circle
import matplotlib.patheffects as pe
import pandas as pd

from engine import NODE_NAMES, NODE_POS, FLEET

STATUS_COLORS = {"AVAILABLE": "#2e9e44", "BUSY": "#f0a020",
                 "LOW BATTERY": "#8e44ad", "FAILED": "#d62c2c"}


def fig_to_base64(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=100)
    plt.close(fig)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------
# MAP OF DISASTER AREA
# ---------------------------------------------------------------
PRIORITY_COLORS = {5: "#d62c2c", 4: "#ef6c2f", 3: "#f0a020", 2: "#3c8dbc", 1: "#7f8c8d"}
STATIONS = {loc for _, loc, _ in FLEET}       # nodes where UAVs start (drone stations)


def draw_map(coord, highlight=None):
    """highlight = list of nodes of a path to show in blue"""
    g = coord.graph
    fig, ax = plt.subplots(figsize=(14, 8.5))
    fig.patch.set_facecolor("#f4f7fb")
    ax.set_facecolor("#eaf1f8")
    shadow = [pe.SimplePatchShadow(offset=(2, -2), alpha=0.25), pe.Normal()]

    # light grid in background, like a map
    for gx in range(-1, 13):
        ax.axvline(gx, color="white", linewidth=1, zorder=0)
    for gy in range(-3, 9):
        ax.axhline(gy, color="white", linewidth=1, zorder=0)

    path_edges = set()
    if highlight and len(highlight) > 1:
        for a, b in zip(highlight, highlight[1:]):
            path_edges.add((min(a, b), max(a, b)))

    # highest active priority at each node -> red "danger zone" glow around that node
    zone = {}
    for m in coord.missions:
        if m.status in ("Pending", "Assigned"):
            zone[m.destination] = max(zone.get(m.destination, 0), m.priority)
    for n, p in zone.items():
        x, y = NODE_POS[n]
        for r, a in ((0.55 + 0.12 * p, 0.10), (0.45 + 0.08 * p, 0.15)):
            ax.add_patch(Circle((x, y), r, color=PRIORITY_COLORS[p], alpha=a, zorder=1, lw=0))

    # edges
    for u, v, w in g.edge_list():
        x1, y1 = NODE_POS[u]
        x2, y2 = NODE_POS[v]
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        if g.is_blocked(u, v):
            ax.plot([x1, x2], [y1, y2], color="#d62c2c", linestyle=(0, (4, 3)), linewidth=2.5, zorder=2)
            ax.text(mx, my, "X", fontsize=13, color="white", fontweight="bold", ha="center", va="center",
                    zorder=4, bbox=dict(boxstyle="circle,pad=0.25", fc="#d62c2c", ec="white", lw=1.5))
            continue
        if (u, v) in path_edges:
            ax.plot([x1, x2], [y1, y2], color="#7fb2ff", linewidth=12, alpha=0.45,
                    solid_capstyle="round", zorder=2)        # glow
            ax.plot([x1, x2], [y1, y2], color="#1f5fbf", linewidth=4.5, solid_capstyle="round", zorder=2)
            label_color = "#1f5fbf"
        else:
            ax.plot([x1, x2], [y1, y2], color="#9aa9bb", linewidth=1.5 + w * 0.35, alpha=0.9,
                    solid_capstyle="round", zorder=2)
            label_color = "#34495e"
        ax.text(mx, my, str(w), fontsize=10, color=label_color, fontweight="bold",
                ha="center", va="center", zorder=4,
                bbox=dict(boxstyle="round,pad=0.25", fc="white", ec=label_color, lw=1))

    # arrows to show direction of the selected route
    if highlight and len(highlight) > 1:
        for a, b in zip(highlight, highlight[1:]):
            (x1, y1), (x2, y2) = NODE_POS[a], NODE_POS[b]
            ax.annotate("", xy=(x1 + 0.7 * (x2 - x1), y1 + 0.7 * (y2 - y1)),
                        xytext=(x1 + 0.55 * (x2 - x1), y1 + 0.55 * (y2 - y1)), zorder=5,
                        arrowprops=dict(arrowstyle="-|>,head_width=0.5,head_length=0.8",
                                        color="#0d3c8c", lw=2))

    # nodes
    for n, (x, y) in NODE_POS.items():
        if n in STATIONS:
            ax.scatter(x, y, s=1900, marker="h", color="#1a3d6d", edgecolors="white",
                       linewidths=2.5, zorder=6, path_effects=shadow)
            txt_color = "white"
        else:
            color = "#ffffff"
            if n in zone:
                color = "#ffe9c7"
            if highlight and n in highlight:
                color = "#cfe0ff"
            ax.scatter(x, y, s=1400, color=color, edgecolors="#1a3d6d", linewidths=2.2,
                       zorder=6, path_effects=shadow)
            txt_color = "#1a3d6d"
        ax.text(x, y, str(n), fontsize=14, fontweight="bold", color=txt_color,
                ha="center", va="center", zorder=7)
        ax.text(x, y - 0.55, NODE_NAMES[n], fontsize=9,
                ha="center", va="top", zorder=7, color="#2c3e50",
                bbox=dict(boxstyle="round,pad=0.15", fc="white", ec="none", alpha=0.75))

        # priority badge for nodes with active missions
        if n in zone:
            ax.text(x + 0.42, y + 0.32, "P%d" % zone[n], fontsize=8, color="white", fontweight="bold",
                    ha="center", va="center", zorder=8,
                    bbox=dict(boxstyle="round,pad=0.2", fc=PRIORITY_COLORS[zone[n]], ec="white", lw=1))

        # UAVs at this node (small coloured circles with IDs)
        here = [u for u in coord.uavs if u.location == n]
        for i, u in enumerate(here):
            ux = x - 0.6 + (i % 5) * 0.3
            uy = y + 0.62 + (i // 5) * 0.3
            ax.scatter(ux, uy, marker="o", s=170, color=STATUS_COLORS[u.status()],
                       edgecolors="white", linewidths=1.2, zorder=8, path_effects=shadow)
            ax.text(ux, uy, u.id, fontsize=7, color="white", ha="center", va="center",
                    fontweight="bold", zorder=9)

    # start and end of selected route
    if highlight and len(highlight) > 1:
        sx, sy = NODE_POS[highlight[0]]
        ex, ey = NODE_POS[highlight[-1]]
        ax.text(sx - 0.62, sy, "START", fontsize=7, color="white", fontweight="bold", ha="right",
                va="center", zorder=9, bbox=dict(boxstyle="round,pad=0.2", fc="#2e9e44", ec="none"))
        ax.text(ex + 0.62, ey, "TARGET", fontsize=7, color="white", fontweight="bold", ha="left",
                va="center", zorder=9, bbox=dict(boxstyle="round,pad=0.2", fc="#d62c2c", ec="none"))

    # legend
    for name, col in STATUS_COLORS.items():
        ax.scatter([], [], marker="o", s=60, color=col, label="UAV " + name.lower())
    ax.scatter([], [], marker="h", s=120, color="#1a3d6d", label="Drone station")
    ax.plot([], [], color="#d62c2c", linestyle="--", label="Blocked route")
    ax.plot([], [], color="#1f5fbf", linewidth=4, label="Selected route")
    ax.scatter([], [], s=150, color=PRIORITY_COLORS[5], alpha=0.35, label="Active mission zone")
    ax.legend(loc="upper right", fontsize=9, ncol=2, framealpha=0.95, edgecolor="#c5cfdc")

    ax.set_title("Disaster Area Map  |  %d locations, %d routes, %d UAVs"
                 % (len(NODE_POS), len(g.edge_list()), len(coord.uavs)),
                 fontsize=14, fontweight="bold", color="#1a3d6d", loc="left")
    ax.set_xlim(-1, 11.8)
    ax.set_ylim(-2.3, 8.3)
    ax.set_xticks([])
    ax.set_yticks([])
    for spine in ax.spines.values():
        spine.set_color("#c5cfdc")
    return fig_to_base64(fig)


# ---------------------------------------------------------------
# PANDAS DATAFRAMES
# ---------------------------------------------------------------
def uav_dataframe(coord):
    rows = []
    for u in coord.uavs:
        rows.append({"UAV": "UAV-" + u.id, "Location": u.location, "Battery": u.battery,
                     "Status": u.status(), "Missions Done": u.missions_done,
                     "Distance Flown": u.total_distance})
    return pd.DataFrame(rows)


def mission_dataframe(coord):
    rows = []
    for m in coord.missions:
        rows.append({"Mission": m.id, "Destination": m.destination, "Priority": m.priority,
                     "Type": m.type, "Status": m.status, "UAV": m.assigned_uav,
                     "Route": " -> ".join(map(str, m.route)), "Cost": m.cost,
                     "Battery Used": m.battery_used, "Created Step": m.created_step,
                     "Assigned Step": m.assigned_step, "Completed Step": m.completed_step,
                     "Reassigned": m.reassign_count})
    columns = ["Mission", "Destination", "Priority", "Type", "Status", "UAV", "Route", "Cost",
               "Battery Used", "Created Step", "Assigned Step", "Completed Step", "Reassigned"]
    return pd.DataFrame(rows, columns=columns)


def summary_stats(coord):
    """Small numbers for analytics page"""
    udf = uav_dataframe(coord)
    mdf = mission_dataframe(coord)
    s = {"total_uavs": len(udf),
         "avg_battery": round(udf["Battery"].mean(), 1),
         "min_battery": int(udf["Battery"].min()),
         "total_missions": len(mdf)}
    if len(mdf):
        done = mdf[mdf["Status"] != "Pending"]
        s["success_rate"] = round(100 * len(done) / len(mdf), 1)
        s["avg_cost"] = round(done["Cost"].mean(), 2) if len(done) else 0
        s["total_cost"] = int(done["Cost"].sum())
        waits = (done["Assigned Step"] - done["Created Step"]).dropna()
        s["avg_wait"] = round(waits.mean(), 2) if len(waits) else 0
    else:
        s.update(success_rate=0, avg_cost=0, total_cost=0, avg_wait=0)
    return s


# ---------------------------------------------------------------
# ANALYTICS CHARTS
# ---------------------------------------------------------------
def chart_battery(coord):
    df = uav_dataframe(coord)
    fig, ax = plt.subplots(figsize=(12, 4.5))
    ax.bar(df["UAV"], df["Battery"], color=[STATUS_COLORS[s] for s in df["Status"]])
    ax.axhline(20, color="red", linestyle="--", label="Low battery limit (20%)")
    ax.set_ylabel("Battery %")
    ax.set_ylim(0, 105)
    ax.set_title("Battery level of each UAV (colour = status)")
    ax.tick_params(axis="x", rotation=60)
    ax.legend()
    ax.grid(axis="y", alpha=0.3)
    return fig_to_base64(fig)


def chart_uav_status(coord):
    df = uav_dataframe(coord)
    counts = df["Status"].value_counts()
    fig, ax = plt.subplots(figsize=(5.5, 4.5))
    ax.pie(counts.values, labels=counts.index, autopct="%1.0f%%",
           colors=[STATUS_COLORS[s] for s in counts.index], startangle=90)
    ax.set_title("UAV fleet status")
    return fig_to_base64(fig)


def chart_mission_status(coord):
    df = mission_dataframe(coord)
    if df.empty:
        return None
    counts = df["Status"].value_counts()
    colors = {"Pending": "#d62c2c", "Assigned": "#f0a020", "Completed": "#2e9e44"}
    fig, ax = plt.subplots(figsize=(5.5, 4.5))
    ax.pie(counts.values, labels=counts.index, autopct="%1.0f%%",
           colors=[colors[s] for s in counts.index], startangle=90)
    ax.set_title("Mission status")
    return fig_to_base64(fig)


def chart_priority(coord):
    df = mission_dataframe(coord)
    if df.empty:
        return None
    table = pd.crosstab(df["Priority"], df["Status"]).reindex(range(1, 6), fill_value=0)
    fig, ax = plt.subplots(figsize=(6.5, 4.5))
    table.plot(kind="bar", stacked=True, ax=ax,
               color=[{"Pending": "#d62c2c", "Assigned": "#f0a020",
                       "Completed": "#2e9e44"}[c] for c in table.columns])
    ax.set_xlabel("Priority (5 = most urgent)")
    ax.set_ylabel("Number of missions")
    ax.set_title("Missions per priority level")
    ax.tick_params(axis="x", rotation=0)
    ax.yaxis.set_major_locator(MaxNLocator(integer=True))
    ax.set_ylim(0, table.sum(axis=1).max() + 1)
    ax.legend(loc="upper left", fontsize=9)
    ax.grid(axis="y", alpha=0.3)
    return fig_to_base64(fig)


def chart_route_cost(coord):
    df = mission_dataframe(coord)
    df = df[df["Status"] != "Pending"]
    if df.empty:
        return None
    fig, ax = plt.subplots(figsize=(6.5, 4.5))
    ax.bar(df["Mission"], df["Cost"], color="#1f5fbf", label="Route cost")
    ax2 = ax.twinx()
    ax2.plot(df["Mission"], df["Battery Used"], color="#d62c2c", marker="o", label="Battery used %")
    ax.set_ylabel("Route cost")
    ax2.set_ylabel("Battery used %")
    ax.set_ylim(0, df["Cost"].max() + 2)
    ax2.set_ylim(0, (df["Cost"].max() + 2) * 10)     # battery = 10 x cost, so both scales match
    ax.set_title("Route cost and battery used per mission")
    ax.tick_params(axis="x", rotation=60)
    fig.legend(loc="upper left", bbox_to_anchor=(0.12, 0.88))
    return fig_to_base64(fig)


def chart_timeline(coord):
    df = pd.DataFrame(coord.history)
    if len(df) < 2:
        return None
    fig, ax = plt.subplots(figsize=(12, 4.5))
    ax.plot(df["step"], df["pending"], marker="o", color="#d62c2c", label="Pending")
    ax.plot(df["step"], df["assigned"], marker="o", color="#f0a020", label="Assigned")
    ax.plot(df["step"], df["completed"], marker="o", color="#2e9e44", label="Completed")
    ax.plot(df["step"], df["available_uavs"], linestyle="--", color="#1f5fbf", label="Available UAVs")
    ax.set_xlabel("Simulation step (every event = 1 step)")
    ax.set_ylabel("Count")
    ax.set_title("System state over time")
    ax.legend()
    ax.grid(alpha=0.3)
    return fig_to_base64(fig)


def chart_utilization(coord):
    df = uav_dataframe(coord)
    df = df.sort_values("Distance Flown", ascending=False)
    fig, ax = plt.subplots(figsize=(12, 4))
    ax.bar(df["UAV"], df["Distance Flown"], color="#6c8ebf")
    ax.set_ylabel("Total route cost flown")
    ax.set_title("UAV utilisation (total distance flown)")
    ax.tick_params(axis="x", rotation=60)
    ax.grid(axis="y", alpha=0.3)
    return fig_to_base64(fig)


def chart_battery_trend(coord):
    df = pd.DataFrame(coord.history)
    if len(df) < 2:
        return None
    fig, ax = plt.subplots(figsize=(6.5, 4.5))
    ax.plot(df["step"], df["avg_battery"], marker="s", color="#8e44ad")
    ax.set_xlabel("Simulation step")
    ax.set_ylabel("Average battery %")
    ax.set_title("Average fleet battery over time")
    ax.grid(alpha=0.3)
    return fig_to_base64(fig)
