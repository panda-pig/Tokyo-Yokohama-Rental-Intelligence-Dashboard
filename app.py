from flask import Flask, jsonify, request, render_template
from db_helper import query_all, query_one, execute
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scripts.init_db import init_db

app = Flask(__name__)

# 启动时自动建表(幂等,首次部署或磁盘重置后生效)
init_db()


# ===== Pages =====

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/listings")
def page_listings():
    return render_template("listings.html")


@app.route("/rankings")
def page_rankings():
    return render_template("rankings.html")


@app.route("/favorites")
def page_favorites():
    return render_template("favorites.html")


@app.route("/compare")
def page_compare():
    return render_template("compare.html")


@app.route("/import")
def page_import():
    return render_template("import.html")


@app.route("/settings")
def page_settings():
    return render_template("settings.html")


# ===== Dashboard API =====

@app.route("/api/dashboard")
def api_dashboard():
    total = query_one("SELECT COUNT(*) AS c FROM rental_listings WHERE is_active=1")["c"]
    pref = query_one("SELECT * FROM user_preferences WHERE id=1")
    budget_match = query_one(
        "SELECT COUNT(*) AS c FROM rental_listings WHERE is_active=1 AND total_monthly_cost <= ?",
        (pref["max_total_monthly_cost"],))["c"]
    pet_count = query_one(
        "SELECT COUNT(*) AS c FROM rental_listings WHERE is_active=1 AND pet_allowed=1")["c"]
    avg_cost = query_one(
        "SELECT AVG(total_monthly_cost) AS a FROM rental_listings WHERE is_active=1")["a"] or 0
    avg_area = query_one(
        "SELECT AVG(area_m2) AS a FROM rental_listings WHERE is_active=1")["a"] or 0
    avg_score = query_one(
        "SELECT AVG(s.total_score) AS a FROM listing_scores s JOIN rental_listings l ON s.listing_id=l.id WHERE l.is_active=1")["a"] or 0
    fav_count = query_one("SELECT COUNT(*) AS c FROM listing_status")["c"]

    # 区域基准数据
    regions = query_all("SELECT * FROM region_stats ORDER BY avg_rent DESC")
    # 东京23区平均租金
    tokyo_regions = query_all("SELECT ward AS name, avg_rent AS value FROM region_stats WHERE prefecture='東京都' ORDER BY value DESC")
    # 横浜各区
    yokohama_regions = query_all("SELECT ward AS name, avg_rent AS value FROM region_stats WHERE city='横浜市' ORDER BY value DESC")

    # 用户导入物件的区域分布
    user_ward_dist = query_all(
        "SELECT ward AS name, COUNT(*) AS value FROM rental_listings WHERE is_active=1 AND ward IS NOT NULL GROUP BY ward ORDER BY value DESC")

    # 用户导入物件 vs 区域均价散点(带区域基准)
    user_scatter = query_all("""SELECT l.area_m2 AS x, l.total_monthly_cost AS y,
        l.title, l.ward, l.layout, r.avg_rent AS region_avg
        FROM rental_listings l LEFT JOIN region_stats r ON l.ward = r.ward
        WHERE l.is_active=1""")

    # 平台来源
    platform_dist = query_all(
        "SELECT platform AS name, COUNT(*) AS value FROM rental_listings WHERE is_active=1 GROUP BY platform")

    # 价格历史
    price_drop = query_one("""SELECT COUNT(*) AS c FROM listing_price_history h
        JOIN rental_listings l ON h.listing_id=l.id
        WHERE l.is_active=1 AND l.total_monthly_cost < h.total_monthly_cost""")["c"]

    # 状态分布
    status_dist = query_all(
        "SELECT status AS name, COUNT(*) AS value FROM listing_status GROUP BY status")

    return jsonify({
        "total_listings": total, "budget_match_count": budget_match,
        "pet_allowed_count": pet_count,
        "average_total_cost": int(avg_cost), "average_area": round(avg_area, 1),
        "average_score": round(avg_score, 1),
        "favorite_count": fav_count, "price_drop_count": price_drop,
        "region_count": len(regions),
        "regions": regions,
        "tokyo_region_rent": tokyo_regions,
        "yokohama_region_rent": yokohama_regions,
        "user_ward_distribution": user_ward_dist,
        "user_scatter": user_scatter,
        "platform_distribution": platform_dist,
        "status_distribution": status_dist,
    })


@app.route("/api/regions")
def api_regions():
    return jsonify(query_all("SELECT * FROM region_stats ORDER BY prefecture, city, ward"))


@app.route("/api/regions/<ward>")
def api_region_detail(ward):
    row = query_one("SELECT * FROM region_stats WHERE ward=?", (ward,))
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify(row)


# ===== Listings API =====

