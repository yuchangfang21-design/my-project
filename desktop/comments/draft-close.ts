import type { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { record,id } from '../validation.js';
export class CommentDraftCloseGuard {
 private registered=false;private approved=false;private pending:{id:string;promise:Promise<boolean>;resolve:(ok:boolean)=>void;timer:ReturnType<typeof setTimeout>}|undefined;
 constructor(private window:BrowserWindow,private timeoutMs=5000){window.on('close',this.onClose);}
 private onClose=(event:{preventDefault():void})=>{if(this.approved||!this.registered)return;event.preventDefault();void this.request().then(ok=>{if(ok&&!this.window.isDestroyed())this.window.close();});};
 register(){this.registered=true;}
 request():Promise<boolean>{if(this.approved||!this.registered||this.window.isDestroyed())return Promise.resolve(true);if(this.pending)return this.pending.promise;const requestId=randomUUID();let resolve!:(ok:boolean)=>void;const promise=new Promise<boolean>(r=>{resolve=r;});this.pending={id:requestId,promise,resolve,timer:setTimeout(()=>this.finish(false,'保存超时，已取消退出，请检查草稿后重试'),this.timeoutMs)};this.window.webContents.send('xumu:comment-draft-flush',requestId);return promise;}
 complete(input:{requestId:string;ok:boolean}){const value=record(input,['requestId','ok']),requestId=id(value.requestId);if(typeof value.ok!=='boolean'||!this.pending||requestId!==this.pending.id)throw new Error('退出保存请求已失效');this.finish(value.ok,'草稿未保存，已取消退出');}
 private finish(ok:boolean,reason:string){const pending=this.pending;if(!pending)return;this.pending=undefined;clearTimeout(pending.timer);this.approved=ok;if(!ok&&!this.window.isDestroyed())this.window.webContents.send('xumu:comment-draft-close-canceled',{requestId:pending.id,reason});pending.resolve(ok);}
 dispose(){this.window.removeListener('close',this.onClose);this.finish(false,'窗口已关闭');}
}
