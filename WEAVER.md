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

- 自動実行にしていないのは、ビルドが長時間（初回52分・2026-09-21実測）かかるため。
- リポジトリを公開にしている間は Actions の従量課金は発生しない。非公開に戻す場合は
  **macOSランナーが通常の10倍の分単位を消費する**点に注意（60分のビルドで600分を消費）。
- このリポジトリは React Native を**ソースからビルドする設定**（`ios/Podfile.properties.json` の
  `buildReactNativeFromSource=true`）。`patches/react-native+0.83.9.patch` がネイティブの
  `RCTScrollViewComponentView.mm` を書き換えるため、**プリビルド版へは切り替えられない**。
- 2回目以降の短縮のため **ccache を有効化**している（ワークフローで `USE_CCACHE=1`）。
  ビルド前後に ccache の hit 率がログに出るので、効いているか確認すること。

### 環境の要件
| 項目 | 値 |
|---|---|
| Node | `.nvmrc` = 24.15.0 |
| npm | 10 または 11 |
| iOS deployment target | 18.0 |
| ワークスペース | `ios/Mattermost.xcworkspace` / scheme `Mattermost` |

### Androidのビルド

GitHub Actions の **Weaver Android AAB**（`.github/workflows/weaver-android-aab.yml`）を手動起動する（`workflow_dispatch`。K-79）。入力は `clear_cache`・`for_submission`・`upload_to_play` の3つだけ。

- **署名の有無は入力にしない**。リポジトリの状態だけで決める: `.github/android_firebase_real`（目印）が無ければ**署名なし検証ビルド**（成果物の kind は `unsigned-verification-only`。Play にはアップロードできない）。目印があり、実の `google-services.json` とアップロード鍵・Secrets（GitHub の Environment `android-upload-key`）がそろっているときだけ署名する。
- 5つのジョブ: `verify`（型・テスト・actionlint）→ `preflight`（鍵の事前確認）→ `build`（版の注入・ガード・`bundleUnsigned`）→ `inspect`（署名前AABの全検査）→ `sign`（検査したAABと同一のsha256にだけ `jarsigner` で署名）。署名用の資格情報が見えるのは `preflight` と `sign` だけで、第三者のコードが動く `build` には渡さない。
- ガード・検査は `.github/scripts/weaver_android_guard.sh`（権限・google-services.json・署名・namespace・ブランド・平文通信・版・rnbeta・端末種別・秘密の追跡・ABI・SDK）、`weaver_android_aab.sh`、`weaver_android_16k_check.sh`（16KBページ整列）、`weaver_android_inject_version.sh`。データは `.github/android_permissions_allowlist.txt`・`android_baseline.json`・`android_upstream_asset_hashes.txt`。
- **versionCode は `1000 + github.run_number`**。ワークフローを作り直す・ファイル名を変えると `run_number` が1に戻り、Google Play が小さい versionCode を拒否する。作り直す・改名するときは、先に `VERSION_CODE_BASE`（`weaver-android-aab.yml` の `env`）を、Play に上げた最大の versionCode より大きくなるよう上げること。
- 署名ありのビルド（`.github/android_firebase_real` がある状態）は、`weaver-prepare-js` が `npm ci --ignore-scripts` で依存を入れていないとガードで止まる（`package-lock.json` をクリーンにコミットしてから切り替える）。
- 失敗したら**全ジョブを再実行**（Re-run all jobs）する。失敗したジョブだけの再実行は、成果物の名前（`run_attempt` を含む）が合わず失敗する（設計どおり）。
- 上流の更新を取り込むときは、下の「変更したファイル一覧」の Android の行（`build.gradle`・`AndroidManifest.xml`・`network_security_config.xml`・`strings.xml`・`google-services.json`）を見直す。

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

## 変更したファイル一覧（Apache-2.0 §4(b)）

Mattermost Mobile（Apache License 2.0）を基に、Weaver 向けに変更したファイル。初期設定（Bundle ID・アイコン・起動画面・表示名）の変更は、上流のコミット `0c0d6c48ec` から `git diff --name-only 0c0d6c48ec HEAD` で再現できる。
以下は K-39/R1（App Store 審査対応）で変更した、コメントを書けないファイルを含む一覧。TS/TSX の既存ファイルには、先頭に `Modified for Weaver` の1行コメントを付けた。

