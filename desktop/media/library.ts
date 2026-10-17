import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Repository } from '../storage/repository.js';
import type { DesktopAsset, ImportReport } from '../../shared/desktop-contracts.js';
import { id } from '../validation.js';

const managedName = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const managedFile = new RegExp(`^${managedName}\\.(mp4|mov)$`);
const temporaryFile = new RegExp(`^\\.${managedName}\\.tmp$`);
type ManagedAsset = { asset: DesktopAsset; relativePath: string };

export class MediaLibrary {
  private queue: Promise<unknown> = Promise.resolve();
  private initialization?: Promise<void>;
  private closing = false;
  private abort = new AbortController();
  constructor(private dataDir: string, private repository: Repository) {}
  initialize(): Promise<void> { return this.initialization ??= this.reconcile(); }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('应用正在关闭'));
    const run = this.queue.then(work);
    this.queue = run.catch(() => undefined);
    return run;
  }
  importFiles(paths: string[]): Promise<ImportReport> {
    return this.enqueue(() => this.importBatch(paths));
  }
  checkAsset(assetId: string): Promise<void> {
    return this.enqueue(async () => {
      id(assetId); await this.initialize();
      const entry = this.repository.managedAssets().find(entry => entry.asset.id === assetId);
      if (!entry) throw new Error('素材不存在');
      const availability = await this.verify(entry);
      this.repository.setAssetAvailability(assetId, availability);
      if (availability !== 'ready') throw new Error('素材文件不可用，请重新导入原视频后重试');
    });
  }
  async close(): Promise<void> {
    this.closing = true; this.abort.abort();
    await this.initialization?.catch(() => undefined);
    await this.queue;
  }
  private managedPath(relativePath: string): string {
    const parts = relativePath.split(/[/\\]/);
    if (parts.length !== 2 || parts[0] !== 'media' || !managedFile.test(parts[1])) throw new Error('素材路径无效');
    return join(this.dataDir, 'media', parts[1]);
  }
  private async verify(entry: ManagedAsset): Promise<NonNullable<DesktopAsset['availability']>> {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      const file = this.managedPath(entry.relativePath);
      const initial = await lstat(file);
      if (initial.isSymbolicLink() || !initial.isFile()) return 'corrupt';
      handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const stat = await handle.stat(); if (!stat.isFile() || stat.ino !== initial.ino) return 'corrupt';
      const hash = createHash('sha256');
      for await (const chunk of handle.createReadStream({ autoClose: false, signal: this.abort.signal })) hash.update(chunk);
      const after = await handle.stat();
      return after.size === stat.size && after.mtimeMs === stat.mtimeMs && hash.digest('hex') === entry.asset.sha256 ? 'ready' : 'corrupt';
    } catch (error) {
      if (this.closing) throw new Error('应用正在关闭');
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'corrupt';
    } finally { await handle?.close().catch(() => undefined); }
  }
  private async reconcile(): Promise<void> {
    const mediaDir = join(this.dataDir, 'media'); await mkdir(mediaDir, { recursive: true });
    if ((await lstat(mediaDir)).isSymbolicLink() || await realpath(mediaDir) !== join(await realpath(this.dataDir), 'media')) throw new Error('素材目录不安全');
    const entries = this.repository.managedAssets();
    const referenced = new Set(entries.map(entry => this.managedPath(entry.relativePath)));
    // Only this application's UUID names are eligible for recovery cleanup.
    // The main process holds the user-data instance lock before this runs.
    for (const name of await readdir(mediaDir)) {
      if (this.closing) throw new Error('应用正在关闭');
      const file = join(mediaDir, name);
      if (temporaryFile.test(name) || (managedFile.test(name) && !referenced.has(file))) await unlink(file);
    }
    for (const entry of entries) this.repository.setAssetAvailability(entry.asset.id, await this.verify(entry));
  }
  private async importBatch(paths: string[]): Promise<ImportReport> {
    const result: ImportReport = { added: 0, repaired: 0, duplicates: 0, failures: [] };
    if (!Array.isArray(paths) || paths.length > 100) throw new Error('每次最多导入 100 个视频');
    await this.initialize(); const mediaDir = join(this.dataDir, 'media');
    for (const path of paths) {
      if (this.closing) break;
      let temp: string | undefined, owned: string | undefined;
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        if (typeof path !== 'string' || !['.mp4','.mov'].includes(extname(path).toLowerCase())) throw new Error('只支持 MP4 或 MOV');
        const initial = await lstat(path);
        if (initial.isSymbolicLink() || !initial.isFile() || await realpath(dirname(path)) !== resolve(dirname(path))) throw new Error('不允许符号链接或非普通文件');
        handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        const stat = await handle.stat(); if (initial.ino !== stat.ino || !stat.isFile() || stat.size < 12) throw new Error('文件为空或内容无效');
        const header = Buffer.alloc(12); await handle.read(header,0,12,0);
        if (!['ftyp','moov','mdat','wide','free','skip'].includes(header.toString('ascii',4,8))) throw new Error('未识别到 MP4/MOV 容器头');
        const assetId = randomUUID(); const extension = extname(path).toLowerCase();
        temp = join(mediaDir, `.${assetId}.tmp`); const final = join(mediaDir, `${assetId}${extension}`);
        const hash = createHash('sha256');
        await pipeline(handle.createReadStream({ start:0, autoClose:false }), new Transform({ transform(chunk, _encoding, callback) { hash.update(chunk); callback(null,chunk); } }), createWriteStream(temp,{ flags:'wx',mode:0o600 }), { signal: this.abort.signal });
        const after = await handle.stat(); if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error('复制过程中源文件发生变化，请重新导入');
        const sha256 = hash.digest('hex');
        const existing = this.repository.assetByHash(sha256);
        const previous = existing && this.repository.managedAssets().find(entry => entry.asset.id === existing.id);
        if (previous && await this.verify(previous) === 'ready') { await unlink(temp);temp=undefined;this.repository.setAssetAvailability(previous.asset.id,'ready');result.duplicates++;continue; }
        await rename(temp,final);temp=undefined;owned=final;
        if (previous) {
          this.repository.setAssetAvailability(previous.asset.id,'ready',join('media',`${assetId}${extension}`));
          owned=undefined;await unlink(this.managedPath(previous.relativePath)).catch(()=>undefined);result.repaired++;continue;
        }
        const asset: DesktopAsset = { id:assetId,title:basename(path,extname(path)).slice(0,100),filename:basename(path),poster:'poster',tag:'本地导入',duration:'未分析',size:`${(stat.size/1024/1024).toFixed(1)} MB`,imported:true,sha256,availability:'ready' };
        this.repository.addAsset(asset,join('media',`${assetId}${extension}`));owned=undefined;result.added++;
      } catch (error) { result.failures.push({filename:typeof path==='string'?basename(path):'未知文件',reason:error instanceof Error?error.message:'导入失败'}); }
      finally { await handle?.close().catch(()=>undefined);if(temp)await unlink(temp).catch(()=>undefined);if(owned)await unlink(owned).catch(()=>undefined); }
    }
    return result;
  }
}
