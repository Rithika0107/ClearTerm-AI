import React from 'react'
import { Loader2 } from 'lucide-react'

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon: Icon,
  className = '',
  onClick,
  type = 'button',
  ...props
}) => {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'

  const sizes = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-base gap-2.5',
  }

  const variants = {
    primary:
      'bg-brand-primary hover:bg-brand-secondary text-white shadow-sm focus:ring-brand-primary dark:bg-brand-primary dark:hover:bg-blue-600',
    secondary:
      'bg-brand-light text-brand-navy hover:bg-blue-100 dark:bg-dark-surface dark:text-dark-text dark:hover:bg-slate-800 border border-transparent dark:border-slate-700',
    outline:
      'bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-700 text-brand-text dark:text-dark-text hover:bg-slate-50 dark:hover:bg-dark-surface shadow-xs',
    danger:
      'bg-brand-danger hover:bg-red-700 text-white shadow-sm focus:ring-red-500',
    ghost:
      'bg-transparent hover:bg-slate-100 dark:hover:bg-dark-surface text-brand-muted dark:text-dark-muted hover:text-brand-text dark:hover:text-dark-text',
    navy:
      'bg-brand-navy hover:bg-[#002266] text-white shadow-sm focus:ring-brand-navy',
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : Icon ? (
        <Icon className="w-4 h-4 text-current" />
      ) : null}
      {children}
    </button>
  )
}
