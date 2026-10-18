import type{Page}from'playwright-core';
import type{Identity}from'../../shared/desktop-contracts.js';
import type{CommentRecordInput}from'../../shared/comments-contracts.js';
export type CommentObservation={identity:Identity|null;canRead:boolean;canReply:boolean;version:string;reason?:string};
export type CommentPage={comments:CommentRecordInput[];nextCursor:string|null;coverage:'partial'|'end'};
export interface CommentsAdapter{
 observe(page:Page):Promise<CommentObservation>;
 readComments(page:Page,cursor:string|null,signal:AbortSignal):Promise<CommentPage>;
}
export class UnverifiedCommentsAdapter implements CommentsAdapter{
 async observe(_page:Page):Promise<CommentObservation>{return{identity:null,canRead:false,canReply:false,version:'unverified',reason:'评论读取和回复接入待验证'};}
 async readComments(_page:Page,_cursor:string|null,_signal:AbortSignal):Promise<CommentPage>{throw new Error('评论读取接入待验证');}
}
