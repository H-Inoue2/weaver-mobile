// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-172/R1 テスト補助: 端末DB（WatermelonDB。TestHelper.setupServerDatabase の後）に、規則表 R の行を作る。
// jestの既定testMatchは .ts/.tsx を全部拾うため .cjs。別名（@test 等）は使えないので、TestHelper・DBはテストから渡す。
// MyChannel の件数・未読は、ハンドラが総数から計算し直すため、作成後にモデルを直接更新して「規則表の値」にする。

// 一度も開いていない行（B8）でない既存の行は、開いたことがある値（正）で置く。TestHelper の既定は 0 で、R3 以後は「一度も開いていない」と読まれるため。
const OPENED = 1700000000000;

/**
 * spec: {id, type='O', name, teamId, isUnread, messageCount, mentionsCount, notifyProps, deleteAt=0}
 *  lastViewedAt: my_channel.last_viewed_at（K-172/R3 B8。既定は「開いたことがある」＝正の値。0 以下で「一度も開いていない」）
 *  notifyProps: MyChannelSettings.notify_props（ミュートは mark_unread:'mention'、B7 は push:'mention'|'none'）
 * 戻り: 作った MyChannel モデル
 */
async function seedChannel({database, operator, helper, userId, teamId}, spec) {
    const {id, type = 'O', name = id, isUnread = false, messageCount = 0, mentionsCount = 0, notifyProps = {}, deleteAt = 0, lastViewedAt = OPENED} = spec;
    const channel = helper.fakeChannel({id, name, display_name: name, type, team_id: type === 'D' || type === 'G' ? '' : (spec.teamId || teamId), delete_at: deleteAt});
    await operator.handleChannel({channels: [channel], prepareRecordsOnly: false});
    const member = helper.fakeMyChannel({channel_id: id, user_id: userId});
    const [myChannel] = await operator.handleMyChannel({channels: [channel], myChannels: [member], prepareRecordsOnly: false});
    await operator.handleMyChannelSettings({
        settings: [{...helper.fakeMyChannelSettings(userId, id), notify_props: {desktop: 'default', email: 'default', mark_unread: 'all', push: 'default', ...notifyProps}}],
        prepareRecordsOnly: false,
    });
    await setCounts(database, operator, id, {isUnread, messageCount, mentionsCount, lastViewedAt});
    return myChannel;
}

async function setCounts(database, operator, channelId, {isUnread, messageCount, mentionsCount, lastViewedAt}) {
    const mc = await database.get('MyChannel').find(channelId);
    mc.prepareUpdate((m) => {
        if (isUnread !== undefined) {
            m.isUnread = isUnread;
        }
        if (messageCount !== undefined) {
            m.messageCount = messageCount;
        }
        if (mentionsCount !== undefined) {
            m.mentionsCount = mentionsCount;
        }
        if (lastViewedAt !== undefined) {
            m.lastViewedAt = lastViewedAt;
        }
    });
    await operator.batchRecords([mc], 'k172_seed');
}

module.exports = {seedChannel, setCounts};
