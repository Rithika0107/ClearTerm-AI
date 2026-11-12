import React, { useState, useEffect } from 'react'
import {
  Settings,
  ShieldCheck,
  CheckCircle2,
  Database,
  Lock,
  Globe,
  Radio,
  Cpu,
  Moon,
  Sun,
  Key,
  RefreshCw,
  ExternalLink,
  Layers,
  Fingerprint,
  AlertCircle,
  PackageCheck,
  Calendar,
  Eye,
} from 'lucide-react'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { useTheme } from '../context/ThemeContext'
import { useVerification } from '../context/VerificationContext'
import { getHealth, getPayPalStatus, getPayPalProducts, getPayPalPlans, getPayPalPlanDetails } from '../services/api'
import { formatCurrencyAmount } from '../services/formatters'

const displayValue = (value) => value === null || value === undefined || value === '' ? 'Unavailable' : value
const displayAmount = (value, currency) => value === null || value === undefined || value === ''
  ? 'Unavailable'
  : formatCurrencyAmount(value, currency)

export const SettingsPage = () => {
  const { theme, toggleTheme } = useTheme()
  const { addToast } = useVerification()

  const [connectionStatus, setConnectionStatus] = useState({
    loading: true,
    data: null,
    error: null,
  })
  const [healthStatus, setHealthStatus] = useState(null)

  // PayPal Sandbox Explorer state
  const [activeTab, setActiveTab] = useState('products') // 'products' | 'plans' | 'inspect'
  const [productsData, setProductsData] = useState({ loading: false, items: [], total: 0, error: null })
  const [plansData, setPlansData] = useState({ loading: false, items: [], total: 0, error: null })
  const [inspectedPlan, setInspectedPlan] = useState(null)
  const [inspectingPlanId, setInspectingPlanId] = useState('')
  const [inspectLoading, setInspectLoading] = useState(false)

  const checkStatus = async () => {
    setConnectionStatus(prev => ({ ...prev, loading: true, error: null }))
    try {
      const [res, health] = await Promise.all([getPayPalStatus(), getHealth()])
      setConnectionStatus({ loading: false, data: res, error: null })
      setHealthStatus(health)
      if (res.connected) {
        addToast('PayPal Sandbox connection verified (OAuth 2.0 200 OK)', 'success')
      } else if (res.status === 'NOT_CONFIGURED') {
        addToast('PayPal Sandbox credentials not configured in backend .env', 'warning')
      } else {
        addToast(`PayPal connection check: ${res.status}`, 'error')
      }
    } catch (err) {
      setConnectionStatus({ loading: false, data: null, error: err.message })
      addToast(`Diagnostic check failed: ${err.message}`, 'error')
    }
  }

  useEffect(() => {
    checkStatus()
  }, [])

  const loadProducts = async () => {
    setProductsData(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await getPayPalProducts()
      setProductsData({
        loading: false,
        items: res.products || [],
        total: res.total_items || 0,
        error: null,
      })
      addToast(`Fetched ${res.products?.length || 0} Sandbox products`, 'info')
    } catch (err) {
      setProductsData(prev => ({ ...prev, loading: false, error: err.message }))
      addToast(err.message, 'error')
    }
  }

  const loadPlans = async () => {
    setPlansData(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await getPayPalPlans()
      setPlansData({
        loading: false,
        items: res.plans || [],
        total: res.total_items || 0,
        error: null,
      })
      addToast(`Fetched ${res.plans?.length || 0} Sandbox plans`, 'info')
    } catch (err) {
      setPlansData(prev => ({ ...prev, loading: false, error: err.message }))
      addToast(err.message, 'error')
    }
  }

  const handleInspectPlan = async (planId) => {
    if (!planId) return
    setInspectLoading(true)
    try {
      const res = await getPayPalPlanDetails(planId)
      setInspectedPlan(res.plan)
      setActiveTab('inspect')
      addToast(`Retrieved plan ${planId} & canonical fingerprint`, 'success')
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setInspectLoading(false)
    }
  }

  const isConnected = connectionStatus.data?.connected === true
  const isConfigured = connectionStatus.data?.configured === true
  const geminiConfigured = healthStatus?.services?.gemini?.configured === true

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy dark:text-white">
            Platform Configuration & Diagnostics
          </h1>
          <p className="text-xs text-brand-muted dark:text-dark-muted mt-1">
            Real-time verification of PayPal Sandbox REST API, Gemini AI engine, and canonical plan fingerprinting.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          icon={RefreshCw}
          loading={connectionStatus.loading}
          onClick={checkStatus}
        >
          Re-test Gateway Connectivity
        </Button>
      </div>

      {/* Security Notice */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-dark-surface/80 border border-slate-200 dark:border-slate-800 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
        <Lock className="w-4 h-4 text-brand-primary flex-shrink-0" />
        <span>
          <strong>Zero Secret Exposure:</strong> In compliance with fintech security standards, raw API keys, PayPal secrets, and customer tokens are strictly confined to backend environment variables (<code>.env</code>) and are never transmitted to or displayed in the browser.
        </span>
      </div>

      {/* Services Health Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* PayPal Sandbox Status Card */}
        <Card
          title="PayPal Sandbox REST Gateway"
          subtitle="Direct OAuth 2.0 Client Credentials"
          action={
            connectionStatus.loading ? (
              <Badge status="CHECKING" variant="primary" />
            ) : isConnected ? (
              <Badge status="CONNECTED" variant="success" />
            ) : isConfigured ? (
              <Badge status="AUTH FAILED" variant="danger" />
            ) : (
              <Badge status="NOT CONFIGURED" variant="warning" />
            )
          }
        >
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Sandbox Base URL</span>
              <span className="font-mono text-brand-text dark:text-white">
                {connectionStatus.data?.base_url || 'https://api-m.sandbox.paypal.com'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Client ID Mask</span>
              <span className="font-mono text-brand-primary">
                {connectionStatus.data?.client_id_mask || (isConfigured ? '••••' : 'Not Set in .env')}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Client Secret</span>
              <span className="font-mono text-emerald-600 font-bold">
                {isConfigured ? '•••••••••••••••• (Encrypted in .env)' : 'Not Set in .env'}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Connection Verification</span>
              <span className={isConnected ? "text-emerald-600 font-semibold" : "text-amber-600 font-medium"}>
                {connectionStatus.data?.message || (connectionStatus.loading ? 'Checking...' : 'Awaiting verification')}
              </span>
            </div>
          </div>
        </Card>

        {/* Gemini API Status */}
        <Card
          title="Google Gemini AI Engine"
          subtitle="Multimodal Document Extraction"
          action={<Badge status={connectionStatus.loading ? 'CHECKING' : geminiConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'} variant={geminiConfigured ? 'primary' : 'warning'} />}
        >
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">SDK Version</span>
              <span className="font-mono text-brand-text dark:text-white">google-genai v3.0.0</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Configured Model</span>
                <span className="font-mono font-bold text-brand-primary">{healthStatus?.services?.gemini_model || 'Unavailable'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">API Key</span>
              <span className={`font-mono font-bold ${geminiConfigured ? 'text-emerald-600' : 'text-amber-600'}`}>{geminiConfigured ? 'Configured in backend' : 'Not configured in backend'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Structured Output Schema</span>
                <span className={geminiConfigured ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>{geminiConfigured ? 'Available for extraction' : 'Extraction unavailable'}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* PayPal Sandbox Catalog & Plan Inspector */}
      <Card
        title="PayPal Sandbox Live Catalog & Plan Inspector"
        subtitle="Live inspection of products, subscription billing plans, and canonical SHA-256 fingerprints"
        action={
          <div className="flex items-center gap-1.5">
            <Button
              variant={activeTab === 'products' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => { setActiveTab('products'); if (!productsData.items.length) loadProducts(); }}
            >
              Products
            </Button>
            <Button
              variant={activeTab === 'plans' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => { setActiveTab('plans'); if (!plansData.items.length) loadPlans(); }}
            >
              Plans
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Quick Plan ID Direct Inspector input */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <input
                type="text"
                value={inspectingPlanId}
                onChange={(e) => setInspectingPlanId(e.target.value)}
                placeholder="Enter PayPal Plan ID (e.g. P-8Y2908182) to inspect canonical fingerprint..."
                className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-700 font-mono text-brand-text dark:text-dark-text"
              />
            </div>
            <Button
              size="sm"
              loading={inspectLoading}
              disabled={!inspectingPlanId.trim()}
              onClick={() => handleInspectPlan(inspectingPlanId.trim())}
              icon={Fingerprint}
            >
              Inspect Fingerprint
            </Button>
          </div>

          {/* TAB: PRODUCTS */}
          {activeTab === 'products' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-brand-navy dark:text-white">
                  Sandbox Catalog Products ({productsData.items.length})
                </span>
                <Button variant="ghost" size="sm" icon={RefreshCw} loading={productsData.loading} onClick={loadProducts}>
                  Refresh
                </Button>
              </div>

              {productsData.loading ? (
                <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                  Loading PayPal catalog products from Sandbox API...
                </div>
              ) : productsData.error ? (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <AlertCircle className="w-4 h-4" />
                    <span>Catalog Status Notice</span>
                  </div>
                  <p>{productsData.error}</p>
                  <p className="text-[11px] text-slate-500 mt-2">
                    To populate live products, configure valid sandbox credentials in <code>backend/.env</code> or create test products on the PayPal Developer Dashboard.
                  </p>
                </div>
              ) : productsData.items.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {productsData.items.map((prod) => (
                    <div key={prod.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-card space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-brand-navy dark:text-white">{prod.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">{prod.id}</span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2">{prod.description || 'No description provided'}</p>
                      <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
                        <span>Category: {prod.category || 'SOFTWARE'}</span>
                        <Button variant="ghost" size="sm" onClick={() => { setActiveTab('plans'); loadPlans(); }}>
                          View Plans
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
                  <PackageCheck className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-semibold text-brand-navy dark:text-white">No Products Loaded</p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    Click Refresh to query the Sandbox Catalog Products API <code>/v1/catalogs/products</code>.
                  </p>
                  <Button variant="outline" size="sm" onClick={loadProducts}>
                    Query Products API
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* TAB: PLANS */}
          {activeTab === 'plans' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-brand-navy dark:text-white">
                  Sandbox Subscription Plans ({plansData.items.length})
                </span>
                <Button variant="ghost" size="sm" icon={RefreshCw} loading={plansData.loading} onClick={loadPlans}>
                  Refresh
                </Button>
              </div>

              {plansData.loading ? (
                <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                  Querying PayPal Subscriptions Plans API <code>/v1/billing/plans</code>...
                </div>
              ) : plansData.error ? (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <AlertCircle className="w-4 h-4" />
                    <span>Plans Status Notice</span>
                  </div>
                  <p>{plansData.error}</p>
                </div>
              ) : plansData.items.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {plansData.items.map((plan) => (
                    <div key={plan.id} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <span className="font-bold text-brand-navy dark:text-white block">{plan.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">ID: {plan.id} • Product: {plan.product_id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge status={plan.status} />
                        <Button variant="outline" size="sm" icon={Eye} onClick={() => handleInspectPlan(plan.id)}>
                          Inspect
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
                  <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-semibold text-brand-navy dark:text-white">No Billing Plans Loaded</p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    Click Query Plans to retrieve live billing plans from <code>/v1/billing/plans</code>.
                  </p>
                  <Button variant="outline" size="sm" onClick={loadPlans}>
                    Query Plans API
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* TAB: INSPECT PLAN DETAILS & CANONICAL FINGERPRINT */}
          {activeTab === 'inspect' && inspectedPlan && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-dark-surface/80 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Plan Inspection</span>
                  <h3 className="text-base font-bold text-brand-navy dark:text-white mt-0.5">{inspectedPlan.name}</h3>
                  <p className="text-[11px] font-mono text-slate-500">Plan ID: {inspectedPlan.id} • Product: {inspectedPlan.product_id}</p>
                </div>
                <Badge status={inspectedPlan.status} />
              </div>

              {/* Canonical Fingerprint Box */}
              <div className="p-3.5 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-navy dark:text-blue-300 flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4 text-brand-primary" />
                    Deterministic SHA-256 Plan Fingerprint:
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-600 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950">
                    Persisted in SQLite
                  </span>
                </div>
                <div className="font-mono text-xs font-bold text-brand-primary break-all select-all pt-1">
                  {inspectedPlan.fingerprint}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Computed from canonicalized financial terms: billing cycles, pricing scheme, currency, setup fee, and status.
                </p>
              </div>

              {/* Billing Cycles Breakdown */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-brand-navy dark:text-white block">
                  Configured Billing Cycles ({inspectedPlan.billing_cycles?.length || 0}):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {inspectedPlan.billing_cycles?.map((c, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-800 space-y-1">
                      <div className="flex justify-between font-semibold">
                        <span>Cycle #{c.sequence} ({c.tenure_type})</span>
                        <span className="text-brand-primary font-bold">{displayAmount(c.price_value, c.currency)}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Interval: Every {c.interval_count} {c.interval_unit.toLowerCase()}(s) • Total Cycles: {c.total_cycles === 0 ? 'Indefinite (Auto-Renew)' : c.total_cycles}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Setup Fee</span>
                  <span className="font-bold text-brand-navy dark:text-white">{displayAmount(inspectedPlan.setup_fee, inspectedPlan.setup_fee_currency || inspectedPlan.currency)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Currency</span>
                  <span className="font-bold text-brand-primary">{displayValue(inspectedPlan.currency)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Trial Days</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{inspectedPlan.trial_days === null || inspectedPlan.trial_days === undefined ? 'Unavailable' : `${inspectedPlan.trial_days} Days`}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* User Preferences Card */}
      <Card title="Interface & Theme Preferences">
        <div className="flex items-center justify-between py-2 text-xs">
          <div>
            <h4 className="font-bold text-brand-navy dark:text-white">Theme Selection</h4>
            <p className="text-slate-500 mt-0.5">
              Switch between clean fintech light surface and dark mode.
            </p>
          </div>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-dark-surface font-semibold text-xs text-brand-navy dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Switch to Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-600" />
                <span>Switch to Dark Mode</span>
              </>
            )}
          </button>
        </div>
      </Card>
    </div>
  )
}
