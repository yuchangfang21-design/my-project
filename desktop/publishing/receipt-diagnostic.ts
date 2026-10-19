// Static, bounded reasons only: never persist responses, URLs, IDs or page text.
export const receiptDiagnosticMessages = {
 RECEIPT_STATE_MISSING:'回执检查：当前窗口没有本次提交证据，重启或升级后无法从内存恢复；请以官网记录为准，不要重发',
 RECEIPT_ATTEMPT_MISMATCH:'回执检查：当前窗口的提交证据与任务不一致，未关联作品',
 RECEIPT_PAGE_UNMATCHED:'回执检查：未处于官方内容管理页，尚未核实结果',
 RECEIPT_RESPONSE_UNSEEN:'回执检查：未捕获符合当前规则的发布响应；不代表作品未发布',
 RECEIPT_RESPONSE_UNSUPPORTED:'回执检查：发布响应的状态或内容类型无法核实',
 RECEIPT_RESPONSE_SIZE:'回执检查：发布响应缺少有效长度或超出读取限制',
 RECEIPT_RESPONSE_UNREADABLE:'回执检查：发布响应正文无法读取，作品可能已发布',
 RECEIPT_ID_UNSUPPORTED:'回执检查：发布响应未提供可核实的作品ID',
 RECEIPT_ID_CONFLICT:'回执检查：捕获到多个不同作品ID，未关联作品',
 RECEIPT_CAPTION_UNMATCHED:'回执检查：官方列表未唯一匹配任务文案',
 RECEIPT_STATUS_UNMATCHED:'回执检查：匹配文案附近未识别到可见的已发布状态',
 RECEIPT_LINK_UNMATCHED:'回执检查：作品详情链接未取得或与提交作品ID不一致',
 RECEIPT_OWNER_UNMATCHED:'回执检查：当前账号未通过提交目标身份核实',
} as const;
export type ReceiptDiagnosticCode=keyof typeof receiptDiagnosticMessages;
