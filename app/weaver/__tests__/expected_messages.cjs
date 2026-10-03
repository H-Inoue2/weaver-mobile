// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// 文言の期待値（正は運用設計 K39_アカウント削除_運用設計_v0.1.md §7.1（ja）・§7.2（en）、body_no_docs は詳細設計 §3.10）。
// messages.test.tsx と account_deletion.test.tsx が共有する（二重管理を避ける）。

const KEYS = [
    'weaver.sso_login',
    'weaver.settings.account_deletion',
    'weaver.account_deletion.title',
    'weaver.account_deletion.lead',
    'weaver.account_deletion.how.title',
    'weaver.account_deletion.how.step1',
    'weaver.account_deletion.how.step2',
    'weaver.account_deletion.how.note1',
    'weaver.account_deletion.how.note2',
    'weaver.account_deletion.support_button',
    'weaver.account_deletion.data.title',
    'weaver.account_deletion.data.account',
    'weaver.account_deletion.data.posts',
    'weaver.account_deletion.data.workflow',
    'weaver.account_deletion.device.title',
    'weaver.account_deletion.device.body',
    'weaver.account_deletion.link.detail',
    'weaver.account_deletion.link.privacy',
    'weaver.notification_notice.body_no_docs',
    'weaver.settings.language',
];

const JA = {
    'weaver.sso_login': 'Weaverでログイン',
    'weaver.settings.account_deletion': 'アカウントの削除について',
    'weaver.account_deletion.title': 'アカウントの削除について',
    'weaver.account_deletion.lead': [
        'このアプリのアカウントは、ご所属の組織のWeaver（Redmine）アカウントです。',
        'アカウントは組織の管理者が発行・管理しており、削除も組織の管理者を通じて行います。',
        'このアプリから、ご自身でアカウントを削除することはできません。管理者または当社へ依頼してください。',
    ].join('\n'),
    'weaver.account_deletion.how.title': '削除の依頼方法',
    'weaver.account_deletion.how.step1': 'ご所属の組織のWeaver管理者へ、アカウントの削除を依頼してください。',
    'weaver.account_deletion.how.step2': [
        '管理者に連絡できない場合は、Weaverサポートへご連絡ください（下のボタン）。',
        '内容を確認のうえ、3営業日以内にご連絡します。',
        'ご本人または所属組織の管理者からの依頼であることを確認のうえ、処理します。',
    ].join('\n'),
    'weaver.account_deletion.how.note1': 'アカウントの処理は、組織の管理者と当社の双方で行う場合があります。',
    'weaver.account_deletion.how.note2': [
        '削除が完了するまでの期間は、確認や組織との調整に要する時間により異なります。',
        '完了時にあらためてご連絡します。',
    ].join('\n'),
    'weaver.account_deletion.support_button': 'サポート窓口を開く',
    'weaver.account_deletion.data.title': '処理される内容',
    'weaver.account_deletion.data.account': [
        'アカウント（ログイン、氏名、メールアドレス等のアカウント情報）は、ご利用できなくなり、',
        '削除またはロックされます。',
    ].join('\n'),
    'weaver.account_deletion.data.posts': [
        'チャットの投稿や添付ファイルは、組織の記録として残る場合があります。',
        '（投稿等を含めて削除したい場合は、依頼時にお知らせください。',
        '組織と当社で内容を確認のうえ、対応可否をご連絡します。）',
    ].join('\n'),
    'weaver.account_deletion.data.workflow': '承認ワークフロー等の記録には、記録の保全のため氏名が残る場合があります。',
    'weaver.account_deletion.device.title': 'お使いの端末のデータ',
    'weaver.account_deletion.device.body': [
        'このアプリで、サーバーの登録を削除（またはログアウト）すると、',
        '端末に保存されたデータを消去できます。',
    ].join('\n'),
    'weaver.account_deletion.link.detail': '詳細',
    'weaver.account_deletion.link.privacy': 'プライバシーポリシー',
    'weaver.settings.language': '言語',
    'weaver.notification_notice.body_no_docs': '通知が届きませんか？まず、すべての端末にテスト通知を送って、正常に届くか確認してください。解決しない場合は、管理者にお問い合わせください。',
};

const EN = {
    'weaver.sso_login': 'Log in with Weaver',
    'weaver.settings.account_deletion': 'About account deletion',
    'weaver.account_deletion.title': 'About account deletion',
    'weaver.account_deletion.lead': [
        'Your account in this app is your organization\'s Weaver (Redmine) account.',
        'Accounts are issued and managed by your organization\'s administrator, and deletion is also handled through your administrator.',
        'You cannot delete your account from this app. Please ask your administrator or us.',
    ].join('\n'),
    'weaver.account_deletion.how.title': 'How to request deletion',
    'weaver.account_deletion.how.step1': 'Ask your organization\'s Weaver administrator to delete your account.',
    'weaver.account_deletion.how.step2': [
        'If you cannot reach your administrator, contact Weaver support (button below).',
        'We will reply within 3 business days of receiving your request.',
        'We will process the request after confirming that it comes from you or from your organization\'s administrator.',
    ].join('\n'),
    'weaver.account_deletion.how.note1': 'Your account may be processed by both your organization\'s administrator and us.',
    'weaver.account_deletion.how.note2': [
        'How long deletion takes depends on the confirmation and coordination with your organization.',
        'We will contact you again when it is complete.',
    ].join('\n'),
    'weaver.account_deletion.support_button': 'Open the support page',
    'weaver.account_deletion.data.title': 'What happens to your data',
    'weaver.account_deletion.data.account': 'Your account (sign-in, name, email address and other account information) becomes unusable and is deleted or locked.',
    'weaver.account_deletion.data.posts': [
        'Chat posts and attached files may remain as your organization\'s records.',
        '(If you want posts and files removed as well, tell us when you make your request.',
        'We will review it with your organization and let you know what is possible.)',
    ].join('\n'),
    'weaver.account_deletion.data.workflow': 'Approval-workflow and similar records may keep your name to preserve the record.',
    'weaver.account_deletion.device.title': 'Data on your device',
    'weaver.account_deletion.device.body': 'Removing the server from this app (or signing out) deletes the data stored on this device for that server.',
    'weaver.account_deletion.link.detail': 'Details',
    'weaver.account_deletion.link.privacy': 'Privacy policy',
    'weaver.settings.language': 'Language',
    'weaver.notification_notice.body_no_docs': 'Not receiving notifications? Start by sending a test notification to all your devices to check if they’re working as expected. If issues persist, please contact your administrator.',
};


module.exports = {KEYS, JA, EN};