| ファイル | 変更の要点 |
|---|---|
| `app/screens/settings/about/about.tsx` | ロゴ・タイトル・規約リンクを Weaver の部品に差し替え、Mattermost 社への宣伝リンクを削除（帰属表記は残した） |
| `app/screens/settings/settings.tsx` | 「アカウントの削除について」の項目を About の直下に追加 |
| `app/constants/screens.ts` | 画面ID `ACCOUNT_DELETION` を追加 |
| `app/screens/login/sso_options.tsx` | GitLab 互換ボタンの文言・画像を Weaver に |
| `app/components/system_avatar/index.tsx` | システム投稿のアバターを Weaver のロゴに |
| `app/screens/edit_profile/components/email_field.tsx` | 「GitLab」の表示を Weaver に |
| `app/screens/settings/notifications/send_test_notification_notice/send_test_notification_notice.tsx` | `mattermost.com`（ユーザーID等を付けて遷移）へのリンクを除去 |
| `app/constants/report_a_problem.ts` | 「問題を報告」の既定の宛先を Weaver のサポートに |
| `app/utils/share_logs.ts` | 既定のサポートリンク・メール件名を Weaver に |
| `ios/Mattermost/Info.plist` | 許可ダイアログの文言5つのアプリ名を Weaver に。`UIBackgroundModes` から `audio`・`voip` を削除（App Store審査 Guideline 2.5.4 の指摘。`fetch`・`remote-notification` は残す。K-39 ビルド18） |
| `ios/Mattermost.xcodeproj/project.pbxproj` | `TARGETED_DEVICE_FAMILY` を iPhone 専用（`1`）に |
| `assets/base/images/icon.png` | アプリ内通知の既定アイコンを Weaver に |
| `eslint.config.mjs` | 末尾に Weaver 用ヘッダーの上書きブロックを追加 |
| `.github/workflows/weaver-ios-testflight.yml` | ビルド時ガードと、確認用／提出用ビルドの区別（`for_submission`）を追加 |
| `NOTICE.txt` | 冒頭に Weaver 版の変更の旨を追記 |
| `.gitattributes` | `.github/scripts/*.sh` を LF に固定 |
| `android/app/build.gradle` | `namespace` を上流のソースの `package` に合わせて `com.mattermost.rnbeta` に戻した（`applicationId` は `com.metarchitect.Weaver`）。先頭に変更表示（K-79） |
| `android/app/google-services.json` | Mattermost 社のものを**ダミー**（`DUMMY` で始まる値）に置換。実キーへの差し替えは、目印 `.github/android_firebase_real` と同じコミットで行う（JSON はコメントを書けないため本表で変更表示に代える） |
| `android/app/src/main/AndroidManifest.xml` | `FOREGROUND_SERVICE_MICROPHONE` と、ライブラリ由来の通話用フォアグラウンドサービス2件（`MMCallsForegroundService`・`MediaProjectionService`）を削除。`resizeableActivity` と `usesCleartextTraffic` を `false` に。先頭に変更表示 |
| `android/app/src/main/res/xml/network_security_config.xml` | 平文通信を禁止（`cleartextTrafficPermitted="false"`）。ユーザー追加CAの信頼は残す。先頭に変更表示 |
| `android/app/src/main/res/values/strings.xml` | `app_name` を `Weaver`（`app/weaver/constants.ts` の `APP_NAME` と同じ値）に |
| `.github/scripts/weaver_release_guard.sh` | `--shared-only`（`ios/` の検査 G1・G2 を飛ばす）を追加。既定の挙動・出力は変えていない |
| `.gitignore` | `*.jks`・`*.p12`・`*.pem`・`*.p8`・`*.b64`・`*.base64`・`*service-account*.json`・`*service_account*.json`・`*-adminsdk-*.json` を追加（鍵・認証情報の誤コミット防止） |
| `app/routes/(modals)/(channel_info)/channel_add_members.tsx` | メンバー追加画面を、params の `serverUrl` のサーバーに固定（`app/weaver/components/pinned_server_scope.tsx` で包む）。last_active が替わっても文脈が入れ替わらない（K-114） |
| `app/routes/(modals)/(channel_info)/index.tsx` | チャンネル情報画面を、params の `serverUrl` のサーバーに固定（同上。K-114） |
| `app/screens/channel_info/options/add_members/add_members.tsx` | 「メンバーを追加」を押した時点のサーバー URL を、メンバー追加画面の params に積む（K-114） |
| `app/components/channel_actions/add_members_box/add_members_box.tsx` | 同上（クイックアクションのシート／チャンネル案内からの入口。K-114） |
| `app/components/channel_actions/info_box/index.tsx` | 「情報」を押した時点のサーバー URL を、チャンネル情報画面の params に積む（K-114） |
| `app/screens/channel/header/header.tsx` | タイトルのタップでサーバー URL を積み、クイックアクションのボトムシートを開いた時点のサーバーに固定（K-114） |

`.gitattributes` には、Android のワークフロー・データファイルを LF に固定する行も追加した（K-79）。

新規: `app/weaver/`（Weaver 固有の定数・文言・画像・部品・画面・テスト）、`app/routes/(modals)/(settings)/account_deletion.tsx`、`assets/base/images/Weaver_Logo*.png`・`Icon_Weaver*.png`、`.github/scripts/weaver_release_guard.sh`、`.github/workflows/weaver-android-aab.yml`・`weaver-android-smoke-trial.yml`、`.github/actions/weaver-prepare-js/`、`.github/scripts/weaver_android_*.sh`、`.github/android_*`。
