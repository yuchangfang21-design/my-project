import { useCallback, useEffect, useRef, useState } from 'react';
import type { DesktopApi, WorkspaceSnapshot } from '../../shared/desktop-contracts';
export type PublishCommand=<T>(work:()=>Promise<T>)=>Promise<T|undefined>;
export function usePublishing(api:DesktopApi,onChanged:()=>Promise<unknown>){
  const[snapshot,setSnapshot]=useState<WorkspaceSnapshot>({version:1,accounts:[],assets:[],tasks:[],messages:[]});
  const[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[loadError,setLoadError]=useState(''),[actionError,setActionError]=useState('');
  const ticket=useRef(0),mounted=useRef(true),working=useRef(false),parent=useRef(onChanged);parent.current=onChanged;
  const refresh=useCallback(async()=>{const current=++ticket.current;const next=await api.getSnapshot();if(mounted.current&&current===ticket.current){setSnapshot(next);setLoadError('');}},[api]);
  useEffect(()=>{mounted.current=true;void refresh().catch(error=>setLoadError(String(error.message||error))).finally(()=>{if(mounted.current)setLoading(false);});return()=>{mounted.current=false;ticket.current++;};},[refresh]);
  const command:PublishCommand=useCallback(async<T,>(work:()=>Promise<T>)=>{
    if(working.current)return undefined;working.current=true;setBusy(true);
    try{const result=await work();await refresh();await parent.current();if(mounted.current)setActionError('');return result;}
    catch(error){if(mounted.current)setActionError(error instanceof Error?error.message:'操作失败，请重试');return undefined;}
    finally{working.current=false;if(mounted.current)setBusy(false);}
  },[refresh]);
  return{snapshot,loading,busy,error:actionError||loadError,refresh,command,clearError:()=>setActionError('')};
}
