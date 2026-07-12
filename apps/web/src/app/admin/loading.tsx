export default function AdminLoading() {
  return (
    <div className="space-y-3" aria-label="관리자 화면을 불러오는 중">
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
      <div className="overflow-hidden rounded-lg border">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex h-9 items-center gap-3 border-b px-3 last:border-b-0">
            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
            <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
