export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-3 bg-gray-200 rounded w-24" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
        <div className="h-8 w-8 bg-gray-200 rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonReviewRow() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 animate-pulse flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 bg-gray-200 rounded-full" />
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 rounded w-20" />
          <div className="h-4 bg-gray-200 rounded w-48" />
        </div>
      </div>
      <div className="h-8 w-16 bg-gray-200 rounded-lg" />
    </div>
  );
}

export function SkeletonCalendar() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-3">
      <div className="h-5 bg-gray-200 rounded w-40 mx-auto" />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-8 bg-gray-200 rounded" />
        ))}
      </div>
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div className="grid grid-cols-4 gap-2 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
          <div className="h-6 bg-gray-200 rounded w-8 mx-auto" />
          <div className="h-3 bg-gray-200 rounded w-12 mx-auto" />
        </div>
      ))}
    </div>
  );
}
