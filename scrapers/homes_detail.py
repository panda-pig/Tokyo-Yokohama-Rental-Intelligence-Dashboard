from bs4 import BeautifulSoup
from scrapers.models import RawListing
import re

HOMES_BASE = "https://www.homes.co.jp"


def parse_homes_detail(html, detail_url=""):
    """解析 HOMES (homes.co.jp) 物件详情页,提取为 RawListing。"""
    soup = BeautifulSoup(html, "html.parser")

    # 标题:取第一个非空 h1
    title = ""
    for h1 in soup.select("h1"):
        t = h1.get_text(strip=True)
        if t:
            title = re.sub(r"（.*$", "", t).strip()
            break

    # 提取 dt/dd 键值对
    kv = {}
    for dt in soup.select("dt"):
        dd = dt.find_next_sibling("dd")
        if dd:
            kv[dt.get_text(strip=True)] = dd.get_text(strip=True)

    # 賃料: "6.6万円"
    rent_raw = kv.get("賃料", "")

    # 管理費等: "5,500円"
    management_fee_raw = kv.get("管理費等", None)
    if management_fee_raw == "-":
        management_fee_raw = None

    # 敷金/礼金: "無/1ヶ月"
    deposit_raw = "0"
    key_money_raw = "0"
    dk = kv.get("敷金/礼金", "")
    if dk:
        parts = dk.split("/")
        if parts:
            deposit_raw = parts[0] if parts[0] != "無" else "0"
        if len(parts) > 1:
            key_money_raw = parts[1] if parts[1] != "無" else "0"

    # 交通(取第一个): "東急東横線 菊名駅 徒歩12分..."
    walk_text = kv.get("交通", None)
    nearest_station = walk_text
    walk_raw = walk_text

    # 所在地: "神奈川県横浜市港北区大豆戸町地図を見る"
    address_raw = kv.get("所在地", None)
    if address_raw:
        address_raw = re.sub(r"地図を見る$", "", address_raw).strip()

    # 築年月: "2008年12月(築18年)"
    age_raw = kv.get("築年月", None)

    # 間取り: "1K"
    layout = kv.get("間取り", None)

    # 専有面積: "19.87㎡"
    area_raw = kv.get("専有面積", None)

    # 所在階/階数: "2階/3階建"
    floor_raw = kv.get("所在階/階数", None)

    # 设备关键词
    features = []
    full_text = soup.get_text()
    for kw in ["バストイレ別", "オートロック", "宅配ボックス", "南向き", "エアコン", "2人入居可"]:
        if kw in full_text:
            features.append(kw)

    return RawListing(
        platform="HOMES",
        detail_url=detail_url,
        title=title,
        rent_raw=rent_raw,
        management_fee_raw=management_fee_raw,
        deposit_raw=deposit_raw,
        key_money_raw=key_money_raw,
        layout=layout,
        area_raw=area_raw,
        floor_raw=floor_raw,
        age_raw=age_raw,
        walk_raw=walk_raw,
        nearest_station=nearest_station,
        address_raw=address_raw,
        features_raw=features,
    )