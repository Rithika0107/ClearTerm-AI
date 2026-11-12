import React from 'react'
import { CheckCircle2, AlertCircle, Info, XCircle, X } from 'lucide-react'
import { useVerification } from '../../context/VerificationContext'

export const ToastContainer = () => {
  const { toasts, removeToast } = useVerification()

  if (!toasts || toasts.length === 0) return null

  return (
    <div className="toast-container fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        let Icon = Info
        let borderClass = 'border-blue-200 dark:border-blue-800 bg-white dark:bg-dark-card text-brand-text dark:text-dark-text'
        let iconColor = 'text-brand-primary'

        if (toast.type === 'success') {
          Icon = CheckCircle2
          iconColor = 'text-brand-success'
          borderClass = 'border-emerald-200 dark:border-emerald-800 bg-white dark:bg-dark-card text-brand-text dark:text-dark-text'
        } else if (toast.type === 'error') {
          Icon = XCircle
          iconColor = 'text-brand-danger'
          borderClass = 'border-red-200 dark:border-red-800 bg-white dark:bg-dark-card text-brand-text dark:text-dark-text'
        } else if (toast.type === 'warning') {
          Icon = AlertCircle
          iconColor = 'text-brand-warning'
          borderClass = 'border-amber-200 dark:border-amber-800 bg-white dark:bg-dark-card text-brand-text dark:text-dark-text'
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg border shadow-fintech-lg transition-all animate-in slide-in-from-right-4 duration-200 ${borderClass}`}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
            <div className="flex-1 text-sm leading-snug">{toast.message}</div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
