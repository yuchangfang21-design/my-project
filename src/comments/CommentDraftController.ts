import type { DesktopApi } from '../../shared/desktop-contracts';
import type { CommentDraft } from '../../shared/comments-contracts';
type Entry={text:string;savedText:string;revision:number;error:string;pending?:Promise<void>};
export type DraftSnapshot={commentId:string|null;text:string;revision:number;dirty:boolean;saving:boolean;error:string;closing:boolean};
export class CommentDraftController {
 private entries=new Map<string,Entry>(); private active:string|null=null; private ticket=0; private listeners=new Set<()=>void>(); private timer:ReturnType<typeof setTimeout>|undefined;private closing=false;
 private value:DraftSnapshot={commentId:null,text:'',revision:0,dirty:false,saving:false,error:'',closing:false};
 constructor(private api:Pick<DesktopApi,'getCommentDetails'|'saveCommentDraft'>){}
 snapshot=():DraftSnapshot=>this.value;
 subscribe=(listener:()=>void):(()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private publish(){const e=this.active?this.entries.get(this.active):undefined;this.value={commentId:this.active,text:e?.text??'',revision:e?.revision??0,dirty:!!e&&e.text!==e.savedText,saving:!!e?.pending,error:e?.error??'',closing:this.closing};for(const listener of this.listeners)listener();}
 private entry(d:CommentDraft):Entry{return{text:d.text,savedText:d.text,revision:d.revision,error:''};}
 setClosing(value:boolean){this.closing=value;this.publish();}
 edit(text:string){if(!this.active||this.closing)return;this.entries.get(this.active)!.text=text;this.publish();clearTimeout(this.timer);const id=this.active;this.timer=setTimeout(()=>{void this.save(id).catch(()=>undefined);},500);}
 private save(id:string):Promise<void>{const e=this.entries.get(id)!;if(e.pending)return e.pending;if(e.text===e.savedText)return Promise.resolve();const text=e.text,revision=e.revision;
  const work=Promise.resolve().then(()=>this.api.saveCommentDraft({commentId:id,expectedRevision:revision,text})).then(d=>{e.savedText=d.text;e.revision=d.revision;e.error='';}).catch(error=>{e.error=error instanceof Error?error.message:String(error);throw error;}).finally(()=>{e.pending=undefined;this.publish();if(e.text!==e.savedText&&!e.error){clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.save(id).catch(()=>undefined);},500);}});e.pending=work;this.publish();return work;
 }
 async flush(){clearTimeout(this.timer);if(this.active)await this.flushEntry(this.active);}
 private async flushEntry(id:string){const e=this.entries.get(id)!;if(e.pending)await e.pending;while(e.text!==e.savedText)await this.save(id);}
 async flushAll(){clearTimeout(this.timer);for(const id of this.entries.keys())await this.flushEntry(id);}
 async load(id:string){const ticket=++this.ticket;await this.flush();if(ticket!==this.ticket)return;const details=await this.api.getCommentDetails(id);if(ticket!==this.ticket)return;await this.flush();if(ticket!==this.ticket)return;const current=this.entries.get(id);if(!current||details.draft.revision>=current.revision)this.entries.set(id,this.entry(details.draft));this.active=id;this.publish();}
 async reload(){if(!this.active)return;const id=this.active,ticket=++this.ticket,e=this.entries.get(id)!;await e.pending?.catch(()=>undefined);const details=await this.api.getCommentDetails(id);if(ticket!==this.ticket)return;this.entries.set(id,this.entry(details.draft));this.publish();}
 dispose(){clearTimeout(this.timer);this.listeners.clear();this.ticket++;}
}
