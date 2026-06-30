import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers.homes_detail import parse_homes_detail
from scrapers.athome_detail import parse_athome_detail
from scrapers.yahoo_detail import parse_yahoo_detail
from scripts.run_scrape import normalize

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def _read(name):
    with open(os.path.join(FIXTURES, name), encoding="utf-8") as f:
        return f.read()


def test_athome_detail():
    raw = parse_athome_detail(_read("athome_detail_sample.html"), "https://www.athome.jp/test/")
    d = normalize(raw)
    assert raw.platform == "athome"
    assert raw.title == "テストアットホーム物件"
    assert d["rent"] == 135000
    assert d["management_fee"] == 7000
    assert d["area_m2"] == 45.1
    assert raw.layout == "2LDK"
    assert d["floor"] == 1
    assert d["building_age"] == 8
    assert d["walk_minutes"] == 6
    assert d["ward"] == "川崎区"


def test_yahoo_detail():
    raw = parse_yahoo_detail(_read("yahoo_detail_sample.html"), "https://realestate.yahoo.co.jp/test/")
    d = normalize(raw)
    assert raw.platform == "Yahoo"
    assert raw.title == "テストヤフー不動産物件"
    assert d["rent"] == 105000
    assert d["management_fee"] == 6000
    assert d["area_m2"] == 42.5
    assert raw.layout == "1LDK"
    assert d["floor"] == 3
    assert d["building_age"] == 11
    assert d["walk_minutes"] == 5
    assert d["ward"] == "品川区"