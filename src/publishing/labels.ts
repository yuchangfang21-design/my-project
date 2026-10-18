import type { PublishStatus } from '../../shared/publishing-contracts';
export const publishLabels:Record<PublishStatus,string>={pending:'待执行',waiting_login:'等待登录',running:'执行中',submitted:'已提交 · 审核中',published:'已发布',rejected:'发布受限 / 未通过审核',failed:'失败',review:'结果待核对',cancelled:'已取消'};
