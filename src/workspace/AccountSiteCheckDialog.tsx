import { useState } from 'react';
import type { AccountSiteCheck } from '../../shared/site-check-contracts';

export default function AccountSiteCheckDialog({ report, close }: { report: AccountSiteCheck; close: () => void }) {
  const [notice, setNotice] = useState('');
  const text = JSON.stringify(report, null, 2);
  return <>
    <div className="modal-heading"><h2>官方页面接入检查</h2><p>仅检查当前账号浏览器的页面类型与控件数量。不包含 Cookie、密码、账号名称、评论正文或网址参数；不刷新页面，不上传报告。</p></div>
    <p className="modal-note">报告不会确认登录，也不会启用发布或评论。</p>
    <p className="settings-description">身份结果显示最近一次“检查状态”的读取结果及时间；生成报告不会再次请求账号接口。</p>
    <label className="field">接入检查报告<textarea className="site-check-report" aria-label="接入检查报告" readOnly value={text} rows={12} spellCheck={false} /></label>
    {notice && <p role="status">{notice}</p>}
    <div className="modal-footer">
      <button className="button secondary" onClick={close}>关闭检查</button>
      <button className="button primary" onClick={() => void navigator.clipboard.writeText(text).then(() => setNotice('已复制报告，可粘贴到开发对话中。')).catch(() => setNotice('复制失败，请选中报告文本后按 Ctrl+C。'))}>复制报告</button>
    </div>
  </>;
}
