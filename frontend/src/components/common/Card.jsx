import React from 'react'

export const Card = ({
  children,
  className = '',
  title,
  subtitle,
  action,
  headerClassName = '',
  bodyClassName = '',
  footer,
  footerClassName = '',
  ...props
}) => {
  return (
    <div
      className={`bg-white dark:bg-dark-card border border-slate-200/90 dark:border-slate-800/90 rounded-xl shadow-fintech transition-all ${className}`}
      {...props}
    >
      {(title || subtitle || action) && (
        <div
          className={`flex items-start justify-between p-5 border-b border-slate-100 dark:border-slate-800/80 ${headerClassName}`}
        >
          <div>
            {title && (
              <h3 className="text-base font-semibold text-brand-text dark:text-dark-text tracking-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-brand-muted dark:text-dark-muted mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="ml-4 flex-shrink-0">{action}</div>}
        </div>
      )}
      <div className={`p-5 ${bodyClassName}`}>{children}</div>
      {footer && (
        <div
          className={`p-4 bg-slate-50/70 dark:bg-dark-surface/50 border-t border-slate-100 dark:border-slate-800/80 rounded-b-xl ${footerClassName}`}
        >
          {footer}
        </div>
      )}
    </div>
  )
}
