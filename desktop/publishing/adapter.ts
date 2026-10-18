import type { Page } from 'playwright-core';
import type { Identity } from '../../shared/desktop-contracts.js';
import type { PublicationReceipt } from '../../shared/publishing-contracts.js';
import type { AttemptRecord } from '../storage/publish-store.js';
export type PublishObservation={identity:Identity|null;canPublish:boolean;version:string;reason?:string};
export type PreparePublicationInput={file:string;title:string;description:string;tags:string[]};
export interface PublishAdapter {
  readonly worksUrl:string|null;
  observe(page:Page):Promise<PublishObservation>;
  prepare(page:Page,input:PreparePublicationInput,signal:AbortSignal):Promise<void>;
  submit(page:Page):Promise<PublicationReceipt|null>;
  readResult(page:Page,attempt:AttemptRecord):Promise<PublicationReceipt|null>;
}
export class UnverifiedPublishAdapter implements PublishAdapter {
  readonly worksUrl=null;
  async observe(_page:Page):Promise<PublishObservation>{return{identity:null,canPublish:false,version:'unverified',reason:'发布接入待验证：尚无真实账号身份与发布页面的验证依据。'};}
  async prepare(_page:Page,_input:PreparePublicationInput,_signal:AbortSignal):Promise<void>{throw new Error('发布接入待验证');}
  async submit(_page:Page):Promise<PublicationReceipt|null>{throw new Error('发布接入待验证');}
  async readResult(_page:Page,_attempt:AttemptRecord):Promise<PublicationReceipt|null>{throw new Error('作品结果读取待验证');}
}
