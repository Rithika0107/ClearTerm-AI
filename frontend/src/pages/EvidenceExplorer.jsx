import React, { useEffect, useMemo, useState } from 'react'
import { Search, FileText, RefreshCw, Database, Filter } from 'lucide-react'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { getEvidence } from '../services/api'

const fieldSearchText = (fields = []) =>
  fields
    .map((field) =>
      Object.values(field)
        .map((value) => (typeof value === 'string' ? value : JSON.stringify(value ?? '')))
        .join(' ')
    )
    .join(' ')

export const EvidenceExplorer = () => {
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [records, setRecords] = useState([])
  const [state, setState] = useState('loading')

  const load = async () => {
    setState('loading')
    try {
      const result = await getEvidence()
      setRecords(result.records || [])
      setState('ready')
    } catch {
      setRecords([])
      setState('error')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredItems = useMemo(
    () =>
      records.filter((item) => {
        const quotes = (item.evidence_quotes || []).join(' ')
        const fieldEvidence = Object.entries(item.evidence_by_field || {})
          .map(([field, values]) => `${field} ${(values || []).join(' ')}`)
          .join(' ')
        const haystack = [
          item.title,
          item.extracted_terms,
          item.plan_linked,
          item.source_file,
          item.source_label,
          item.verdict,
          item.evidence_status,
          item.evidence_message,
          item.ai_model,
          item.event_id,
          quotes,
          fieldEvidence,
          fieldSearchText(item.field_results),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return (
          haystack.includes(query.trim().toLowerCase()) &&
          (categoryFilter === 'ALL' || item.category === categoryFilter)
        )
      }),
    [records, query, categoryFilter]
  )

  const CATEGORIES = ['ALL', 'PROMO_ADVERTISEMENT', 'PLAN_SNAPSHOT', 'VERIFICATION_AUDIT', 'WEBHOOK_EVENT']

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-brand-navy dark:text-white">
              Financial Evidence Explorer
            </h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-brand-primary border border-blue-200 dark:border-blue-800">
              Persisted SQLite Records
            </span>
          </div>
          <p className="text-xs text-brand-muted dark:text-dark-muted mt-1">
            Search original quotations, audited terms, sources, verdicts, plan snapshots and signature-verified webhook records.
          </p>
        </div>

        <Button variant="outline" size="sm" icon={RefreshCw} onClick={load}>
          Refresh Records
        </Button>
      </div>

      {/* Search and Category Filters */}
      <Card bodyClassName="p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search source quotations, terms, labels, IDs..."
            className="w-full pl-9 pr-4 py-2.5 rounded-lg text-xs bg-slate-50 dark:bg-dark-surface border border-slate-200 dark:border-slate-700 text-brand-text dark:text-dark-text placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-medium whitespace-nowrap">Filter Category:</span>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                categoryFilter === cat
                  ? 'bg-brand-primary text-white'
                  : 'bg-slate-100 dark:bg-dark-surface text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {cat.replaceAll('_', ' ')}
            </button>
          ))}
        </div>
      </Card>

      {/* State Handlers */}
      {state === 'loading' && (
        <Card>
          <p className="p-8 text-sm text-slate-500 dark:text-slate-400 text-center">
            Loading persisted evidence records…
          </p>
        </Card>
      )}

      {state === 'error' && (
        <Card>
          <div className="p-8 text-sm text-red-600 dark:text-red-400 text-center space-y-3">
            <p>Unable to load persisted evidence records.</p>
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      {state === 'ready' && !filteredItems.length && (
        <Card>
          <p className="p-8 text-sm text-slate-500 dark:text-slate-400 text-center">
            No persisted evidence records match this view. Demonstration records are not displayed here.
          </p>
        </Card>
      )}

      {/* Records Grid */}
      {state === 'ready' && filteredItems.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredItems.map((item) => {
            const evidenceEntries = Object.entries(item.evidence_by_field || {}).flatMap(
              ([field, values]) =>
                (values || []).map((quote, index) => ({
                  field,
                  quote,
                  id: `${field}-${index}`,
                }))
            )

            return (
              <Card
                key={item.id}
                className="hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                        {item.category.replaceAll('_', ' ')} · {item.id}
                      </span>
                      <h3 className="text-sm font-bold text-brand-navy dark:text-white mt-1 break-words">
                        {item.title || 'Untitled persisted record'}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        {item.source_label || 'Source label unavailable'}
                      </p>
                    </div>
                    <Badge status={item.verdict || 'REQUIRES REVIEW'} />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800 p-2">
                      <span className="text-slate-400 uppercase font-semibold text-[10px]">Evidence status</span>
                      <p className="font-semibold text-brand-navy dark:text-white mt-0.5">{item.evidence_status || 'Not assessed'}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800 p-2">
                      <span className="text-slate-400 uppercase font-semibold text-[10px]">Plan / audit</span>
                      <p className="font-mono mt-0.5 truncate text-brand-navy dark:text-white">{item.plan_linked || item.audit_id || 'Not linked'}</p>
                    </div>
                  </div>

                  {item.evidence_message && (
                    <p className="mt-3 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {item.evidence_message}
                    </p>
                  )}

                  {/* Audited terms and findings */}
                  {item.field_results?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Audited terms and verdict evidence
                      </h4>
                      {item.field_results.map((field) => (
                        <div
                          key={field.field_name}
                          className="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5 text-[11px] bg-slate-50/50 dark:bg-dark-surface/40 space-y-1"
                        >
                          <div className="flex flex-wrap justify-between items-center gap-2">
                            <strong className="text-brand-navy dark:text-white font-semibold">
                              {field.label || field.field_name}
                            </strong>
                            <Badge
                              status={
                                field.comparison_status === 'REVIEW'
                                  ? 'REQUIRES REVIEW'
                                  : field.comparison_status
                              }
                            />
                          </div>
                          <p className="text-slate-500 dark:text-slate-400">
                            Advertised: {field.advertised_value ?? 'Unavailable'} · PayPal:{' '}
                            {field.actual_value ?? 'Unavailable'}
                          </p>
                          {field.explanation && (
                            <p className="text-slate-600 dark:text-slate-300">{field.explanation}</p>
                          )}
                          {field.evidence && (
                            <blockquote className="border-l-2 border-brand-primary pl-2 italic text-slate-600 dark:text-slate-300">
                              {typeof field.evidence === 'string'
                                ? field.evidence
                                : JSON.stringify(field.evidence)}
                            </blockquote>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Field citations */}
                  {evidenceEntries.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Original source quotations
                      </h4>
                      {evidenceEntries.map(({ field, quote, id }) => (
                        <blockquote
                          key={id}
                          className="rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border-l-2 border-brand-primary p-2.5 text-xs italic text-slate-700 dark:text-slate-200"
                        >
                          <span className="block not-italic text-[10px] uppercase font-semibold text-brand-primary mb-1">
                            {field.replaceAll('_', ' ')}
                          </span>
                          “{quote}”
                        </blockquote>
                      ))}
                    </div>
                  )}

                  {/* Recorded quotations fallback */}
                  {!evidenceEntries.length && item.evidence_quotes?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Recorded quotations
                      </h4>
                      {item.evidence_quotes.map((quote, index) => (
                        <blockquote
                          key={index}
                          className="rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border-l-2 border-brand-primary p-2.5 text-xs italic text-slate-700 dark:text-slate-200"
                        >
                          “{quote}”
                        </blockquote>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 gap-2">
                  <span className="flex items-center gap-1 font-mono truncate">
                    <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    {item.source_file || 'Unavailable'}
                  </span>
                  <span className="font-mono text-brand-primary font-semibold flex-shrink-0">
                    {item.date ? new Date(item.date).toLocaleString() : ''}
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
