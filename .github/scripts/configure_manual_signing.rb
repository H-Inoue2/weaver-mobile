#!/usr/bin/env ruby
# frozen_string_literal: true

# WeaverMobile (weaver-mobile) TestFlight配信用: 3ターゲット（本体＋通知拡張＋共有拡張）に
# 手動署名（Manual signing）の設定を強制するスクリプト。
#
# --- なぜ必要か ---
# ios/Mattermost.xcodeproj は元々 Automatic signing のまま
# （PBXProjectのTargetAttributes: ProvisioningStyle=Automatic、
#   DEVELOPMENT_TEAM=UQ8HT4Q2XM＝フォーク元 mattermost-mobile のチームID。
#   2026-10-01 実コード確認: project.pbxproj）。
# Weaver配布用の証明書・プロビジョニングプロファイルはチームID P63VK5792D で作成済み
# （.claude/specs/課題経緯/K-39.md 2026-09-30の記録）のため、チーム不一致のまま
# archiveすると署名が解決できない。
#
# また、xcodebuildのコマンドライン引数（KEY=VALUE形式のビルド設定オーバーライド）は
# 1回のビルド（1スキーム＝本体＋埋め込み拡張2つを1コマンドでarchiveする）の中の
# 全ターゲットに一律適用される。本体・通知拡張・共有拡張はそれぞれ別のBundle ID・
# 別のプロビジョニングプロファイルが必要なため、コマンドライン引数だけでは
# ターゲットごとに異なるPROVISIONING_PROFILE_SPECIFIERを指定できない。
# そのため、archiveの直前にプロジェクトファイル自体（Releaseコンフィグ＋
# TargetAttributes）を書き換える。
#
# --- 使用gem ---
# xcodeproj（Gemfileには直接書かれていないが、CocoaPods 1.16.1 の依存として
# Gemfile.lock に解決済み＝ 2026-10-01 確認。`bundle exec` 経由なら requireできる）。
#
# 実行: bundle exec ruby .github/scripts/configure_manual_signing.rb
# （リポジトリルートから実行する想定。Gemfileはルート直下にある）

require 'xcodeproj'

PROJECT_PATH = File.expand_path('../../ios/Mattermost.xcodeproj', __dir__)
TEAM_ID = 'P63VK5792D'

# ターゲット名 => Apple Developerサイトで作成済みのプロビジョニングプロファイル名
# （.claude/specs/課題経緯/K-39.md 2026-09-30の記録と、依頼文の対応表に一致させる）
PROFILE_NAMES = {
  'Mattermost' => 'Weaver Mobile Distribution',
  'NotificationService' => 'Weaver Notification Service Distribution',
  'MattermostShare' => 'Weaver Share Extension Distribution'
}.freeze

raise "project.pbxprojが見つかりません: #{PROJECT_PATH}" unless File.exist?(PROJECT_PATH)

project = Xcodeproj::Project.open(PROJECT_PATH)

target_attributes = (project.root_object.attributes['TargetAttributes'] ||= {})

configured = []

project.targets.each do |target|
  profile_name = PROFILE_NAMES[target.name]
  next unless profile_name

  target.build_configurations.each do |config|
    next unless config.name == 'Release'

    settings = config.build_settings
    settings['CODE_SIGN_STYLE'] = 'Manual'
    settings['DEVELOPMENT_TEAM'] = TEAM_ID
    settings['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
    settings['CODE_SIGN_IDENTITY[sdk=iphoneos*]'] = 'Apple Distribution'
    settings['PROVISIONING_PROFILE_SPECIFIER'] = profile_name
    settings.delete('PROVISIONING_PROFILE')
  end

  target_attributes[target.uuid] ||= {}
  target_attributes[target.uuid]['ProvisioningStyle'] = 'Manual'
  target_attributes[target.uuid]['DevelopmentTeam'] = TEAM_ID

  configured << target.name
end

missing = PROFILE_NAMES.keys - configured
unless missing.empty?
  raise "対象ターゲットが project.pbxproj に見つかりません: #{missing.join(', ')} " \
        '（ターゲット名が変更されていないか確認してください）'
end

project.save

puts "[configure_manual_signing] Manual signing を設定しました: #{configured.join(', ')} (team #{TEAM_ID})"
