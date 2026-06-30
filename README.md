# Japan Rental Analyzer

日本の賃貸物件を分析するツール。気になる物件のURLを貼り付けると、自動で解析し、エリア平均との比較、8次元スコアリング、複数物件の横断比較ができます。

## 概要

SUUMO / HOMES / athome / Yahoo!不動産 で気になる物件を見つけたら、URLを貼り付けるだけで：

- 物件情報を自動解析（賃料、管理費、敷金礼金、面積、間取り、階数、築年数、駅徒歩）
- エリア平均賃料との比較（高いか安いか一目で分かる）
- 8次元レーダーチャートで複数物件を重ねて比較
- 全物件の横断比較表
- 価格履歴の追跡（再取得で価格変動を記録）

## 機能

- **4プラットフォーム対応** — SUUMO / HOMES / athome / Yahoo!不動産 の物件詳細ページURLを貼り付けると自動解析
- **エリアベンチマーク** — 東京23区 + 横浜各区 + 全国主要都市の平均賃料・安全性・便利度・環境データ
- **8次元スコアリング** — 予算 / 面積 / 通勤 / 階数 / ペット / 駅距離 / 築年数 / 初期費用（自動正規化 0-100点）
- **レーダーチャート** — 複数物件の8次元スコアを重ねて比較
- **エリア偏差分析** — 物件の賃料がエリア平均より高いか安いか可視化
- **価格履歴** — 再取得で価格変動を記録・表示
- **全国対応** — 47都道府県の住所解析に対応

## 技術スタック

| レイヤー | 技術 |
|---|---|
| バックエンド | Python 3.14 / Flask |
| データベース | SQLite（8テーブル） |
| スクレイピング | requests / BeautifulSoup4 |
| 評価ロジック | 自作 8次元加重正規化アルゴリズム |
| 通勤計算 | NAVITIME Transfer API（オプション） |
| フロントエンド | Jinja2 / Vanilla JS / ECharts 5 |
| テスト | pytest（66テスト） |

## セットアップ

```bash
# 1. 仮想環境作成 + 依存インストール
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

# 2. NAVITIME API（任意）
cp .env.example .env

# 3. DB初期化 + エリアデータ投入
python scripts/init_db.py
python scripts/seed_regions.py

# 4. 起動
python app.py
# http://127.0.0.1:5000 を開く
```

## 使い方

1. `/import` ページを開く
2. 気になる物件の詳細ページURLを貼り付けて「取込」
3. `/my-list` ページで分析結果を確認（レーダーチャート、偏差、比較表）
4. `/` ページでエリア別の平均賃料を確認

## テスト

```bash
.venv/bin/pytest tests/ -v
```

## Render デプロイ

1. Render で New → Web Service → GitHub リポジトリを接続
2. ビルドコマンド: `pip install -r requirements.txt`
3. 起動コマンド: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1`
4. Persistent Disk: 1GB / Mount Path `db`
5. 環境変数 `DB_PATH` = `/opt/render/project/src/db/database.db`

## コンプライアンス

- ユーザーが提供した物件詳細ページのみ解析（全サイトクロールしない）
- robots.txt を確認、Disallow の場合はスキップ
- 低頻度アクセス（手動トリガー + 定期更新）
- 個人情報保存なし、商用再配布なし