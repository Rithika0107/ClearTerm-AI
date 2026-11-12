import React from 'react'

export const Skeleton = ({ className = '' }) => {
  return (
    <div
      className={`animate-pulse bg-slate-200/70 dark:bg-slate-700/50 rounded ${className}`}
    />
  )
}

export const TableSkeleton = ({ rows = 5, cols = 5 }) => {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 p-3 bg-slate-100/60 dark:bg-slate-800/40 rounded-lg">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 p-3 border-b border-slate-100 dark:border-slate-800">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export const CardMetricSkeleton = () => {
  return (
    <div className="p-5 bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-40" />
    </div>
  )
}