@app.route("/api/listings")
def api_listings():
    args = request.args
    sql = """SELECT l.*, s.total_score, s.score_reason, s.commute_resolved,
             s.commute_minutes AS score_commute_minutes,
             st.status AS fav_status
             FROM rental_listings l
             LEFT JOIN listing_scores s ON s.listing_id=l.id
             LEFT JOIN listing_status st ON st.listing_id=l.id
             WHERE l.is_active=1"""
    clauses = []
    params = []
    if args.get("max_total_cost"):
        clauses.append("l.total_monthly_cost <= ?")
        params.append(int(args["max_total_cost"]))
    if args.get("min_area"):
        clauses.append("l.area_m2 >= ?")
        params.append(float(args["min_area"]))
    if args.get("min_floor"):
        clauses.append("l.floor >= ?")
        params.append(int(args["min_floor"]))
    if args.get("pet_allowed") == "1":
        clauses.append("l.pet_allowed = 1")
    if args.get("max_walk_minutes"):
        clauses.append("l.walk_minutes <= ?")
        params.append(int(args["max_walk_minutes"]))
    if args.get("max_building_age"):
        clauses.append("l.building_age <= ?")
        params.append(int(args["max_building_age"]))
    if args.get("layout"):
        layouts = args["layout"].split(",")
        clauses.append("l.layout IN (%s)" % ",".join("?" * len(layouts)))
        params.extend(layouts)
    if args.get("platform"):
        plats = args["platform"].split(",")
        clauses.append("l.platform IN (%s)" % ",".join("?" * len(plats)))
        params.extend(plats)
    if args.get("ward"):
        wards = args["ward"].split(",")
        clauses.append("l.ward IN (%s)" % ",".join("?" * len(wards)))
        params.extend(wards)
    if args.get("min_score"):
        clauses.append("s.total_score >= ?")
        params.append(int(args["min_score"]))
    if args.get("status"):
        clauses.append("st.status = ?")
        params.append(args["status"])
    if clauses:
        sql += " AND " + " AND ".join(clauses)

    sort_map = {
        "score_desc": "s.total_score DESC",
        "price_asc": "l.total_monthly_cost ASC",
        "area_desc": "l.area_m2 DESC",
        "walk_asc": "l.walk_minutes ASC",
        "age_asc": "l.building_age ASC",
        "newest": "l.first_seen_at DESC",
        "price_per_m2_asc": "l.price_per_m2 ASC",
        "initial_cost_asc": "l.initial_cost_estimate ASC",
    }
    sql += " ORDER BY " + sort_map.get(args.get("sort", "score_desc"), sort_map["score_desc"])
    return jsonify(query_all(sql, params))


@app.route("/api/listings/<int:lid>")
def api_listing_detail(lid):
    row = query_one("""SELECT l.*, s.total_score, s.score_reason, s.commute_resolved,
        s.commute_minutes AS score_commute, st.status, st.memo, st.priority
        FROM rental_listings l
        LEFT JOIN listing_scores s ON s.listing_id=l.id
        LEFT JOIN listing_status st ON st.listing_id=l.id
        WHERE l.id=?""", (lid,))
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify(row)


@app.route("/api/rankings")
def api_rankings():
    limit = int(request.args.get("limit", 20))
    min_score = request.args.get("min_score")
    sql = """SELECT l.id, l.title, l.platform, l.ward, l.total_monthly_cost,
        l.area_m2, l.layout, l.floor, l.pet_allowed, l.detail_url,
        s.total_score, s.score_reason
        FROM listing_scores s JOIN rental_listings l ON s.listing_id=l.id
        WHERE l.is_active=1"""
    params = []
    if min_score:
        sql += " AND s.total_score >= ?"
        params.append(int(min_score))
    sql += " ORDER BY s.total_score DESC LIMIT ?"
    params.append(limit)
    return jsonify(query_all(sql, params))


# ===== Status / Favorites API =====

@app.route("/api/status", methods=["GET", "POST"])
def api_status():
    if request.method == "GET":
        return jsonify(query_all("""SELECT st.*, l.title, l.platform, l.ward,
            l.total_monthly_cost, l.detail_url FROM listing_status st
            JOIN rental_listings l ON st.listing_id=l.id ORDER BY st.updated_at DESC"""))
    data = request.json
    sid = execute("""INSERT INTO listing_status
        (listing_id, status, priority, memo, contacted)
        VALUES (?,?,?,?,?)""",
        (data["listing_id"], data.get("status"), data.get("priority"),
         data.get("memo"), data.get("contacted", 0)))
    return jsonify({"id": sid}), 201


@app.route("/api/status/<int:sid>", methods=["PUT", "DELETE"])
def api_status_modify(sid):
    if request.method == "DELETE":
        execute("DELETE FROM listing_status WHERE id=?", (sid,))
        return jsonify({"ok": True})
    data = request.json
    execute("""UPDATE listing_status SET status=?, priority=?, memo=?, contacted=?,
        viewing_date=?, decision=?, updated_at=CURRENT_TIMESTAMP WHERE id=?""",
        (data.get("status"), data.get("priority"), data.get("memo"),
         data.get("contacted", 0), data.get("viewing_date"), data.get("decision"), sid))
    return jsonify({"ok": True})


# ===== Compare API =====

