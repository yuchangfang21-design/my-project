export function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参数格式无效');
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('包含不允许的字段');
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max: number, optional = false): string {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label}长度须为 1—${max}`);
  return value.trim();
}
export function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error('记录 ID 无效');
  return value;
}
