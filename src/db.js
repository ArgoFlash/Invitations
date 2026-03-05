const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'invitations.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS invites (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    total    INTEGER DEFAULT 0,
    active   INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  )
`);

const stmts = {
  upsert: db.prepare(`
    INSERT INTO invites (guild_id, user_id, total, active)
    VALUES (@guildId, @userId, @total, @active)
    ON CONFLICT(guild_id, user_id)
    DO UPDATE SET total = @total, active = @active
  `),

  getUser: db.prepare(`
    SELECT user_id AS userId, total, active
    FROM invites
    WHERE guild_id = ? AND user_id = ?
  `),

  leaderboard: db.prepare(`
    SELECT user_id AS userId, total, active
    FROM invites
    WHERE guild_id = ?
    ORDER BY total DESC, active DESC
    LIMIT ?
  `),

  topInviter: db.prepare(`
    SELECT user_id AS userId, total, active
    FROM invites
    WHERE guild_id = ?
    ORDER BY total DESC, active DESC
    LIMIT 1
  `),
};

function upsertInvites(guildId, userId, total, active) {
  stmts.upsert.run({ guildId, userId, total, active });
}

function getLeaderboard(guildId, limit = 10) {
  return stmts.leaderboard.all(guildId, limit);
}

function getTopInviter(guildId) {
  return stmts.topInviter.get(guildId) ?? null;
}

function getUserInvites(guildId, userId) {
  return stmts.getUser.get(guildId, userId) ?? null;
}

module.exports = { db, upsertInvites, getLeaderboard, getTopInviter, getUserInvites };