@app.route("/api/compare")
def api_compare():
    ids = request.args.get("ids", "")
    id_list = [int(x) for x in ids.split(",") if x]
    if not id_list:
        return jsonify([])
    placeholders = ",".join("?" * len(id_list))
    rows = query_all(f"""SELECT l.*, s.total_score, s.score_reason, s.commute_resolved
        FROM rental_listings l LEFT JOIN listing_scores s ON s.listing_id=l.id
        WHERE l.id IN ({placeholders})""", id_list)
    return jsonify(rows)


# ===== Import / Scrape API =====

@app.route("/api/import/csv", methods=["POST"])
def api_import_csv():
    return jsonify({"total_rows": 0, "inserted_count": 0, "updated_count": 0,
                    "duplicate_count": 0, "error_count": 0, "message": "csv import optional"})


@app.route("/api/import/detail", methods=["POST"])
def api_import_detail():
    """粘贴单个房源详情页 URL,自动解析入库 + 评分。支持4平台。"""
    from scrapers.base import fetch_html
    from scripts.run_scrape import normalize, upsert_listing
    from scripts.recalculate_scores import recalculate
    from db_helper import get_conn

    data = request.json or {}
    url = data.get("url", "").strip()
    if not url:
        return jsonify({"error": "URL is required"}), 400

    # 根据 URL 判断平台和解析器
    if "suumo.jp" in url:
        from scrapers.suumo_detail import parse_suumo_detail
        parser = parse_suumo_detail
    elif "homes.co.jp" in url:
        from scrapers.homes_detail import parse_homes_detail
        parser = parse_homes_detail
    elif "athome.jp" in url:
        from scrapers.athome_detail import parse_athome_detail
        parser = parse_athome_detail
    elif "yahoo.co.jp" in url or "realestate.yahoo.co.jp" in url:
        from scrapers.yahoo_detail import parse_yahoo_detail
        parser = parse_yahoo_detail
    else:
        return jsonify({"error": "サポートされていないURLです。SUUMO/HOMES/athome/Yahoo!不動産の物件詳細URLを入力してください。"}), 400

    html = fetch_html(url)
    if html is None:
        return jsonify({"error": "ページの取得に失敗しました。robots.txtまたはネットワークエラーの可能性があります。"}), 500

    try:
        raw = parser(html, url)
        if not raw.title:
            return jsonify({"error": "物件情報の解析に失敗しました。詳細ページのURLが正しいか確認してください。"}), 500
    except Exception as e:
        return jsonify({"error": f"解析エラー: {str(e)}"}), 500

    conn = get_conn()
    status, listing_id = upsert_listing(conn, normalize(raw))
    conn.commit()
    conn.close()

    # 评分
    recalculate()

    return jsonify({
        "status": status,
        "title": raw.title,
        "message": f"「{raw.title}」を{'追加' if status == 'inserted' else '更新'}しました"
    })


@app.route("/api/scrape", methods=["POST"])
def api_scrape():
    from scripts.run_scrape import run_scrape
    data = request.json or {}
    source_ids = data.get("source_ids")
    run_scrape(source_ids)
    log = query_all("SELECT * FROM import_logs ORDER BY id DESC LIMIT 1")
    return jsonify(log[0] if log else {})


# ===== Sources API =====

@app.route("/api/sources")
def api_sources():
    return jsonify(query_all("SELECT * FROM source_configs ORDER BY id"))


@app.route("/api/sources", methods=["POST"])
def api_source_create():
    data = request.json
    sid = execute("INSERT INTO source_configs (name, platform, source_url, max_pages) VALUES (?,?,?,?)",
                  (data["name"], data["platform"], data["source_url"], data.get("max_pages", 2)))
    return jsonify({"id": sid}), 201


@app.route("/api/sources/<int:sid>", methods=["PUT", "DELETE"])
def api_source_modify(sid):
    if request.method == "DELETE":
        execute("DELETE FROM source_configs WHERE id=?", (sid,))
        return jsonify({"ok": True})
    data = request.json
    execute("UPDATE source_configs SET name=?, platform=?, source_url=?, max_pages=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (data["name"], data["platform"], data["source_url"], data.get("max_pages", 2), sid))
    return jsonify({"ok": True})


# ===== Preferences API =====

@app.route("/api/preferences")
def api_preferences():
    return jsonify(query_one("SELECT * FROM user_preferences WHERE id=1"))


@app.route("/api/preferences", methods=["PUT"])
def api_preferences_update():
    data = request.json
    fields = ["max_total_monthly_cost", "min_area_m2", "ideal_area_m2", "min_floor",
              "require_pet_allowed", "max_walk_minutes", "ideal_walk_minutes",
              "max_building_age", "target_station", "budget_weight", "area_weight",
              "commute_weight", "floor_weight", "pet_weight", "station_weight",
              "age_weight", "initial_cost_weight", "broker_fee_rate",
              "prepaid_rent_months", "misc_cost"]
    sets = ", ".join(f"{f}=?" for f in fields)
    params = [data.get(f) for f in fields]
    params.append("1")
    execute(f"UPDATE user_preferences SET {sets}, updated_at=CURRENT_TIMESTAMP WHERE id=?", params)
    return jsonify({"ok": True})


@app.route("/api/scores/recalculate", methods=["POST"])
def api_recalculate():
    from scripts.recalculate_scores import recalculate
    recalculate()
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG") == "1")