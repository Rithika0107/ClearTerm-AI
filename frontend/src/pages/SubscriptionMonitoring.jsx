import React, { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, Activity, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { getSubscriptions } from '../services/api'

export const SubscriptionMonitoring = () => {
  const [subscriptions, setSubscriptions] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')
  const [selected, setSelected] = useState(null)
  const [state, setState] = useState('loading')
  const [refreshing, setRefreshing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  const load = async () => {
    setRefreshing(true)
    if (!subscriptions.length) setState('loading')
    setSyncMessage('')
    try {
      const data = await getSubscriptions({ refresh: true })
      setSubscriptions(data.subscriptions || [])
      setState('ready')
      if (data.sync_failures) {
        setSyncMessage(`PayPal status refresh failed for ${data.sync_failures} record(s); stored status is shown.`)
      } else {
        setSyncMessage(
          data.refreshed_from_paypal
            ? 'Subscription statuses refreshed from PayPal Sandbox.'
            : 'Showing stored subscription statuses; live refresh was unavailable.'
        )
      }
    } catch (error) {
      try {
        const stored = await getSubscriptions()
        setSubscriptions(stored.subscriptions || [])
        setState('ready')
        setSyncMessage(`Live PayPal refresh unavailable (${error.message || 'connection error'}). Showing persisted subscription status.`)
      } catch (storedError) {
        setState(subscriptions.length ? 'ready' : 'error')
        setSyncMessage(storedError.message || 'Unable to load persisted subscription records.')
      }
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const rows = useMemo(
    () =>
      subscriptions.filter(
        (s) =>
          (status === 'ALL' || s.status === status) &&
          `${s.id} ${s.paypal_plan_id} ${s.customer_reference || ''}`.toLowerCase().includes(search.toLowerCase())
      ),
    [subscriptions, search, status]
  )

  const STATUS_FILTERS = ['ALL', 'APPROVAL_PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED']

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-brand-navy dark:text-white">
              Subscription Monitoring
            </h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-brand-primary border border-blue-200 dark:border-blue-800">
              Live PayPal Sync
            </span>
          </div>
          <p className="text-xs text-brand-muted dark:text-dark-muted mt-1">
            Subscription lifecycle monitoring with status synchronization from PayPal Sandbox.
          </p>
        </div>

        <Button variant="outline" size="sm" icon={RefreshCw} loading={refreshing} onClick={load}>
          Refresh Records
        </Button>
      </div>

      {syncMessage && (
        <p role="status" className="text-xs text-slate-500 dark:text-slate-400">
          {syncMessage}
        </p>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID, plan or customer..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-card text-brand-text dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                status === s
                  ? 'bg-brand-primary text-white border border-brand-primary'
                  : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-card text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {s.replaceAll('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Table Card */}
      <Card bodyClassName="p-0">
        {state === 'loading' && (
          <p className="p-8 text-sm text-slate-500 dark:text-slate-400 text-center">
            Loading PayPal subscription records…
          </p>
        )}
        {state === 'error' && (
          <p className="p-8 text-sm text-red-600 dark:text-red-400 text-center">
            Unable to load subscription records.
          </p>
        )}
        {state === 'ready' && !rows.length && (
          <p className="p-8 text-sm text-slate-500 dark:text-slate-400 text-center">
            No persisted subscription records match this view.
          </p>
        )}
        {state === 'ready' && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-dark-surface/70 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-dark-muted">
                  <th className="py-3 px-4">Subscription ID</th>
                  <th className="py-3 px-4">Plan ID</th>
                  <th className="py-3 px-4">Customer Reference</th>
                  <th className="py-3 px-4">Billing Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Next Billing</th>
                  <th className="py-3 px-4">Last Verified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className="hover:bg-slate-50 dark:hover:bg-dark-surface/50 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono font-medium text-brand-primary">{s.id}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">{s.paypal_plan_id}</td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">{s.customer_reference || 'Unavailable'}</td>
                    <td className="py-3.5 px-4 font-semibold text-brand-navy dark:text-white">
                      {s.billing_amount} {s.currency}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge status={s.status} />
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                      {s.next_billing_time || 'Unavailable'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                      {s.last_verified_at || 'Unavailable'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Selected Subscription Details Modal/Drawer */}
      {selected && (
        <Card
          title={`Subscription ${selected.id}`}
          subtitle="Detailed PayPal lifecycle snapshot"
          action={
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
          }
        >
          <div className="text-xs space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600 dark:text-slate-300">PayPal lifecycle status:</span>
              <Badge status={selected.status} />
            </div>

            {selected.last_payment_status && (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600 dark:text-slate-300">Last signed payment event:</span>
                <Badge status={selected.last_payment_status} />
                <span className="text-slate-500 font-mono text-[11px]">{selected.last_payment_event_at || ''}</span>
              </div>
            )}

            {selected.last_payment_status === 'FAILED' && (
              <p
                role="alert"
                className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
              >
                PayPal reported a failed payment. The subscription lifecycle status remains sourced separately from PayPal.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">PayPal Plan ID</span>
                <span className="font-mono font-medium text-brand-navy dark:text-white">{selected.paypal_plan_id}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Billing Rate</span>
                <span className="font-medium text-brand-navy dark:text-white">
                  {selected.billing_amount} {selected.currency}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Next Billing Time</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {selected.next_billing_time || 'Unavailable'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Consent Recorded At</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {selected.consent_recorded_at || 'Unavailable'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Created Date</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">{selected.created_at}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Last Verified</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">{selected.last_verified_at}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 italic pt-1">
              Approval is not payment confirmation. Recurring payments are tracked via signature-verified webhooks.
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
