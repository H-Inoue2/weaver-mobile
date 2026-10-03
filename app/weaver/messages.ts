// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import {useIntl} from 'react-intl';

// Weaver 固有の文言表（en・ja）。上流の en.json・ja.json は触らない。
// 案内画面の文言の正は運用設計 K39_アカウント削除_運用設計_v0.1.md §7.1（ja）・§7.2（en）。
// 取り込みの規則: 行頭の記号・見出し記号は含めない／複数行は改行（LF）でつなぐ／穴埋めを入れるときは二重の角括弧（確定するまで残す。ガードの G3 が検出する）。
// notification_notice.body_no_docs の正は詳細設計 §3.10。
export const WEAVER_MESSAGES = {
    en: {
        'weaver.sso_login': 'Log in with Weaver',
        'weaver.settings.account_deletion': 'About account deletion',
        'weaver.account_deletion.title': 'About account deletion',
        'weaver.account_deletion.lead': 'Your account in this app is your organization\'s Weaver (Redmine) account.\nAccounts are issued and managed by your organization\'s administrator, and deletion is also handled through your administrator.\nYou cannot delete your account from this app. Please ask your administrator or us.',
        'weaver.account_deletion.how.title': 'How to request deletion',
        'weaver.account_deletion.how.step1': 'Ask your organization\'s Weaver administrator to delete your account.',
        'weaver.account_deletion.how.step2': 'If you cannot reach your administrator, contact Weaver support (button below).\nWe will reply within 3 business days of receiving your request.\nWe will process the request after confirming that it comes from you or from your organization\'s administrator.',
        'weaver.account_deletion.how.note1': 'Your account may be processed by both your organization\'s administrator and us.',
        'weaver.account_deletion.how.note2': 'How long deletion takes depends on the confirmation and coordination with your organization.\nWe will contact you again when it is complete.',
        'weaver.account_deletion.support_button': 'Open the support page',
        'weaver.account_deletion.data.title': 'What happens to your data',
        'weaver.account_deletion.data.account': 'Your account (sign-in, name, email address and other account information) becomes unusable and is deleted or locked.',
        'weaver.account_deletion.data.posts': 'Chat posts and attached files may remain as your organization\'s records.\n(If you want posts and files removed as well, tell us when you make your request.\nWe will review it with your organization and let you know what is possible.)',
        'weaver.account_deletion.data.workflow': 'Approval-workflow and similar records may keep your name to preserve the record.',
        'weaver.account_deletion.device.title': 'Data on your device',
        'weaver.account_deletion.device.body': 'Removing the server from this app (or signing out) deletes the data stored on this device for that server.',
        'weaver.account_deletion.link.detail': 'Details',
        'weaver.account_deletion.link.privacy': 'Privacy policy',
        'weaver.notification_notice.body_no_docs': 'Not receiving notifications? Start by sending a test notification to all your devices to check if they’re working as expected. If issues persist, please contact your administrator.',
        'weaver.settings.language': 'Language',
    },
    ja: {
        'weaver.sso_login': 'Weaverでログイン',
        'weaver.settings.account_deletion': 'アカウントの削除について',
        'weaver.account_deletion.title': 'アカウントの削除について',
        'weaver.account_deletion.lead': 'このアプリのアカウントは、ご所属の組織のWeaver（Redmine）アカウントです。\nアカウントは組織の管理者が発行・管理しており、削除も組織の管理者を通じて行います。\nこのアプリから、ご自身でアカウントを削除することはできません。管理者または当社へ依頼してください。',
        'weaver.account_deletion.how.title': '削除の依頼方法',
        'weaver.account_deletion.how.step1': 'ご所属の組織のWeaver管理者へ、アカウントの削除を依頼してください。',
        'weaver.account_deletion.how.step2': '管理者に連絡できない場合は、Weaverサポートへご連絡ください（下のボタン）。\n内容を確認のうえ、3営業日以内にご連絡します。\nご本人または所属組織の管理者からの依頼であることを確認のうえ、処理します。',
        'weaver.account_deletion.how.note1': 'アカウントの処理は、組織の管理者と当社の双方で行う場合があります。',
        'weaver.account_deletion.how.note2': '削除が完了するまでの期間は、確認や組織との調整に要する時間により異なります。\n完了時にあらためてご連絡します。',
        'weaver.account_deletion.support_button': 'サポート窓口を開く',
        'weaver.account_deletion.data.title': '処理される内容',
        'weaver.account_deletion.data.account': 'アカウント（ログイン、氏名、メールアドレス等のアカウント情報）は、ご利用できなくなり、\n削除またはロックされます。',
        'weaver.account_deletion.data.posts': 'チャットの投稿や添付ファイルは、組織の記録として残る場合があります。\n（投稿等を含めて削除したい場合は、依頼時にお知らせください。\n組織と当社で内容を確認のうえ、対応可否をご連絡します。）',
        'weaver.account_deletion.data.workflow': '承認ワークフロー等の記録には、記録の保全のため氏名が残る場合があります。',
        'weaver.account_deletion.device.title': 'お使いの端末のデータ',
        'weaver.account_deletion.device.body': 'このアプリで、サーバーの登録を削除（またはログアウト）すると、\n端末に保存されたデータを消去できます。',
        'weaver.account_deletion.link.detail': '詳細',
        'weaver.account_deletion.link.privacy': 'プライバシーポリシー',
        'weaver.notification_notice.body_no_docs': '通知が届きませんか？まず、すべての端末にテスト通知を送って、正常に届くか確認してください。解決しない場合は、管理者にお問い合わせください。',
        'weaver.settings.language': '言語',
    },
};

export type WeaverMessageKey = keyof typeof WEAVER_MESSAGES.en;

// locale が 'ja' のときだけ日本語。それ以外（'ja-JP' を含む）は英語（アプリの言語一覧が 'ja' のみのため）。
// 未知のキーは例外を投げず、キー文字列をそのまま返す。
export const getWeaverMessage = (locale: string, key: WeaverMessageKey): string => {
    const table: Record<string, string> = locale === 'ja' ? WEAVER_MESSAGES.ja : WEAVER_MESSAGES.en;
    return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key;
};

export const useWeaverMessage = (): ((key: WeaverMessageKey) => string) => {
    const {locale} = useIntl();
    return (key: WeaverMessageKey) => getWeaverMessage(locale, key);
};
