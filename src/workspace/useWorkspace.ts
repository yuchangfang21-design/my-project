import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyWorkspace, type WorkspaceGateway } from './gateways';
import type { Workspace } from '../data';
export function useWorkspace(gateway:WorkspaceGateway){
  const [workspace,setWorkspace]=useState<Workspace>(()=>gateway.kind==='demo'?gateway.load():emptyWorkspace());
  const [loading,setLoading]=useState(gateway.kind==='desktop');const[error,setError]=useState('');const request=useRef(0);
  const refresh=useCallback(async()=>{if(gateway.kind!=='desktop')return;const ticket=++request.current;const next=await gateway.load();if(ticket===request.current){setWorkspace(next);setError('');}},[gateway]);
  useEffect(()=>{let live=true;if(gateway.kind==='desktop')void refresh().catch(error=>{if(live)setError(error instanceof Error?error.message:'无法加载本地工作区');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;request.current++;};},[gateway,refresh]);
  useEffect(()=>{if(gateway.kind==='demo')try{gateway.save(workspace);setError('');}catch{setError('浏览器存储不可用，当前修改无法在刷新后保留。请先导出工作区。');}},[workspace,gateway]);
  return{workspace,setWorkspace,refresh,loading,error};
}
