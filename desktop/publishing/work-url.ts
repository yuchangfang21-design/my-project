// Only the user-observed self-modal format is added to the legacy creator URLs.
export function verifiedWorkUrl(value:string,workId?:string):URL {
 const url=new URL(value);
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash)throw new Error('作品链接不是已验证的官方地址');
 if(url.hostname==='creator.douyin.com'&&!url.search)return url;
 const ids=url.searchParams.getAll('modal_id');
 if(url.hostname!=='www.douyin.com'||url.pathname!=='/user/self'||ids.length!==1||[...url.searchParams.keys()].length!==1||!/^[1-9]\d{0,29}$/.test(ids[0])||(workId!==undefined&&ids[0]!==workId))throw new Error('作品链接或作品标识不匹配');
 return url;
}
