import type{Page}from'playwright-core';
import type{Identity}from'../../shared/desktop-contracts.js';
import type{CommentRecordInput,CommentReplyReview,CommentReplyReceipt,CommentRecord}from'../../shared/comments-contracts.js';
import type{CommentReplyAttempt}from'./store.js';
export type CommentObservation={identity:Identity|null;canRead:boolean;canReply:boolean;version:string;reason?:string};
export type CommentPage={comments:CommentRecordInput[];nextCursor:string|null;coverage:'partial'|'end'};
export interface CommentsAdapter{
 observe(page:Page):Promise<CommentObservation>;
 readComments(page:Page,cursor:string|null,signal:AbortSignal):Promise<CommentPage>;
 observeReplyTarget(page:Page,review:CommentReplyReview):Promise<{observation:CommentObservation;comment:CommentRecordInput|null}>;
 prepareReply(page:Page,review:CommentReplyReview,signal:AbortSignal):Promise<void>;
 submitReply(page:Page,review:CommentReplyReview):Promise<CommentReplyReceipt|null>;
 readReplyResult(page:Page,attempt:CommentReplyAttempt):Promise<CommentReplyReceipt|null>;
 commentUrl(comment:CommentRecord):string|null;
}
export class UnverifiedCommentsAdapter implements CommentsAdapter{
 async observe(_page:Page):Promise<CommentObservation>{return{identity:null,canRead:false,canReply:false,version:'unverified',reason:'评论读取和回复接入待验证'};}
 async readComments(_page:Page,_cursor:string|null,_signal:AbortSignal):Promise<CommentPage>{throw new Error('评论读取接入待验证');}
 async observeReplyTarget(_page:Page,_review:CommentReplyReview):Promise<{observation:CommentObservation;comment:CommentRecordInput|null}>{throw new Error('评论回复接入待验证');}
 async prepareReply(_page:Page,_review:CommentReplyReview,_signal:AbortSignal):Promise<void>{throw new Error('评论回复接入待验证');}
 async submitReply(_page:Page,_review:CommentReplyReview):Promise<CommentReplyReceipt|null>{throw new Error('评论回复接入待验证');}
 async readReplyResult(_page:Page,_attempt:CommentReplyAttempt):Promise<CommentReplyReceipt|null>{throw new Error('评论回复接入待验证');}
 commentUrl(_comment:CommentRecord):string|null{return null;}

}
