/** 租约在 effect 中释放；渲染必须同步隔离旧作用域，否则新建任务会读到上一任务的结果。 */
export function currentScopedLease<TLease, TOwner>(
  binding: { lease: TLease; owner: TOwner; sessionId: string | null } | null,
  owner: TOwner,
  sessionId: string | null,
): TLease | null {
  return binding?.owner === owner && binding.sessionId === sessionId ? binding.lease : null;
}
