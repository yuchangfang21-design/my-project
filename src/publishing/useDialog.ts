import { useEffect, useRef, type RefObject } from 'react';
export function useDialog(ref:RefObject<HTMLElement|null>,onClose:()=>void){
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,dialog=ref.current;
    dialog?.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')?.focus();
    const key=(event:KeyboardEvent)=>{
      const dialogs=document.querySelectorAll('[role="dialog"][aria-modal="true"]');if(dialogs[dialogs.length-1]!==dialog)return;
      if(event.key==='Escape'){event.preventDefault();close.current();return;}
      if(event.key!=='Tab')return;
      const elements=dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]');
      if(!elements?.length){event.preventDefault();return;}
      const first=elements[0],last=elements[elements.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
  },[ref]);
}
