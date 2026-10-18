import{useCallback,useEffect,useRef,useState}from'react';
import type{DesktopApi}from'../../shared/desktop-contracts';
import type{CommentWorkspace,CommentDetails,CommentListInput}from'../../shared/comments-contracts';
import type{CommentDraftController}from'./CommentDraftController';
export function useComments(api:DesktopApi,drafts:CommentDraftController,input:CommentListInput){
 const[workspace,setWorkspace]=useState<CommentWorkspace|null>(null),[details,setDetails]=useState<CommentDetails|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);const listTicket=useRef(0),detailTicket=useRef(0),selected=useRef<string|null>(null);
 const refresh=useCallback(async()=>{const ticket=++listTicket.current;setLoading(true);try{const next=await api.getCommentWorkspace(input);if(ticket===listTicket.current){setWorkspace(next);setError('');}}catch(e){if(ticket===listTicket.current)setError(e instanceof Error?e.message:String(e));}finally{if(ticket===listTicket.current)setLoading(false);}},[api,input.accountId,input.processed,input.query,input.offset,input.limit]);
 useEffect(()=>{void refresh();return()=>{listTicket.current++;};},[refresh]);
 const select=async(id:string)=>{const ticket=++detailTicket.current;try{await drafts.load(id);if(ticket!==detailTicket.current)return false;const next=await api.getCommentDetails(id);if(ticket!==detailTicket.current)return false;selected.current=id;setDetails(next);setError('');return true;}catch(e){if(ticket===detailTicket.current)setError(e instanceof Error?e.message:String(e));return false;}};
 const clear=()=>{detailTicket.current++;selected.current=null;setDetails(null);};
 const update=(next:CommentDetails)=>{if(selected.current===next.comment.id)setDetails(next);};
 useEffect(()=>{if(!details||!['sending','review'].includes(details.replyState))return;let disposed=false,running=false;const id=details.comment.id,ticket=detailTicket.current;const timer=setInterval(()=>{if(running)return;running=true;void api.getCommentDetails(id).then(next=>{if(!disposed&&ticket===detailTicket.current&&selected.current===id)setDetails(next);}).catch(()=>undefined).finally(()=>{running=false;});},1000);return()=>{disposed=true;clearInterval(timer);};},[api,details?.comment.id,details?.replyState]);
 useEffect(()=>()=>{detailTicket.current++;},[]);
 return{workspace,details,error,loading,refresh,select,clear,update,setError};
}
