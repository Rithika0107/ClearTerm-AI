import React, { useEffect, useState } from 'react'
import { CheckCircle2, Database, Fingerprint, RefreshCw, Search } from 'lucide-react'
import { Button } from '../common/Button'
import { Badge } from '../common/Badge'
import { getPersistedPlanSnapshots, getPayPalPlanDetails } from '../../services/api'
import { formatCurrencyAmount } from '../../services/formatters'

const display = (value) => (value === null || value === undefined || value === '' ? 'Unavailable' : String(value))

/**
 * Binds the verification workspace to an actual PayPal plan.
 *
 * Persisted snapshots are read from SQLite and require no provider call. A live
 * retrieval only happens when the operator explicitly asks for it, which keeps
 * the demo free of unintended PayPal traffic.
 */
export const PlanSelector = ({ selectedPlan, onSelect, onNotify = () => {} }) => {
  const [snapshots, setSnapshots] = useState([])
  const [state, setState] = useState('loading')
  const [planId, setPlanId] = useState('')
  const [retrieving, setRetrieving] = useState(false)
  const [error, setError] = useState(null)

  const loadSnapshots = async () => {
    setState('loading')
    try {
      const data = await getPersistedPlanSnapshots()
      setSnapshots(data.plans || [])
      setState('ready')
    } catch (loadError) {
      setSnapshots([])
      setState('error')
      setError(loadError.message)
    }
  }

  useEffect(() => { loadSnapshots() }, [])

  const chooseSnapshot = (snapshot) => {
    onSelect({ id: snapshot.id, name: snapshot.name, currency: snapshot.currency, status: snapshot.status })
    onNotify(`Verification will target persisted Sandbox plan ${snapshot.id}.`, 'info')
  }

  const retrieveLive = async () => {
    const trimmed = planId.trim()
    if (!trimmed) return
    setRetrieving(true)
    setError(null)
    try {
      const data = await getPayPalPlanDetails(trimmed)
      const plan = data.plan
      onSelect({
        id: plan.id,
        name: plan.name,
        currency: plan.currency,
        status: plan.status,
        fingerprint: plan.fingerprint,
        regular_price: plan.regular_price,
      })
      setPlanId('')
      await loadSnapshots()
      onNotify(`Retrieved live Sandbox plan ${plan.id} and stored its fingerprint.`, 'success')
    } catch (retrieveError) {
      setError(retrieveError.message)
      onNotify(retrieveError.message, 'error')
    } finally {
      setRetrieving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-[11px] text-brand-navy dark:text-blue-200">
        Selecting a plan performs no PayPal call. A live retrieval is a separate, explicit action.
      </div>

      {selectedPlan && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Target plan selected
          </span>
          <p className="mt-1 font-mono text-brand-navy dark:text-white">{selectedPlan.id}</p>
          <p className="text-slate-500">{display(selectedPlan.name)}</p>
        </div>
      )}

      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Database className="w-3 h-3" /> Persisted Sandbox plans
        </span>
        {state === 'loading' && <p className="text-[11px] text-slate-500 mt-2">Loading persisted plan snapshots…</p>}
        {state === 'error' && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
        {state === 'ready' && !snapshots.length && (
          <p className="text-[11px] text-slate-500 mt-2">
            No plan snapshots stored yet. Inspect a plan in Platform Settings, or retrieve one by ID below.
          </p>
        )}
        {state === 'ready' && snapshots.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {snapshots.map((snapshot) => {
              const active = selectedPlan?.id === snapshot.id
              return (
                <li key={snapshot.id}>
                  <button
                    type="button"
                    onClick={() => chooseSnapshot(snapshot)}
                    className={`w-full text-left p-2.5 rounded-lg border text-[11px] transition-colors ${
                      active
                        ? 'border-brand-primary bg-blue-50 dark:bg-blue-950/40'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-brand-navy dark:text-white truncate">
                        {display(snapshot.name)}
                      </span>
                      <Badge status={snapshot.status || 'UNKNOWN'} />
                    </div>
                    <span className="font-mono text-slate-500 block truncate">{snapshot.id}</span>
                    <span className="text-slate-500">
                      {formatCurrencyAmount(snapshot.regular_price, snapshot.currency)} ·{' '}
                      {display(snapshot.billing_frequency)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400" htmlFor="plan-id-input">
          Retrieve a live Sandbox plan by ID
        </label>
        <div className="flex gap-2">
          <input
            id="plan-id-input"
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
            placeholder="P-XXXXXXXXXXXX"
            className="flex-1 px-2.5 py-1.5 rounded-lg text-[11px] font-mono border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-card"
          />
          <Button size="sm" variant="outline" icon={retrieving ? RefreshCw : Search} loading={retrieving} disabled={!planId.trim()} onClick={retrieveLive}>
            Retrieve
          </Button>
        </div>
        <p className="text-[10px] text-slate-400 flex items-center gap-1">
          <Fingerprint className="w-3 h-3" /> Requires configured Sandbox credentials; the canonical fingerprint is stored on success.
        </p>
      </div>
    </div>
  )
}
