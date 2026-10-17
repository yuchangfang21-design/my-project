import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Repository } from '../storage/repository.js';
import type { DesktopAsset, ImportReport } from '../../shared/desktop-contracts.js';

export class MediaLibrary {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private dataDir: string, private repository: Repository) {}
  importFiles(paths: string[]): Promise<ImportReport> {
    const run = this.queue.then(() => this.importBatch(paths));
    this.queue = run.catch(() => undefined); return run;
  }
  private async importBatch(paths: string[]): Promise<ImportReport> {
    const result: ImportReport = { added: 0, duplicates: 0, failures: [] };
    if (!Array.isArray(paths) || paths.length > 100) throw new Error('每次最多导入 100 个视频');
    const mediaDir = join(this.dataDir, 'media'); await mkdir(mediaDir, { recursive: true });
    if ((await lstat(mediaDir)).isSymbolicLink() || await realpath(mediaDir) !== join(await realpath(this.dataDir), 'media')) throw new Error('素材目录不安全');
    for (const path of paths) {
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
        await pipeline(handle.createReadStream({ start:0, autoClose:false }), new Transform({ transform(chunk, _encoding, callback) { hash.update(chunk); callback(null,chunk); } }), createWriteStream(temp,{ flags:'wx',mode:0o600 }));
        const after = await handle.stat(); if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error('复制过程中源文件发生变化，请重新导入');
        const sha256 = hash.digest('hex');
        if (this.repository.assetByHash(sha256)) { await unlink(temp);temp=undefined;result.duplicates++;continue; }
        await rename(temp,final);temp=undefined;owned=final;
        const asset: DesktopAsset = { id:assetId,title:basename(path,extname(path)).slice(0,100),filename:basename(path),poster:'poster',tag:'本地导入',duration:'未分析',size:`${(stat.size/1024/1024).toFixed(1)} MB`,imported:true,sha256 };
        this.repository.addAsset(asset,join('media',`${assetId}${extension}`));owned=undefined;result.added++;
      } catch (error) { result.failures.push({filename:typeof path==='string'?basename(path):'未知文件',reason:error instanceof Error?error.message:'导入失败'}); }
      finally { await handle?.close().catch(()=>undefined);if(temp)await unlink(temp).catch(()=>undefined);if(owned)await unlink(owned).catch(()=>undefined); }
    }
    return result;
  }
}
