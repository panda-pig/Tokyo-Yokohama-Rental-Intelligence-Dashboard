# Tokyo/Yokohama Rental Intelligence Dashboard

東京・横浜エリアの賃貸物件データを SUUMO / LIFULL HOME'S / athome から自動収集し、標準化・スコアリング・可視化を行うダッシュボード。

## 概要

複数の賃貸プラットフォームにまたがる物件情報を一元管理し、予算・面積・階数・ペット可否・駅徒歩・築年数などの条件に基づいて物件を評価・比較できるツールです。物件詳細は各プラットフォームへ遷移する設計で、意思決定支援に特化しています。

## 機能

- **3プラットフォーム自動収集** — SUUMO / LIFULL HOME'S / athome の検索結果から物件摘要を取得
- **データ標準化** — 「12.8万円」「徒歩8分」「築12年」などの日本語表記を数値に変換
- **8次元スコアリング** — 予算 / 面積 / 通勤 / 階数 / ペット / 駅距離 / 築年数 / 初期費用 の加重評価（自動正規化、0〜100点）
- **通勤時間計算** — NAVITIME Transfer API で実乗換時間を算出（API未設定時は駅距離で自動降格）
- **初期費用見積** — 敷金 + 礼金 + 仲介手数料 + 前家賃 + 固定雑費（係数調整可能）
- **ダッシュボード可視化** — 10指標カード + 9種類のグラフ（ECharts）
- **物件管理** — お気に入り / 内見予定 / 申込状況の進捗管理、最大4件の比較機能
- **価格履歴** — 複数回取得時の価格変動を記録

## 技術スタック

| レイヤー | 技術 |
|---|---|
| バックエンド | Python 3.14 / Flask |
| データベース | SQLite（7テーブル） |
| スクレイピング | requests / BeautifulSoup4 |
| 評価ロジック | 自作 8次元加重正規化アルゴリズム |
| 通勤計算 | NAVITIME Transfer API（オプション） |
| フロントエンド | Jinja2 / Vanilla JS / ECharts 5 |
| テスト | pytest（58テスト） |

## データベース構成

| テーブル | 用途 |
|---|---|
| `rental_listings` | 物件マスタ（標準化済みデータ） |
| `listing_scores` | 評価結果（8次元スコア + 総合点 + 理由） |
| `listing_status` | お気に入り・進捗状態 |
| `listing_price_history` | 価格履歴 |
| `source_configs` | データソース設定（URL / プラットフォーム / 状態） |
| `import_logs` | 取得・インポートログ |
| `user_preferences` | ユーザー設定（条件 / ウェイト / 費用係数） |

## セットアップ

```bash
# 1. 仮想環境作成 + 依存インストール
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

# 2. NAVITIME API（任意、未設定時は通勤分を自動降格）
cp .env.example .env
# .env に NAVITIME_CLIENT_KEY=your_key を記入

# 3. データベース初期化
python scripts/init_db.py

# 4. データソース設定
# /import ページで検索URLを追加、または直接DBにINSERT

# 5. データ取得 + スコアリング
python scripts/run_scrape.py
python scripts/recalculate_scores.py

# 6. 起動
python app.py
# http://127.0.0.1:5000 を開く
```

## テスト

```bash
.venv/bin/pytest tests/ -v
```

## プロジェクト構成

```
├── app.py                  # Flask 入口 + API ルート
├── config.py               # 環境変数 + デフォルト係数
├── schema.sql              # DBスキーマ
├── db_helper.py            # DB接続ヘルパー
├── core/                   # 業務ロジック
│   ├── cleaning.py         # 金額/面積/徒歩/階/築年/ペット/設備の標準化
│   ├── address.py          # 住所正規表現解析
│   ├── scoring.py          # 8次元加重正規化スコアリング
│   ├── commute.py          # NAVITIME API + 降格処理
│   ├── initial_cost.py     # 初期費用見積
│   └── dedup.py            # 重複排除ハッシュ
├── scrapers/               # プラットフォーム別スクレイパー
│   ├── base.py             # robots確認 + HTTP取得
│   ├── suumo.py / homes.py / athome.py
│   └── models.py           # RawListing データクラス
├── scripts/                # 実行スクリプト
│   ├── init_db.py
│   ├── run_scrape.py
│   └── recalculate_scores.py
├── templates/              # 7ページ
├── static/css|js/          # スタイル + ページJS
└── tests/                  # pytest + HTML fixtures
```

## 利用規約・コンプライアンス

本プロジェクトは個人学習・意思決定支援目的です。

- 検索結果ページの**摘要情報のみ**取得（詳細ページ本文は取得しない）
- スクレイピング前に robots.txt を確認、Disallow の場合はスキップ
- 手動トリガー、低頻度アクセス（1リクエスト毎に2.5秒待機）
- 連絡先等の個人情報は保存しない
- 商用再配布しない
- 各プラットフォームの利用規約を遵守してください