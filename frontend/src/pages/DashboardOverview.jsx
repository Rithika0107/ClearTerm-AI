import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, Layers, CheckCircle2, XCircle, HelpCircle, Info, RefreshCw } from 'lucide-react'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { getDashboard } from '../services/api'

export const DashboardOverview = () => {
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')
  const load = async () => {
    setState('loading')
    try { setData(await getDashboard()); setState('ready') }
    catch { setData(null); setState('error') }
  }
  useEffect(() => { load() }, [])

  const persisted = data?.counts || {}
  const counts = {
    total: persisted.document_audits || 0,
    verified: persisted.document_verified || 0,
    mismatches: persisted.document_mismatches || 0,
    reviews: persisted.document_reviews || 0,
  }
  const rate = counts.total ? `${((counts.verified / counts.total) * 100).toFixed(1)}% deterministic match rate` : 'No uploaded-document audits yet'
  const metrics = [
    ['Uploaded Offers Audited', counts.total, Layers, 'text-brand-primary'],
    ['Verified Clean Offers', counts.verified, CheckCircle2, 'text-emerald-600 dark:text-emerald-400'],
    ['Pricing Mismatches', counts.mismatches, XCircle, 'text-red-600 dark:text-red-400'],
    ['Requires Review', counts.reviews, HelpCircle, 'text-amber-600 dark:text-amber-400'],
  ]

  return <div className="w-full min-w-0 space-y-6 sm:space-y-7">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy dark:text-white">Financial Overview Dashboard</h1>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-brand-primary dark:text-blue-300 border border-blue-200 dark:border-blue-800">Persisted Audit Data</span>
        </div>
        <p className="text-xs leading-5 text-brand-muted dark:text-dark-muted">Statistics are calculated from verification audits persisted by the backend.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="outline" size="sm" icon={RefreshCw} onClick={load}>Refresh</Button>
        <Link to="/app/verify"><Button size="sm" icon={ShieldCheck}>New Document Audit</Button></Link>
      </div>
    </div>

    <div className="flex items-start gap-2.5 rounded-xl border border-blue-200/80 bg-blue-50/80 p-3.5 text-xs leading-5 text-brand-navy dark:border-blue-900/40 dark:bg-dark-surface/90 dark:text-blue-300">
      <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-primary" />
      <span><strong>Uploaded-document audits only:</strong> manual demo comparisons are excluded from these metrics. {persisted.manual_demo_audits || 0} persisted demo audit(s) are kept separate.</span>
    </div>

    {state === 'loading' && <Card><p className="p-8 text-sm text-slate-500 dark:text-dark-muted">Loading persisted dashboard statistics…</p></Card>}
    {state === 'error' && <Card><div className="p-8 text-sm text-red-600 dark:text-red-400"><p>Unable to load dashboard statistics.</p><Button variant="outline" size="sm" className="mt-3" onClick={load}>Retry</Button></div></Card>}

    {state === 'ready' && <>
      <section aria-label="Audit statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value, Icon, color]) => <Card key={label} className="h-full" bodyClassName="!p-0">
          <div className="flex h-full flex-col justify-between p-4 sm:p-5" style={{ minHeight: 150 }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="min-h-8 text-xs font-medium leading-4 text-brand-muted dark:text-dark-muted">{label}</p>
              <h2 className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</h2>
            </div>
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/70">
              <Icon aria-hidden="true" className={`h-5 w-5 ${color}`} />
            </span>
          </div>
          <p className="mt-3 text-xs leading-4 text-brand-muted dark:text-dark-muted">{label === 'Verified Clean Offers' ? rate : 'Persisted uploaded-document audits'}</p>
          </div>
        </Card>)}
      </section>

      <Card title="Verification Trend" subtitle="Persisted uploaded-document audit outcomes by date" bodyClassName="p-4 sm:p-5">
        {(data?.trend || []).length ? <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-3">
          {data.trend.map((item) => <div key={item.date} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-dark-surface/60">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 pb-2 dark:border-slate-700">
              <p className="truncate text-sm font-semibold text-brand-navy dark:text-white">{item.date}</p>
              <p className="flex-shrink-0 text-xs text-brand-muted dark:text-dark-muted">{item.total} audit{item.total === 1 ? '' : 's'}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <TrendCount label="Verified" value={item.verified} color="text-emerald-700 dark:text-emerald-400" />
              <TrendCount label="Mismatch" value={item.mismatches} color="text-red-700 dark:text-red-400" />
              <TrendCount label="Review" value={item.reviews} color="text-amber-700 dark:text-amber-400" />
            </div>
          </div>)}
        </div> : <p className="text-sm text-slate-500 dark:text-dark-muted">No persisted uploaded-document trend data is available.</p>}
      </Card>

      <Card title="Recent Verification Activity" subtitle="Latest persisted audits, with source labels" bodyClassName="p-0">
        {(data?.recent_audits || []).length ? <>
          <p className="px-4 py-2 text-[11px] text-brand-muted dark:text-dark-muted">When the table extends beyond the card, scroll horizontally to see the remaining columns.</p>
          <div className="overflow-x-auto" role="region" aria-label="Recent verification activity table" tabIndex={0}>
          <table className="w-full table-fixed border-collapse text-left text-xs" style={{ minWidth: 1060 }}>
            <colgroup>
              <col style={{ width: '12%' }} /><col style={{ width: '18%' }} /><col style={{ width: '10%' }} />
              <col style={{ width: '17%' }} /><col style={{ width: '15%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} />
            </colgroup>
            <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-dark-surface/70 dark:text-dark-muted">
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th scope="col" className="px-4 py-3.5">Audit ID</th><th scope="col" className="px-4 py-3.5">Product / Offer</th>
                <th scope="col" className="px-4 py-3.5">Advertised</th><th scope="col" className="px-4 py-3.5">PayPal Plan</th>
                <th scope="col" className="px-4 py-3.5">Verdict</th><th scope="col" className="px-4 py-3.5">Source</th><th scope="col" className="px-4 py-3.5">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recent_audits.map((audit) => <tr key={audit.id} className="align-middle text-brand-text hover:bg-slate-50/80 dark:text-dark-text dark:hover:bg-dark-surface/50">
                <td className="break-all px-4 py-3.5 font-mono text-[11px] leading-4 text-brand-primary">{audit.id}</td>
                <td className="break-words px-4 py-3.5 font-semibold leading-5">{audit.product || 'Unavailable'}</td>
                <td className="whitespace-nowrap px-4 py-3.5 tabular-nums">{audit.advertised_price || 'Unavailable'}</td>
                <td className="break-all px-4 py-3.5 font-mono text-[11px] leading-4">{audit.paypal_plan_id || 'Unavailable'}</td>
                <td className="px-4 py-3.5"><div className="flex items-center"><Badge status={audit.verdict} /></div></td>
                <td className="break-words px-4 py-3.5 leading-5 text-brand-muted dark:text-dark-muted">{audit.source_label || audit.source_file || 'Unavailable'}</td>
                <td className="break-words px-4 py-3.5 leading-5 text-brand-muted dark:text-dark-muted">{audit.discrepancy || 'Unavailable'}</td>
              </tr>)}
            </tbody>
          </table>
          </div>
        </> : <p className="p-8 text-sm text-slate-500 dark:text-dark-muted">No persisted verification audits are available.</p>}
      </Card>
    </>}
  </div>
}

const TrendCount = ({ label, value, color }) => <div className="min-w-0">
  <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-dark-muted">{label}</p>
  <p className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</p>
</div>
