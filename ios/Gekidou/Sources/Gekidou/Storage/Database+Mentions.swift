import Foundation
import SQLite

extension Database {
    public func getTotalMentions() -> Int {
        let serverUrls = getAllActiveServerUrls()
        var mentions = 0
        for serverUrl in serverUrls {
            if let db = try? getDatabaseForServer(serverUrl) {
                mentions += (getChannelMentions(db) + getThreadMentions(db))
            }
        }
        
        return mentions
    }
    
    // Modified for Weaver (K-172, 2026-11): ordinary (O/P) unread channels count as max(message_count, mentions_count), except where the channel's push setting is explicitly "mention" or "none" (mentions only). Mirrors app/weaver/unread_badge.ts getBadgeTermForChannel.
    public func getChannelMentions(_ db: Connection) -> Int {
        let stmtString = """
        SELECT SUM(CASE WHEN c.type IN ('O','P') AND my.is_unread = 1 \
        AND mys.notify_props NOT LIKE '%"push":"mention"%' \
        AND mys.notify_props NOT LIKE '%"push":"none"%' \
        THEN MAX(my.message_count, my.mentions_count) ELSE my.mentions_count END) \
        FROM MyChannel my \
        INNER JOIN MyChannelSettings mys ON mys.id=my.id \
        INNER JOIN Channel c INDEXED BY sqlite_autoindex_Channel_1 ON c.id=my.id \
        WHERE c.delete_at = 0 AND mys.notify_props NOT LIKE '%"mark_unread":"mention"%'
        """
        // SUM of integer terms comes back as Int64; accept Double as well (the previous query's type).
        let value = try? db.scalar(stmtString)
        if let intValue = value as? Int64 {
            return Int(intValue)
        }
        if let doubleValue = value as? Double {
            return Int(doubleValue)
        }
        return 0
    }

    public func getThreadMentions(_ db: Connection) -> Int {
        let stmtString = """
        SELECT SUM(t.unread_mentions) \
        FROM Thread t \
        INNER JOIN Post p INDEXED BY Post_channel_id ON t.id=p.id \
        INNER JOIN Channel c ON p.channel_id=c.id \
        INNER JOIN MyChannelSettings mys ON mys.id=c.id \
        WHERE c.delete_at = 0 AND mys.notify_props NOT LIKE '%"mark_unread":"mention"%'
        """
        let mentions = try? db.scalar(stmtString) as? Double
        return Int(mentions ?? 0)
    }
    
    public func resetMyChannelMentions(_ serverUrl: String, _ channelId: String) throws {
        if let db = try? getDatabaseForServer(serverUrl) {
            let idCol = Expression<String>("id")
            let mentionsCol = Expression<Int>("mentions_count")
            let urgentMentionsCol = Expression<Int>("urgent_mention_count")
            let msgCol = Expression<Int>("message_count")
            let isUnreadCol = Expression<Bool>("is_unread")
            if hasMyChannel(db, channelId: channelId) {
                var updateSetters: [Setter] = [
                    mentionsCol <- 0,
                    msgCol <- 0,
                    isUnreadCol <- false,
                ]
                if hasMyChannelUrgentMentionCountColumn(db) {
                    updateSetters.append(urgentMentionsCol <- 0)
                }
                let updateQuery = myChannelTable
                    .where(idCol == channelId)
                    .update(updateSetters)
                let _ = try db.run(updateQuery)
            }
        }
    }
    
    public func resetThreadMentions(_ serverUrl: String, _ rootId: String) throws {
        if let db = try? getDatabaseForServer(serverUrl) {
            let idCol = Expression<String>("id")
            let mentionsCol = Expression<Int>("unread_mentions")
            let msgCol = Expression<Int>("unread_replies")
            if hasThread(db, threadId: rootId) {
                let updateQuery = threadTable
                    .where(idCol == rootId)
                    .update(mentionsCol <- 0, msgCol <- 0)
                let _ = try db.run(updateQuery)
            }
        }
    }
}
