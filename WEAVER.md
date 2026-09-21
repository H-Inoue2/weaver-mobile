# Weaver モバイルアプリ（mattermost-mobile の自社ビルド）

> このリポジトリは `mattermost/mattermost-mobile`（Apache-2.0）を基にした、Weaver 専用アプリのソースです。
> 設計と全体計画: `C:\Docker\Redmine\.claude\commands\task17_weaver_mobile_app.md` ／ 台帳 K-39

## なぜ自社ビルドするのか

公式アプリには次の制約があり、Weaver の要件を満たせない（2026-09-21 実機・公式ドキュメントで確認）。

1. **プッシュ通知が使えない** — 公式アプリへ通知を送れるのは Mattermost 社の HPNS のみ（Enterprise/Professional の年間サブスクが必要）
2. **サーバーURLの自動設定ができない** — 初回に手入力が必要
3. **SSOボタンが「GitLab」固定** — サーバー側の `ButtonText` を無視する
4. **ディープリンクが機能しない** — `mattermost://` でアプリが開くだけ

## 上流との関係

- `upstream` = `mattermost/mattermost-mobile`、`origin` = `H-Inoue2/weaver-mobile`
- セキュリティ更新に追従するため、**定期的に upstream を取り込む**こと。これが本プロジェクト最大の継続コスト。
- `.github/workflows-upstream-disabled/` は上流のCI定義。**このリポジトリでは使わないので無効化**（削除はしていない。取り込み時の参照用）。

## ビルド

GitHub Actions の **Weaver iOS Build** を手動起動する（`workflow_dispatch`）。

- 自動実行にしていないのは、**macOSランナーが通常の10倍の分単位を消費する**ため。
- このリポジトリは React Native を**ソースからビルドする設定**（`ios/Podfile.properties.json` の
  `buildReactNativeFromSource=true`）なので、初回は長時間かかる見込み。

### 環境の要件
| 項目 | 値 |
|---|---|
| Node | `.nvmrc` = 24.15.0 |
| npm | 10 または 11 |
| iOS deployment target | 18.0 |
| ワークスペース | `ios/Mattermost.xcworkspace` / scheme `Mattermost` |

## カスタマイズ予定（Phase 5）

| 項目 | 変更先 | 設定場所 |
|---|---|---|
| アプリ名 | Weaver | `fastlane/.env` の `APP_NAME` |
| Bundle ID（本体） | 例 `com.HI-MET-Architect.Weaver` | `MAIN_APP_IDENTIFIER` |
| Bundle ID（共有拡張） | 上記 + `.MattermostShare` 相当 | `EXTENSION_APP_IDENTIFIER` |
| Bundle ID（通知サービス） | 上記 + `.NotificationService` 相当 | `NOTIFICATION_SERVICE_IDENTIFIER` |
| アイコン・起動画面 | Weaver のもの | `REPLACE_ASSETS=true`（公式の White Labeling） |
| SSOボタン文言 | 「Redmineでログイン」 | アプリ側のコード修正（要調査） |
| サーバーURL自動設定 | `weaver://setup?url=...` | アプリ側のコード追加（要調査） |

※ Bundle ID は `fastlane/env_vars_example` に変数が用意されており**変更前提の作り**。
  ただし公式ドキュメントに「元のままにする」旨の記述もあるため、**実ビルドで確定させる**こと。

## ライセンス

Apache-2.0。`LICENSE.txt` と `NOTICE.txt` を保持すること。
Mattermost の商標（名称・ロゴ）は使用しない。
