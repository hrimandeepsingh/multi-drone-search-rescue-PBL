
import os
from flask import Flask, render_template, request, redirect, url_for, flash, Response

from engine import Coordinator, NODE_NAMES, MISSION_TYPES, BATTERY_PER_COST, AUTO_DISPATCH_PRIORITY
import charts

app = Flask(__name__)
app.secret_key = "multi-uav-sar"

coord = Coordinator()          # one simulation shared by the whole website
BASE = os.path.dirname(os.path.abspath(__file__))


def show(ok, msg):
    flash(msg, "ok" if ok else "error")


def to_int(name, default=-1):
    try:
        return int(request.form.get(name, default))
    except ValueError:
        return default


# common data available in every template
@app.context_processor
def common():
    return {"nodes": NODE_NAMES, "step": coord.step, "inf": float("inf"),
            "auto_level": AUTO_DISPATCH_PRIORITY}


# ---------------- DASHBOARD ----------------
@app.route("/")
def dashboard():
    counts = {
        "uavs": len(coord.uavs),
        "available": sum(u.is_available() for u in coord.uavs),
        "busy": sum(u.status() == "BUSY" for u in coord.uavs),
        "failed": sum(u.failed for u in coord.uavs),
        "pending": sum(m.status == "Pending" for m in coord.missions),
        "assigned": sum(m.status == "Assigned" for m in coord.missions),
        "completed": sum(m.status == "Completed" for m in coord.missions),
        "blocked": len(coord.graph.blocked),
    }
    return render_template("dashboard.html", counts=counts,
                           map_img=charts.draw_map(coord, coord.last_route),
                           queue=coord.queue_view()[:8],
                           log=list(reversed(coord.log))[:12])


# ---------------- MISSIONS ----------------
@app.route("/missions")
def missions():
    return render_template("missions.html", missions=coord.missions,
                           queue=coord.queue_view(), heap=coord.heap_array(),
                           types=MISSION_TYPES)


@app.route("/missions/add", methods=["POST"])
def add_mission():
    show(*coord.add_mission(request.form.get("id", "").strip(), to_int("dest"),
                            to_int("priority"), request.form.get("type", "").strip()))
    return redirect(url_for("missions"))


@app.route("/missions/urgent", methods=["POST"])
def add_urgent():
    ok, msg = coord.add_mission(request.form.get("id", "").strip(), to_int("dest"), 5,
                                request.form.get("type", "").strip())
    show(ok, "[URGENT] " + msg + (" Inserted with Priority 5." if ok else ""))
    return redirect(url_for("missions"))


@app.route("/missions/process", methods=["POST"])
def process():
    show(True, coord.process_missions())
    return redirect(request.referrer or url_for("missions"))


@app.route("/missions/complete", methods=["POST"])
def complete():
    show(*coord.complete_mission(request.form.get("id", "")))
    return redirect(request.referrer or url_for("missions"))


@app.route("/missions/complete_all", methods=["POST"])
def complete_all():
    show(True, coord.complete_all())
    return redirect(request.referrer or url_for("missions"))


@app.route("/missions/demo", methods=["POST"])
def demo():
    show(True, coord.load_demo())
    return redirect(url_for("missions"))


# ---------------- UAV FLEET ----------------
@app.route("/fleet")
def fleet():
    return render_template("fleet.html", uavs=coord.uavs, missions=coord.missions)


@app.route("/fleet/battery", methods=["POST"])
def battery():
    show(*coord.low_battery_event(request.form.get("uav"), to_int("battery")))
    return redirect(url_for("fleet"))


@app.route("/fleet/fail", methods=["POST"])
def fail():
    show(*coord.failure_event(request.form.get("uav")))
    return redirect(url_for("fleet"))


@app.route("/fleet/repair", methods=["POST"])
def repair():
    show(*coord.repair(request.form.get("uav")))
    return redirect(url_for("fleet"))


@app.route("/fleet/recharge", methods=["POST"])
def recharge():
    show(*coord.recharge(request.form.get("uav")))
    return redirect(url_for("fleet"))


@app.route("/fleet/add", methods=["POST"])
def add_uav():
    show(*coord.add_uav(request.form.get("id", "").strip().upper(), to_int("location"),
                        to_int("battery")))
    return redirect(url_for("fleet"))


# ---------------- ROUTES / GRAPH ----------------
@app.route("/routes", methods=["GET", "POST"])
def routes():
    result = None
    path = coord.last_route
    if request.method == "POST":
        s, d = to_int("source"), to_int("dest")
        if s in NODE_NAMES and d in NODE_NAMES:
            reachable, order = coord.graph.bfs(s, d)
            cost, path = coord.graph.dijkstra(s, d)
            dist, parent = coord.graph.dijkstra_all(s)
            result = {"s": s, "d": d, "reachable": reachable, "bfs_order": order,
                      "cost": cost, "path": path, "dist": dist, "parent": parent,
                      "battery": cost * BATTERY_PER_COST if cost != -1 else None}
        else:
            flash("Invalid nodes.", "error")
    return render_template("routes.html", edges=coord.graph.edge_list(),
                           graph=coord.graph, result=result,
                           map_img=charts.draw_map(coord, path))


@app.route("/routes/block", methods=["POST"])
def block():
    u, v = map(int, request.form.get("edge", "0-0").split("-"))
    show(*coord.block_route(u, v))
    return redirect(url_for("routes"))


@app.route("/routes/unblock", methods=["POST"])
def unblock():
    u, v = map(int, request.form.get("edge", "0-0").split("-"))
    show(*coord.unblock_route(u, v))
    return redirect(url_for("routes"))


# ---------------- ANALYTICS ----------------
@app.route("/analytics")
def analytics():
    mdf = charts.mission_dataframe(coord)
    udf = charts.uav_dataframe(coord)
    imgs = {
        "battery": charts.chart_battery(coord),
        "uav_status": charts.chart_uav_status(coord),
        "mission_status": charts.chart_mission_status(coord),
        "priority": charts.chart_priority(coord),
        "route_cost": charts.chart_route_cost(coord),
        "timeline": charts.chart_timeline(coord),
        "battery_trend": charts.chart_battery_trend(coord),
        "utilization": charts.chart_utilization(coord),
    }
    describe = udf[["Battery", "Missions Done", "Distance Flown"]].describe().round(2)
    return render_template("analytics.html", imgs=imgs, stats=charts.summary_stats(coord),
                           mission_table=mdf.to_html(index=False, classes="table", na_rep="-"),
                           describe_table=describe.to_html(classes="table"))


@app.route("/export/<what>.csv")
def export(what):
    df = charts.mission_dataframe(coord) if what == "missions" else charts.uav_dataframe(coord)
    return Response(df.to_csv(index=False), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=%s.csv" % what})


# ---------------- LOG / ABOUT / CODE ----------------
@app.route("/log")
def log():
    return render_template("log.html", log=coord.log)


@app.route("/about")
def about():
    return render_template("about.html")


@app.route("/code")
def code():
    files = {}
    for name in ["engine.py", "charts.py", "app.py", "../cpp_updated/main.cpp"]:
        p = os.path.join(BASE, name)
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                files[os.path.basename(name)] = f.read()
    return render_template("code.html", files=files)


@app.route("/reset", methods=["POST"])
def reset():
    coord.reset()
    flash("Simulation reset to starting state.", "ok")
    return redirect(url_for("dashboard"))


if __name__ == "__main__":
    app.run(debug=True)
