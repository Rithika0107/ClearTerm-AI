import React, { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ShieldCheck,
  GitCompare,
  FileBarChart,
  FileSignature,
  Activity,
  Search,
  Settings,
  ChevronLeft,
  ChevronRight,
  Shield,
  CircleDot,
} from 'lucide-react'
import { getHealth, getPayPalStatus } from '../../services/api'

export const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false)
  const [status, setStatus] = useState({ loading: true, paypal: null, gemini: null })

  useEffect(() => {
    let active = true
    Promise.allSettled([getHealth(), getPayPalStatus()]).then(([health, paypal]) => {
      if (!active) return
      setStatus({
        loading: false,
        gemini: health.status === 'fulfilled' ? health.value.services?.gemini : null,
        paypal: paypal.status === 'fulfilled' ? paypal.value : null,
      })
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 767px)')
    const syncCollapsedState = () => setCollapsed(mobile.matches)
    syncCollapsedState()
    mobile.addEventListener?.('change', syncCollapsedState)
    return () => mobile.removeEventListener?.('change', syncCollapsedState)
  }, [])

  const paypalConnected = status.paypal?.connected === true
  const geminiConfigured = status.gemini?.configured === true

  const navItems = [
    {
      label: 'Financial Overview',
      path: '/app/overview',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      label: 'Offer Verification',
      path: '/app/verify',
      icon: ShieldCheck,
      badge: 'AI Core',
    },
    {
      label: 'Billing Comparison',
      path: '/app/comparison',
      icon: GitCompare,
      badge: null,
    },
    {
      label: 'Integrity Reports',
      path: '/app/reports',
      icon: FileBarChart,
      badge: null,
    },
    {
      label: 'Subscription Consent',
      path: '/app/consent',
      icon: FileSignature,
      badge: 'Customer',
    },
    {
      label: 'Subscription Monitor',
      path: '/app/monitoring',
      icon: Activity,
      badge: null,
    },
    {
      label: 'Evidence Explorer',
      path: '/app/evidence',
      icon: Search,
      badge: null,
    },
    {
      label: 'Platform Settings',
      path: '/app/settings',
      icon: Settings,
      badge: null,
    },
  ]

  return (
    <aside
      className={`relative z-20 flex flex-shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-surface transition-all duration-200 select-none ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 z-30 p-1 bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-700 rounded-full shadow-xs text-slate-500 hover:text-brand-primary dark:text-slate-400 hover:scale-105 transition-all"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5" />
        ) : (
          <ChevronLeft className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Navigation Links */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {!collapsed && (
          <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Verification Engine
          </div>
        )}

        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-light dark:bg-blue-950/40 text-brand-primary dark:text-dark-accent font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-dark-muted hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-brand-text dark:hover:text-dark-text'
                } ${collapsed ? 'justify-center' : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && (
                <div className="flex-1 flex items-center justify-between truncate">
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </NavLink>
          )
        })}
      </div>

      {/* Footer Status Indicators */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800">
        {!collapsed ? (
          <div className="bg-slate-50 dark:bg-dark-card rounded-lg p-2.5 border border-slate-200/70 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">PayPal Sandbox</span>
              <span className={`flex items-center gap-1 font-semibold ${paypalConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                <CircleDot className="w-2.5 h-2.5 animate-pulse" />
                {status.loading ? 'Checking…' : paypalConnected ? 'Connected' : 'Not configured'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">Gemini 2.5 Flash</span>
              <span className={`flex items-center gap-1 font-semibold ${geminiConfigured ? 'text-brand-primary dark:text-dark-accent' : 'text-amber-600 dark:text-amber-400'}`}>
                <Shield className="w-2.5 h-2.5" />
                {status.loading ? 'Checking…' : geminiConfigured ? 'Configured' : 'Not configured'}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900"
              title={paypalConnected ? 'PayPal Sandbox Connected' : 'PayPal Sandbox Not configured'}
            />
            <div
              className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-200 dark:ring-blue-900"
              title={geminiConfigured ? 'Gemini AI Configured' : 'Gemini AI Not configured'}
            />
          </div>
        )}
      </div>
    </aside>
  )
}
