import React from 'react'

export const Badge = ({ status, variant, children, className = '' }) => {
  const normStatus = (status || children || '').toString().toUpperCase()

  let style = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'

  if (normStatus === 'VERIFIED' || normStatus === 'ACTIVE' || normStatus === 'MATCH' || variant === 'success') {
    style = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
  } else if (normStatus === 'MISMATCH DETECTED' || normStatus === 'MISMATCH' || normStatus === 'CANCELLED' || variant === 'danger') {
    style = 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-800/60'
  } else if (normStatus === 'REQUIRES REVIEW' || normStatus === 'REVIEW' || normStatus === 'PENDING' || normStatus === 'APPROVAL_PENDING' || normStatus === 'SUSPENDED' || variant === 'warning') {
    style = 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60'
  } else if (variant === 'primary' || normStatus === 'INFO' || normStatus === 'APPROVED') {
    style = 'bg-blue-50 text-brand-primary dark:bg-blue-950/40 dark:text-dark-accent border-blue-200 dark:border-blue-800/60'
  } else if (normStatus === 'EXPIRED') {
    style = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border uppercase ${style} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {children || status}
    </span>
  )
}
