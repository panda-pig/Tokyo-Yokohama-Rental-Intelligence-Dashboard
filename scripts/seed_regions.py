"""Seed region_stats table with baseline rental data for Tokyo 23 wards, Yokohama wards, and major cities.

Data sources: SUUMO area statistics (public), manually compiled avg rent/area/age.
Safety/convenience/environment levels are simplified as 高/中/低 based on general reputation.
Run once: python scripts/seed_regions.py
"""
import sqlite3
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DB_PATH

# 东京23区: (ward, avg_rent, avg_area, avg_building_age, safety, convenience, environment)
TOKYO_WARDS = [
    ("千代田区", 138000, 45.0, 25, "高", "高", "中"),
    ("中央区", 132000, 42.0, 22, "高", "高", "中"),
    ("港区", 165000, 48.0, 20, "高", "高", "中"),
    ("新宿区", 118000, 38.0, 25, "中", "高", "中"),
    ("文京区", 112000, 40.0, 22, "高", "高", "高"),
    ("台東区", 98000, 35.0, 28, "中", "高", "中"),
    ("墨田区", 95000, 35.0, 25, "中", "高", "中"),
    ("江東区", 102000, 38.0, 20, "中", "高", "中"),
    ("品川区", 115000, 40.0, 22, "高", "高", "中"),
    ("目黒区", 118000, 40.0, 24, "高", "高", "高"),
    ("大田区", 105000, 40.0, 26, "高", "高", "高"),
    ("世田谷区", 108000, 42.0, 25, "高", "中", "高"),
    ("渋谷区", 125000, 38.0, 22, "中", "高", "中"),
    ("中野区", 102000, 35.0, 26, "中", "高", "中"),
    ("杉並区", 98000, 38.0, 26, "高", "中", "高"),
    ("豊島区", 98000, 33.0, 26, "中", "高", "中"),
    ("北区", 88000, 35.0, 26, "中", "高", "中"),
    ("荒川区", 85000, 35.0, 28, "中", "中", "中"),
    ("板橋区", 88000, 38.0, 27, "高", "中", "高"),
    ("練馬区", 85000, 40.0, 27, "高", "中", "高"),
    ("足立区", 78000, 40.0, 28, "中", "中", "中"),
    ("葛飾区", 78000, 40.0, 29, "中", "中", "中"),
    ("江戸川区", 80000, 40.0, 27, "中", "中", "高"),
]

# 横浜市各区
YOKOHAMA_WARDS = [
    ("鶴見区", 88000, 40.0, 26, "中", "高", "中"),
    ("神奈川区", 95000, 38.0, 24, "中", "高", "中"),
    ("西区", 115000, 40.0, 20, "高", "高", "中"),
    ("中区", 108000, 38.0, 22, "中", "高", "中"),
    ("南区", 92000, 40.0, 25, "中", "高", "中"),
    ("保土ケ谷区", 85000, 42.0, 27, "中", "中", "高"),
    ("磯子区", 88000, 42.0, 26, "中", "中", "高"),
    ("金沢区", 92000, 42.0, 24, "高", "中", "高"),
    ("港北区", 98000, 42.0, 22, "高", "高", "高"),
    ("戸塚区", 85000, 42.0, 25, "中", "中", "高"),
    ("港南区", 88000, 42.0, 24, "中", "中", "高"),
    ("旭区", 82000, 42.0, 27, "高", "中", "高"),
    ("緑区", 80000, 42.0, 25, "高", "中", "高"),
    ("瀬谷区", 80000, 42.0, 27, "高", "中", "高"),
    ("栄区", 82000, 42.0, 26, "中", "中", "高"),
    ("泉区", 80000, 42.0, 27, "高", "中", "高"),
    ("青葉区", 98000, 42.0, 22, "高", "中", "高"),
    ("都筑区", 95000, 42.0, 21, "高", "中", "高"),
]

# 川崎市各区
KAWASAKI_WARDS = [
    ("川崎区", 88000, 38.0, 25, "中", "高", "中"),
    ("幸区", 92000, 38.0, 23, "中", "高", "中"),
    ("中原区", 95000, 40.0, 24, "高", "高", "中"),
    ("高津区", 90000, 40.0, 24, "高", "高", "高"),
    ("多摩区", 88000, 40.0, 25, "高", "中", "高"),
    ("宮前区", 92000, 42.0, 23, "高", "中", "高"),
    ("麻生区", 88000, 42.0, 24, "高", "中", "高"),
]

# 全国主要城市 (prefecture, city, ward=None, avg_rent, avg_area, avg_age, safety, conv, env)
MAJOR_CITIES = [
    ("大阪府", "大阪市", None, 95000, 40.0, 25, "中", "高", "中"),
    ("京都府", "京都市", None, 92000, 40.0, 28, "高", "高", "高"),
    ("神戸市", None, None, 98000, 42.0, 25, "高", "高", "高"),
    ("名古屋市", None, None, 85000, 42.0, 24, "中", "高", "中"),
    ("札幌市", None, None, 72000, 42.0, 25, "高", "高", "高"),
    ("福岡市", None, None, 82000, 42.0, 23, "中", "高", "中"),
    ("仙台市", None, None, 75000, 42.0, 25, "高", "高", "高"),
    ("広島市", None, None, 78000, 42.0, 25, "中", "高", "高"),
]


def seed_regions():
    conn = sqlite3.connect(DB_PATH)
    # 清空旧数据
    conn.execute("DELETE FROM region_stats")
    now = datetime.now().isoformat()

    # 东京23区
    for ward, rent, area, age, safety, conv, env in TOKYO_WARDS:
        conn.execute("""INSERT INTO region_stats
            (prefecture, city, ward, avg_rent, avg_area, avg_building_age,
             safety_level, convenience_level, environment_level, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            ("東京都", None, ward, rent, area, age, safety, conv, env, now))

    # 横浜市各区
    for ward, rent, area, age, safety, conv, env in YOKOHAMA_WARDS:
        conn.execute("""INSERT INTO region_stats
            (prefecture, city, ward, avg_rent, avg_area, avg_building_age,
             safety_level, convenience_level, environment_level, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            ("神奈川県", "横浜市", ward, rent, area, age, safety, conv, env, now))

    # 川崎市各区
    for ward, rent, area, age, safety, conv, env in KAWASAKI_WARDS:
        conn.execute("""INSERT INTO region_stats
            (prefecture, city, ward, avg_rent, avg_area, avg_building_age,
             safety_level, convenience_level, environment_level, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            ("神奈川県", "川崎市", ward, rent, area, age, safety, conv, env, now))

    # 全国主要城市
    for pref, city, ward, rent, area, age, safety, conv, env in MAJOR_CITIES:
        conn.execute("""INSERT INTO region_stats
            (prefecture, city, ward, avg_rent, avg_area, avg_building_age,
             safety_level, convenience_level, environment_level, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (pref, city, ward, rent, area, age, safety, conv, env, now))

    conn.commit()
    count = conn.execute("SELECT COUNT(*) FROM region_stats").fetchone()[0]
    conn.close()
    print(f"Seeded {count} region stats")


if __name__ == "__main__":
    seed_regions()