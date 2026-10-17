import Database from 'better-sqlite3';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CreateAccountInput, CreateTasksInput, DesktopAccount, DesktopAsset, DesktopTask, WorkspaceSnapshot, LoginObservation } from '../../shared/desktop-contracts.js';
import { id, record, text } from '../validation.js';

export class Repository {
  private db!: Database.Database;
  readonly file: string;
  constructor(readonly dataDir: string) { mkdirSync(dataDir, { recursive: true }); this.file = join(dataDir, 'workspace.sqlite'); }
  initialize(): void {
    if (this.db) return;
    if (existsSync(this.file)) {
      const check = new Database(this.file, { readonly: true, fileMustExist: true });
      try {
        const version = check.pragma('user_version', { simple: true }) as number;
        if (version > 1) throw new Error('数据库来自较新版本，原文件已保留，请使用对应版本的序幕。');
        if (version === 0 && (check.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length)) {
          const backup = join(this.dataDir, `workspace-backup-${randomUUID()}.sqlite`);
          writeFileSync(backup, check.serialize());
          throw new Error('无法识别旧数据库结构，已保留原文件并建立备份。');
        }
      } finally { check.close(); }
    }
    this.db = new Database(this.file);
    try {
      this.db.pragma('foreign_keys=ON');
      if (this.db.pragma('user_version', { simple: true }) === 0) this.db.transaction(() => {
        this.db.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY, data TEXT NOT NULL, connection TEXT NOT NULL);
          CREATE TABLE assets(id TEXT PRIMARY KEY, sha256 TEXT NOT NULL UNIQUE, relative_path TEXT NOT NULL, data TEXT NOT NULL);
          CREATE TABLE tasks(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), asset_id TEXT NOT NULL REFERENCES assets(id), status TEXT NOT NULL CHECK(status IN ('pending','cancelled')), data TEXT NOT NULL);
          CREATE UNIQUE INDEX unfinished_task ON tasks(account_id, asset_id) WHERE status='pending';
          CREATE TABLE task_events(id INTEGER PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), event TEXT NOT NULL, created_at TEXT NOT NULL);
          PRAGMA user_version=1;`);
      })();
      this.db.prepare('SELECT id FROM accounts LIMIT 0').all();
      this.db.pragma('journal_mode=WAL');
    } catch (error) { this.db.close(); throw error; }
  }
  snapshot(): WorkspaceSnapshot {
    return this.db.transaction(() => ({ version: 1 as const, accounts: this.db.prepare('SELECT data,connection FROM accounts ORDER BY rowid').all().map((row: any) => {
      const data = JSON.parse(row.data); const connection: LoginObservation = JSON.parse(row.connection);
      return { ...data, loginStatus: connection.status, ...(connection.identity ? { identity: connection.identity } : {}) };
    }), assets: this.db.prepare('SELECT data FROM assets ORDER BY rowid DESC').all().map((row: any) => JSON.parse(row.data)), tasks: this.db.prepare('SELECT data,status FROM tasks ORDER BY rowid DESC').all().map((row: any) => ({ ...JSON.parse(row.data), status: row.status })), messages: [] as [] }))();
  }
  createAccount(input: CreateAccountInput): DesktopAccount {
    const data = record(input, ['name','handle','group']);
    const name = text(data.name, '账号名称', 30), handle = text(data.handle, '抖音号', 50, true), group = text(data.group, '分组', 30);
    const account: DesktopAccount = { id: randomUUID(), name, handle, group, color: ['olive','peach','lavender','blue'][this.snapshot().accounts.length % 4], initial: Array.from(name)[0], demo: false, followers: '—', loginStatus: 'not_logged_in' };
    this.db.prepare('INSERT INTO accounts VALUES (?,?,?)').run(account.id, JSON.stringify(account), JSON.stringify({ accountId: account.id, status: 'not_logged_in' }));
    return account;
  }
  getAccount(accountId: string): DesktopAccount | undefined { return this.snapshot().accounts.find(a => a.id === id(accountId)); }
  getConnection(accountId: string): LoginObservation {
    const row = this.db.prepare('SELECT connection FROM accounts WHERE id=?').get(id(accountId)) as any;
    if (!row) throw new Error('账号不存在'); return JSON.parse(row.connection);
  }
  recordConnection(observation: LoginObservation): void {
    if (!this.getAccount(observation.accountId)) throw new Error('账号不存在');
    this.db.prepare('UPDATE accounts SET connection=? WHERE id=?').run(JSON.stringify(observation), observation.accountId);
  }
  createTasks(input: CreateTasksInput): DesktopTask[] {
    const data = record(input, ['assetId','accountIds','title']); const assetId = id(data.assetId), title = text(data.title, '作品标题', 100);
    if (!Array.isArray(data.accountIds) || !data.accountIds.length || data.accountIds.length > 100) throw new Error('请选择 1—100 个账号');
    const accountIds = Array.from(new Set(data.accountIds.map(id)));
    return this.db.transaction(() => {
      const assetRow = this.db.prepare('SELECT data FROM assets WHERE id=?').get(assetId) as any;
      if (!assetRow) throw new Error('素材不存在');
      const availability = JSON.parse(assetRow.data).availability;
      if (availability && availability !== 'ready') throw new Error('素材文件不可用，请重新导入原视频后重试');
      for (const accountId of accountIds) if (!this.getAccount(accountId)) throw new Error('账号不存在');
      const tasks: DesktopTask[] = [];
      for (const accountId of accountIds) {
        if (this.db.prepare("SELECT id FROM tasks WHERE account_id=? AND asset_id=? AND status='pending'").get(accountId, assetId)) continue;
        const task: DesktopTask = { id: randomUUID(), accountId, assetId, title, status: 'pending', time: '手动执行' };
        this.db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?)').run(task.id, accountId, assetId, task.status, JSON.stringify(task));
        this.db.prepare('INSERT INTO task_events(task_id,event,created_at) VALUES (?,?,?)').run(task.id, '创建本地任务', new Date().toISOString()); tasks.push(task);
      }
      if (!tasks.length) throw new Error('已有未完成任务，请勿重复创建');
      return tasks;
    })();
  }
  cancelTask(taskId: string): void {
    id(taskId); if (!this.db.prepare('SELECT id FROM tasks WHERE id=?').get(taskId)) throw new Error('任务不存在');
    this.db.transaction(() => { this.db.prepare("UPDATE tasks SET status='cancelled' WHERE id=?").run(taskId); this.db.prepare('INSERT INTO task_events(task_id,event,created_at) VALUES(?,?,?)').run(taskId,'用户取消',new Date().toISOString()); })();
  }
  assetByHash(hash: string): DesktopAsset | undefined { const row = this.db.prepare('SELECT data FROM assets WHERE sha256=?').get(hash) as any; return row ? JSON.parse(row.data) : undefined; }
  managedAssets(): { asset: DesktopAsset; relativePath: string }[] {
    return this.db.prepare('SELECT data,relative_path FROM assets').all().map((row: any) => ({ asset: JSON.parse(row.data), relativePath: row.relative_path }));
  }
  setAssetAvailability(assetId: string, availability: NonNullable<DesktopAsset['availability']>, relativePath?: string): void {
    this.db.transaction(() => {
      const row = this.db.prepare('SELECT data FROM assets WHERE id=?').get(id(assetId)) as any;
      if (!row) throw new Error('素材不存在');
      const asset = { ...JSON.parse(row.data), availability };
      if (relativePath) this.db.prepare('UPDATE assets SET data=?,relative_path=? WHERE id=?').run(JSON.stringify(asset), relativePath, assetId);
      else this.db.prepare('UPDATE assets SET data=? WHERE id=?').run(JSON.stringify(asset), assetId);
    })();
  }
  addAsset(asset: DesktopAsset, relativePath: string): void { this.db.prepare('INSERT INTO assets VALUES (?,?,?,?)').run(asset.id, asset.sha256, relativePath, JSON.stringify(asset)); }
  updateAsset(assetId: string, input: { title: string; tag: string }): DesktopAsset {
    const data = record(input, ['title','tag']); const title = text(data.title,'作品标题',100), tag = text(data.tag,'分类',30);
    const row = this.db.prepare('SELECT data FROM assets WHERE id=?').get(id(assetId)) as any; if (!row) throw new Error('素材不存在');
    const asset = { ...JSON.parse(row.data), title, tag }; this.db.prepare('UPDATE assets SET data=? WHERE id=?').run(JSON.stringify(asset),assetId); return asset;
  }
  close(): void { if (this.db?.open) this.db.close(); }
}
