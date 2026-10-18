import type Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const taskTable = (name: string) => 'CREATE TABLE ' + name + "(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), asset_id TEXT NOT NULL REFERENCES assets(id), status TEXT NOT NULL CHECK(status IN ('pending','waiting_login','running','submitted','published','rejected','failed','review','cancelled')), data TEXT NOT NULL)";
const publishingTables = [
  'CREATE TABLE publish_batches(id TEXT PRIMARY KEY, review_id TEXT NOT NULL UNIQUE, data TEXT NOT NULL)',
  "CREATE TABLE publish_attempts(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), batch_id TEXT NOT NULL REFERENCES publish_batches(id), phase TEXT NOT NULL CHECK(phase IN ('reserved','preparing','submit_intent','finished')), outcome TEXT NOT NULL CHECK(outcome IN ('none','not_submitted','submitted','review')), data TEXT NOT NULL)",
  "CREATE UNIQUE INDEX active_attempt ON publish_attempts(task_id) WHERE phase!='finished'",
  "CREATE TABLE publish_manual_checks(id INTEGER PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), attempt_id TEXT NOT NULL REFERENCES publish_attempts(id), result TEXT NOT NULL CHECK(result IN ('found','not_found')), note TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE UNIQUE INDEX unfinished_task ON tasks(account_id,asset_id) WHERE status IN ('pending','waiting_login','running','submitted','review')",
].join(';');

export function migrateDatabase(db: Database.Database, dataDir: string): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version > 2) throw new Error('数据库来自较新版本，请使用对应版本的序幕。');
  if (version === 2) return;
  if (db.inTransaction) throw new Error('数据库迁移不能嵌套在事务中');
  if (version === 0) {
    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length) throw new Error('无法识别数据库结构');
    db.transaction(() => {
      db.exec('CREATE TABLE accounts(id TEXT PRIMARY KEY,data TEXT NOT NULL,connection TEXT NOT NULL);CREATE TABLE assets(id TEXT PRIMARY KEY,sha256 TEXT NOT NULL UNIQUE,relative_path TEXT NOT NULL,data TEXT NOT NULL);' + taskTable('tasks'));
      db.exec('CREATE TABLE task_events(id INTEGER PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),event TEXT NOT NULL,created_at TEXT NOT NULL,attempt_id TEXT,kind TEXT NOT NULL DEFAULT \'legacy\');' + publishingTables);
      db.pragma('user_version=2');
    })();
    return;
  }
  // serialize() reads a consistent SQLite snapshot, including committed WAL data.
  writeFileSync(join(dataDir,'workspace-backup-' + randomUUID() + '.sqlite'),db.serialize(),{ mode:0o600,flag:'wx' });
  db.pragma('foreign_keys=OFF');
  try {
    db.transaction(() => {
      db.exec(taskTable('tasks_v2'));
      const insert = db.prepare('INSERT INTO tasks_v2 VALUES(?,?,?,?,?)');
      for (const row of db.prepare('SELECT * FROM tasks').all() as any[]) {
        const asset = db.prepare('SELECT sha256 FROM assets WHERE id=?').get(row.asset_id) as any;
        if (!asset) throw new Error('旧任务引用了不存在的素材');
        const task = { ...JSON.parse(row.data), revision:1, description:'', tags:[], assetSha256:asset.sha256 };
        insert.run(row.id,row.account_id,row.asset_id,row.status,JSON.stringify(task));
      }
      db.exec('DROP TABLE tasks;ALTER TABLE tasks_v2 RENAME TO tasks');
      db.exec("ALTER TABLE task_events ADD COLUMN attempt_id TEXT;ALTER TABLE task_events ADD COLUMN kind TEXT NOT NULL DEFAULT 'legacy';" + publishingTables);
      if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('数据库引用不完整，迁移已回滚');
      db.pragma('user_version=2');
    })();
  } finally { db.pragma('foreign_keys=ON'); }
}
