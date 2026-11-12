import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  Search,
  Bell,
  Sun,
  Moon,
  ChevronDown,
  Building2,
  ExternalLink,
  CheckCircle,
} from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'

export const Navbar = ({ onToggleSidebar }) => {
  const { theme, toggleTheme } = useTheme()
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  return (
    <header className="sticky top-0 z-30 h-16 bg-white dark:bg-dark-surface border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Left: Branding & Workspace selector */}
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-brand-navy flex items-center justify-center text-white shadow-sm group-hover:bg-brand-primary transition-colors">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-brand-navy dark:text-white flex items-center gap-1.5">
                CLEARTERM <span className="text-brand-primary">AI</span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Billing Integrity
              </span>
            </div>
          </Link>

          <div className="hidden md:block h-6 w-px bg-slate-200 dark:bg-slate-700" />

          {/* Workspace selector dropdown */}
          <div className="relative hidden lg:block">
            <button
              onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-dark-card hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-brand-text dark:text-dark-text transition-colors"
            >
              <Building2 className="w-3.5 h-3.5 text-brand-primary" />
              <span>PayPal Sandbox Hub</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showWorkspaceMenu && (
              <div className="absolute left-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-800 shadow-fintech-lg py-1.5 z-40">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Active Environments
                </div>
                <button
                  onClick={() => setShowWorkspaceMenu(false)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-brand-text dark:text-dark-text hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>PayPal Sandbox (Default)</span>
                  </div>
                  <CheckCircle className="w-3.5 h-3.5 text-brand-primary" />
                </button>
                <div className="px-3 py-1 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
                  Account: sb-merchant26@business.example.com
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Search input */}
        <div className="flex-1 max-w-md hidden md:block">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search plans, audits, transmission IDs (Ctrl+K)..."
              className="w-full pl-9 pr-4 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-dark-card border border-slate-200 dark:border-slate-700 text-brand-text dark:text-dark-text placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary transition-all"
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5">
          {/* Light/Dark Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-card hover:text-brand-text dark:hover:text-white transition-colors"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-card hover:text-brand-text dark:hover:text-white transition-colors"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-primary ring-2 ring-white dark:ring-dark-surface" />
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-800 shadow-fintech-lg py-2 z-40">
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-brand-text dark:text-white">
                    Audit Alerts
                  </span>
                  <span className="text-[10px] text-brand-primary font-medium">
                    2 New
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
                  <div className="px-4 py-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
                      <span>Mismatch Flagged</span>
                    </div>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Plan P-52K91 renewal price $19.99 vs advertised $14.99
                    </p>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      12m ago
                    </span>
                  </div>
                  <div className="px-4 py-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                      <span>Verification Approved</span>
                    </div>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Plan P-99A12 matches customer consent terms perfectly
                    </p>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      1h ago
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

          {/* Profile menu */}
          <div className="relative">
            <button
              onClick={() => setShowProfile(!showProfile)}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-card transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-brand-primary text-white flex items-center justify-center text-xs font-bold shadow-xs">
                CA
              </div>
              <div className="hidden sm:block text-left text-xs">
                <div className="font-semibold text-brand-text dark:text-white leading-tight">
                  Lead Auditor
                </div>
                <div className="text-[10px] text-slate-400">Sandbox Admin</div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showProfile && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-800 shadow-fintech-lg py-1.5 z-40">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-medium text-brand-text dark:text-white">
                    Fintech Auditor
                  </p>
                  <p className="text-[11px] text-slate-400">auditor@clearterm.ai</p>
                </div>
                <Link
                  to="/app/settings"
                  onClick={() => setShowProfile(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Platform Settings
                </Link>
                <a
                  href="https://developer.paypal.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span>PayPal Developer Portal</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
