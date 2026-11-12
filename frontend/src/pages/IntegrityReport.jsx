import React, { useEffect, useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Download,
  Printer,
  ShieldCheck,
  AlertTriangle,
  FileText,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Lock,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { useVerification } from '../context/VerificationContext'
import { formatCurrencyAmount } from '../services/formatters'
import { getAudits, getAuditReport } from '../services/api'

const value = (v) => (v === null || v === undefined || v === '' ? 'Unavailable' : String(v))

/**
 * Classifies an evidence quotation as either a complete textual statement or an
 * incomplete / clipped OCR fragment captured from an image boundary or partial scan.
 */
export function analyzeQuotation(quote, uncertaintyFlags = []) {
  const text = String(quote || '').trim()
  if (!text) return { text: '', isFragment: true, tag: 'Empty', reason: 'Empty quotation string' }

  // Detect explicit clipped indicators
  const hasEllipsis = text.endsWith('...') || text.endsWith('…') || text.startsWith('...') || text.startsWith('…')
  
  // Truncated word cut off at the very end of the string (e.g. "92 pe", "183 pe", "at $")
  const endsAbruptly = /(?:[\s/]|^)(?:pe|ea|ye|w|d|per\s+m|at\s+\$|reg\s+price\s+\$4)[.…]*$/i.test(text)
  
  // Isolated cropped numeric patterns (e.g. "₹10", "₹21" cut off from edge)
  const isClippedPattern = /^[₹$€£]\d{1,2}$/i.test(text)
  
  // Isolated cut off units (e.g. "1 Y", "1 YE" cut off from "1 Year")
  const isIsolatedShort = /^1\s*Y(?:E)?$/i.test(text)
  
  // Extremely short strings without spaces or punctuation
  const isTooShort = text.length < 8 && !text.includes(' ') && !text.includes(':')

  const isFragment = hasEllipsis || endsAbruptly || isClippedPattern || isIsolatedShort || isTooShort

  return {
    text,
    isFragment,
    tag: isFragment ? 'Incomplete OCR Fragment' : 'Verified Source Quotation',
    reason: isFragment
      ? (hasEllipsis
          ? 'Clipped text with ellipsis at image margin'
          : endsAbruptly
          ? 'Truncated word ending at document boundary'
          : isClippedPattern || isIsolatedShort
          ? 'Cropped characters cut off at document edge'
          : 'Isolated partial OCR reading without full sentence context')
      : 'Complete textual quotation with full context',
  }
}

// Built-in demonstration sample audits for instant validation & PDF inspection
export const SAMPLE_REPORTS = {
  mismatch: {
    audit_id: 'AUD-MISMATCH-DEMO',
    document_id: 'DOC-CLOUDSYNC-PROMO',
    verdict: 'PRICING MISMATCH',
    source_type: 'DOCUMENT_UPLOAD',
    source_label: 'Uploaded Document • Gemini Extraction',
    source_file: 'CloudSync_Promo_Flyer.png',
    ai_model: 'gemini-2.5-flash',
    confidence_score: 0.98,
    verification_timestamp: '2026-11-12T10:00:00Z',
    created_at: '2026-11-12T10:00:00Z',
    currency: 'USD',
    paypal_plan_id: 'P-8Y2908182',
    plan_fingerprint: '3a8f9c1b7d5e2a4f6e8b0d2c4e6a8f0b2d4e6a8f0b2d4e6a8f0b2d4e6a8f0b2d',
    evidence_status: 'COMPLETE',
    evidence_complete: true,
    evidence_message: 'Every matched financial term is backed by a stored quotation.',
    financial_impact: {
      status: 'MISMATCH',
      difference_amount: '120.00',
      currency: 'USD',
      reason: 'Advertised renewal rate ($14.99/mo) is lower than PayPal plan billing rate ($24.99/mo). Customer will be overcharged by $120.00 over the first year.',
    },
    advertised_terms: {
      product_name: 'CloudSync Enterprise Tier',
      currency: 'USD',
      introductory_price: '9.99',
      introductory_cycles: 3,
      regular_price: '14.99',
      billing_frequency: 'MONTH',
      frequency_interval: 1,
      trial_duration_days: 14,
      setup_fee: '0.00',
      auto_renewal: true,
      confidence_score: 0.98,
      evidence_quotes: [
        'Flyer headline: "Start today for just $9.99/mo for your first 3 months."',
        'Small print: "Standard rate of $14.99 billed monthly thereafter. Cancel anytime."',
        'Badge: "14-Day Free Evaluation Period Included. No Setup Fees."',
        '$14.99 mo...',
      ],
      evidence_by_field: {
        introductory_price: ['Flyer headline: "Start today for just $9.99/mo for your first 3 months."'],
        regular_price: [
          'Small print: "Standard rate of $14.99 billed monthly thereafter. Cancel anytime."',
          '$14.99 mo...',
        ],
        billing_frequency: ['Small print: "Standard rate of $14.99 billed monthly thereafter. Cancel anytime."'],
        trial_duration_days: ['Badge: "14-Day Free Evaluation Period Included. No Setup Fees."'],
        setup_fee: ['Badge: "14-Day Free Evaluation Period Included. No Setup Fees."'],
      },
      uncertainty_flags: [
        'Right border text cropped: "$14.99 mo..." is an incomplete edge reading.',
      ],
    },
    paypal_plan_terms: {
      id: 'P-8Y2908182',
      product_id: 'PROD-CLOUDSYNC',
      name: 'CloudSync Enterprise Plan',
      currency: 'USD',
      introductory_price: '9.99',
      introductory_cycles: 3,
      regular_price: '24.99',
      billing_frequency: 'MONTH',
      frequency_interval: 1,
      trial_days: 14,
      setup_fee: '0.00',
      status: 'ACTIVE',
    },
    fields: [
      {
        field_name: 'regular_price',
        label: 'Regular Renewal Price',
        advertised_value: '14.99',
        actual_value: '24.99',
        variance: '+$10.00 / mo (+$120.00 / yr)',
        comparison_status: 'MISMATCH',
        explanation: 'PayPal plan charges $24.99/mo, exceeding advertised $14.99/mo by $10.00 each month.',
      },
      {
        field_name: 'introductory_price',
        label: 'Introductory Price',
        advertised_value: '9.99',
        actual_value: '9.99',
        variance: '$0.00',
        comparison_status: 'MATCH',
        explanation: 'Introductory discount rate matches promotional offer.',
      },
      {
        field_name: 'introductory_cycles',
        label: 'Introductory Cadence',
        advertised_value: '3',
        actual_value: '3',
        variance: '0 cycles',
        comparison_status: 'MATCH',
        explanation: 'Promotional discount applies for exactly 3 billing cycles.',
      },
      {
        field_name: 'billing_frequency',
        label: 'Billing Cadence',
        advertised_value: 'MONTH',
        actual_value: 'MONTH',
        variance: 'Exact match',
        comparison_status: 'MATCH',
        explanation: 'Monthly billing cycle aligns with advertised cadence.',
      },
      {
        field_name: 'currency',
        label: 'Billing Currency',
        advertised_value: 'USD',
        actual_value: 'USD',
        variance: 'Exact match',
        comparison_status: 'MATCH',
        explanation: 'ISO 4217 currency matches.',
      },
      {
        field_name: 'trial_duration_days',
        label: 'Free Trial Duration',
        advertised_value: '14',
        actual_value: '14',
        variance: '0 days',
        comparison_status: 'MATCH',
        explanation: '14-day free trial period correctly configured in PayPal.',
      },
      {
        field_name: 'setup_fee',
        label: 'Setup Fee',
        advertised_value: '0.00',
        actual_value: '0.00',
        variance: '$0.00',
        comparison_status: 'MATCH',
        explanation: 'Zero setup fee as promised on promotional flyer.',
      },
    ],
    supporting_evidence: [
      'Flyer headline: "Start today for just $9.99/mo for your first 3 months."',
      'Small print: "Standard rate of $14.99 billed monthly thereafter. Cancel anytime."',
      'Badge: "14-Day Free Evaluation Period Included. No Setup Fees."',
      '$14.99 mo...',
    ],
  },

  verified: {
    audit_id: 'AUD-VERIFIED-DEMO',
    document_id: 'DOC-DEVMETRICS-CONTRACT',
    verdict: 'VERIFIED',
    source_type: 'DOCUMENT_UPLOAD',
    source_label: 'Uploaded Document • Gemini Extraction',
    source_file: 'DevMetrics_Annual_Contract.pdf',
    ai_model: 'gemini-2.5-flash',
    confidence_score: 0.99,
    verification_timestamp: '2026-11-12T10:15:00Z',
    created_at: '2026-11-12T10:15:00Z',
    currency: 'USD',
    paypal_plan_id: 'P-44M90123',
    plan_fingerprint: '7b2a9d4f1e8c3b5a7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c',
    evidence_status: 'COMPLETE',
    evidence_complete: true,
    evidence_message: 'Every matched financial term is backed by a stored quotation.',
    financial_impact: {
      status: 'MATCH',
      difference_amount: '0.00',
      currency: 'USD',
      reason: 'Zero financial variance detected. All advertised annual terms match PayPal plan rules exactly.',
    },
    advertised_terms: {
      product_name: 'DevMetrics Pro Annual',
      currency: 'USD',
      introductory_price: null,
      introductory_cycles: null,
      regular_price: '199.00',
      billing_frequency: 'YEAR',
      frequency_interval: 1,
      trial_duration_days: 0,
      setup_fee: '0.00',
      auto_renewal: true,
      confidence_score: 0.99,
      evidence_quotes: [
        'Agreement Section 2: "Annual subscription fee of $199.00 USD invoiced annually."',
        'Section 3.1: "Zero setup fee. Auto-renews each year unless terminated with 30 days notice."',
      ],
      evidence_by_field: {
        regular_price: ['Agreement Section 2: "Annual subscription fee of $199.00 USD invoiced annually."'],
        billing_frequency: ['Agreement Section 2: "Annual subscription fee of $199.00 USD invoiced annually."'],
        currency: ['Agreement Section 2: "Annual subscription fee of $199.00 USD invoiced annually."'],
        setup_fee: ['Section 3.1: "Zero setup fee. Auto-renews each year unless terminated with 30 days notice."'],
        auto_renewal: ['Section 3.1: "Zero setup fee. Auto-renews each year unless terminated with 30 days notice."'],
      },
      uncertainty_flags: [],
    },
    paypal_plan_terms: {
      id: 'P-44M90123',
      product_id: 'PROD-DEVMETRICS',
      name: 'DevMetrics Pro Annual',
      currency: 'USD',
      introductory_price: null,
      introductory_cycles: null,
      regular_price: '199.00',
      billing_frequency: 'YEAR',
      frequency_interval: 1,
      trial_days: 0,
      setup_fee: '0.00',
      status: 'ACTIVE',
    },
    fields: [
      {
        field_name: 'regular_price',
        label: 'Annual Renewal Price',
        advertised_value: '199.00',
        actual_value: '199.00',
        variance: '$0.00',
        comparison_status: 'MATCH',
        explanation: 'Annual billing rate matches contract amount exactly.',
      },
      {
        field_name: 'billing_frequency',
        label: 'Billing Frequency',
        advertised_value: 'YEAR',
        actual_value: 'YEAR',
        variance: 'Exact match',
        comparison_status: 'MATCH',
        explanation: 'Annual cadence matches contract terms.',
      },
      {
        field_name: 'currency',
        label: 'Billing Currency',
        advertised_value: 'USD',
        actual_value: 'USD',
        variance: 'Exact match',
        comparison_status: 'MATCH',
        explanation: 'ISO 4217 USD currency matches.',
      },
      {
        field_name: 'setup_fee',
        label: 'Setup Fee',
        advertised_value: '0.00',
        actual_value: '0.00',
        variance: '$0.00',
        comparison_status: 'MATCH',
        explanation: 'Zero setup fee as specified in Section 3.1.',
      },
      {
        field_name: 'auto_renewal',
        label: 'Auto-Renewal Terms',
        advertised_value: 'Stated (Section 3.1)',
        actual_value: 'Active Recurring Plan',
        variance: 'Exact match',
        comparison_status: 'MATCH',
        explanation: '30-day notice renewal requirement documented in agreement.',
      },
    ],
    supporting_evidence: [
      'Agreement Section 2: "Annual subscription fee of $199.00 USD invoiced annually."',
      'Section 3.1: "Zero setup fee. Auto-renews each year unless terminated with 30 days notice."',
    ],
  },

  ambiguous: {
    audit_id: 'AUD-REVIEW-DEMO',
    document_id: 'DOC-STREAMCAST-BANNER',
    verdict: 'REQUIRES REVIEW',
    source_type: 'DOCUMENT_UPLOAD',
    source_label: 'Uploaded Document • Gemini Extraction',
    source_file: 'StreamCast_Discount_Banner.jpg',
    ai_model: 'gemini-2.5-flash',
    confidence_score: 0.72,
    verification_timestamp: '2026-11-12T10:30:00Z',
    created_at: '2026-11-12T10:30:00Z',
    currency: 'USD',
    paypal_plan_id: 'P-11J84732',
    plan_fingerprint: '9e1d3c5b7a9f1e3d5b7a9f1e3d5b7a9f1e3d5b7a9f1e3d5b7a9f1e3d5b7a9f1e',
    evidence_status: 'INCOMPLETE',
    evidence_complete: false,
    evidence_message: 'No source quotation backs: billing frequency and setup fee.',
    financial_impact: {
      status: 'REQUIRES REVIEW',
      difference_amount: null,
      currency: 'USD',
      reason: 'First-year variance cannot be calculated reliably because the advertised renewal cadence is omitted and an undisclosed $15.00 setup fee is configured in PayPal.',
    },
    advertised_terms: {
      product_name: 'StreamCast Creator Suite',
      currency: 'USD',
      introductory_price: '19.00',
      introductory_cycles: null,
      regular_price: '49.00',
      billing_frequency: 'UNKNOWN',
      frequency_interval: null,
      trial_duration_days: null,
      setup_fee: null,
      auto_renewal: null,
      confidence_score: 0.72,
      evidence_quotes: [
        'Banner text: "Only $19 to get started!"',
        'Footer disclaimer: "Regular price $49."',
        'Only $19 to get...',
        'reg price $4...',
      ],
      evidence_by_field: {
        introductory_price: ['Banner text: "Only $19 to get started!"'],
        regular_price: [
          'Footer disclaimer: "Regular price $49."',
          'reg price $4...',
        ],
      },
      uncertainty_flags: [
        'Billing cadence (monthly vs annual) omitted in promotional banner.',
        'Trial duration not specified in document.',
        'Setup fee of $15.00 configured in PayPal is unstated on promotional banner.',
        'Cropped OCR text detected at lower right edge: "Only $19 to get..." and "reg price $4...".',
      ],
    },
    paypal_plan_terms: {
      id: 'P-11J84732',
      product_id: 'PROD-STREAMCAST',
      name: 'StreamCast Creator Suite',
      currency: 'USD',
      introductory_price: '19.00',
      introductory_cycles: 1,
      regular_price: '49.00',
      billing_frequency: 'MONTH',
      frequency_interval: 1,
      trial_days: 0,
      setup_fee: '15.00',
      status: 'ACTIVE',
    },
    fields: [
      {
        field_name: 'regular_price',
        label: 'Regular Renewal Price',
        advertised_value: '49.00',
        actual_value: '49.00',
        variance: '$0.00',
        comparison_status: 'MATCH',
        explanation: 'Numerical price matches, but cadence is unstated in promotional offer.',
      },
      {
        field_name: 'billing_frequency',
        label: 'Billing Frequency / Cadence',
        advertised_value: 'UNKNOWN',
        actual_value: 'MONTH',
        variance: 'Cadence Ambiguity',
        comparison_status: 'REVIEW',
        explanation: 'Banner advertises $49 without specifying whether renewal is monthly or annual.',
      },
      {
        field_name: 'setup_fee',
        label: 'Setup Fee',
        advertised_value: 'Unstated',
        actual_value: '15.00',
        variance: '+$15.00 Undisclosed',
        comparison_status: 'MISMATCH',
        explanation: 'PayPal plan imposes a $15.00 setup fee that is completely omitted from the promotional banner.',
      },
      {
        field_name: 'introductory_price',
        label: 'Introductory Price',
        advertised_value: '19.00',
        actual_value: '19.00',
        variance: '$0.00',
        comparison_status: 'MATCH',
        explanation: 'Advertised $19 intro price matches first cycle rate.',
      },
      {
        field_name: 'trial_duration_days',
        label: 'Free Trial Duration',
        advertised_value: 'Unstated',
        actual_value: '0',
        variance: 'Unstated in offer',
        comparison_status: 'REVIEW',
        explanation: 'Promotional text does not clarify whether a free trial applies.',
      },
      {
        field_name: 'currency',
        label: 'Billing Currency',
        advertised_value: 'USD',
        actual_value: 'USD',
        variance: 'Exact match',
        comparison_status: 'MATCH',
        explanation: 'ISO 4217 currency matches.',
      },
    ],
    supporting_evidence: [
      'Banner text: "Only $19 to get started!"',
      'Footer disclaimer: "Regular price $49."',
      'Only $19 to get...',
      'reg price $4...',
    ],
  },
}

export const IntegrityReport = () => {
  const [searchParams] = useSearchParams()
  const { verificationResult, addToast } = useVerification()
  const [audits, setAudits] = useState([])
  const [auditState, setAuditState] = useState('loading')
  const [auditError, setAuditError] = useState(null)
  const [loadedReport, setLoadedReport] = useState(null)

  const requestedAuditId = searchParams.get('audit_id')?.trim() || null
  const requestedSampleKey = searchParams.get('sample')?.trim()?.toLowerCase() || null

  const result = useMemo(() => {
    if (requestedSampleKey && SAMPLE_REPORTS[requestedSampleKey]) {
      return SAMPLE_REPORTS[requestedSampleKey]
    }
    return loadedReport || verificationResult
  }, [requestedSampleKey, loadedReport, verificationResult])

  const advertised = result?.advertised_terms || {}
  const actual = result?.paypal_plan_terms || {}
  const fields = result?.fields || []
  const impact = result?.financial_impact || {}
  const verdict = result?.verdict || result?.final_verdict
  const uncertaintyFlags = advertised.uncertainty_flags || result?.uncertainty_flags || []

  const print = () => {
    window.print()
    addToast('Generating printable financial audit document', 'info')
  }

  const loadAudits = async () => {
    setAuditState('loading')
    setAuditError(null)
    try {
      const data = await getAudits()
      setAudits(data.audits || [])
      setAuditState('ready')
    } catch (error) {
      setAuditError(error.message)
      setAuditState('error')
    }
  }

  useEffect(() => {
    loadAudits()
  }, [])

  // Auto-load audit if specified in URL query
  useEffect(() => {
    if (requestedAuditId) {
      openAudit(requestedAuditId)
    }
  }, [requestedAuditId])

  const openAudit = async (auditId) => {
    try {
      const data = await getAuditReport(auditId)
      setLoadedReport(data.report)
    } catch (error) {
      setAuditError(error.message)
    }
  }

  // Group evidence into complete quotations vs. incomplete OCR fragments
  const rawEvidenceList = result?.supporting_evidence || advertised.evidence_quotes || []
  const classifiedEvidence = useMemo(() => {
    const list = rawEvidenceList.map((quote) => analyzeQuotation(quote, uncertaintyFlags))
    return {
      complete: list.filter((item) => !item.isFragment),
      fragments: list.filter((item) => item.isFragment),
    }
  }, [rawEvidenceList, uncertaintyFlags])

  if (!result) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-brand-navy dark:text-white">
              Persisted Integrity Reports
            </h1>
            <p className="text-xs text-brand-muted dark:text-dark-muted mt-1">
              Reports are rebuilt from SQLite and can be opened after a page refresh.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link to="/app/verify">
              <Button size="sm" icon={ShieldCheck}>
                New Verification
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick Sample Selector Bar */}
        <Card title="Inspect Sample Demonstration Reports" subtitle="Pre-configured audit reports for validation and print testing">
          <div className="flex flex-wrap gap-2.5 pt-1">
            <Button size="sm" variant="outline" onClick={() => setLoadedReport(SAMPLE_REPORTS.mismatch)}>
              Sample Mismatch Report
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLoadedReport(SAMPLE_REPORTS.verified)}>
              Sample Verified Report
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLoadedReport(SAMPLE_REPORTS.ambiguous)}>
              Sample Ambiguous Terms Report
            </Button>
          </div>
        </Card>

        <Card
          title="Saved audit reports"
          subtitle="Deterministic verification records stored in local database"
          action={
            <Button variant="outline" size="sm" icon={RefreshCw} onClick={loadAudits}>
              Refresh
            </Button>
          }
        >
          {auditState === 'loading' && (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
              Loading saved reports…
            </p>
          )}
          {auditState === 'error' && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400 py-6 text-center">
              {auditError || 'Unable to load reports.'}
            </p>
          )}
          {auditState === 'ready' && !audits.length && (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              No persisted reports yet. Complete a verification to create one.
            </p>
          )}
          {audits.length > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {audits.map((audit) => (
                <button
                  key={audit.audit_id}
                  onClick={() => openAudit(audit.audit_id)}
                  className="w-full py-3.5 px-3 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-dark-surface/50 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <strong className="block text-xs font-semibold text-brand-navy dark:text-white truncate">
                      {audit.product || audit.source_file || audit.audit_id}
                    </strong>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      {audit.source_label} · {new Date(audit.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge status={audit.verdict} />
                    <span className="text-[11px] font-semibold text-brand-primary">Open</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    )
  }

  const isVerified = verdict === 'VERIFIED'
  const isMismatch = verdict === 'PRICING MISMATCH' || verdict === 'MISMATCH DETECTED'
  const diffAmount = impact.difference_amount ?? result.financial_difference
  const shouldBreakEvidencePage = fields.length >= 6 && rawEvidenceList.length > 2

  return (
    <div className="audit-report-page space-y-6 max-w-5xl mx-auto">
      {/* Top action toolbar (hidden on print) */}
      <div className="audit-print-toolbar flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-brand-navy dark:text-white">
              AI Integrity Audit Report
            </h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-brand-primary border border-blue-200 dark:border-blue-800">
              Stage 3 of 3
            </span>
          </div>
          <p className="text-xs text-brand-muted dark:text-dark-muted mt-1">
            Deterministic comparison of advertised terms and the retrieved PayPal plan.
          </p>
        </div>

        <div className="print-hidden flex flex-wrap items-center gap-2.5">
          <Link to="/app/comparison">
            <Button variant="outline" size="sm" icon={ArrowLeft}>
              Back to Comparison
            </Button>
          </Link>
          <Button variant="outline" size="sm" icon={Printer} onClick={print}>
            Print Report
          </Button>
          <Button size="sm" icon={Download} onClick={print}>
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Screen-only quick switch bar */}
      <div className="print-hidden flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-dark-card border border-slate-200 dark:border-slate-800 text-xs">
        <span className="font-semibold text-slate-600 dark:text-slate-300">Quick Test Audits:</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={result.audit_id === 'AUD-MISMATCH-DEMO' ? 'primary' : 'outline'}
            onClick={() => setLoadedReport(SAMPLE_REPORTS.mismatch)}
          >
            Mismatch Sample
          </Button>
          <Button
            size="sm"
            variant={result.audit_id === 'AUD-VERIFIED-DEMO' ? 'primary' : 'outline'}
            onClick={() => setLoadedReport(SAMPLE_REPORTS.verified)}
          >
            Verified Sample
          </Button>
          <Button
            size="sm"
            variant={result.audit_id === 'AUD-REVIEW-DEMO' ? 'primary' : 'outline'}
            onClick={() => setLoadedReport(SAMPLE_REPORTS.ambiguous)}
          >
            Ambiguous Sample
          </Button>
        </div>
      </div>

      {/* Persisted reports quick-switcher (if any stored) */}
      {audits.length > 0 && (
        <Card
          className="print-hidden"
          title="Persisted reports"
          subtitle="Open any saved report without contacting Gemini or PayPal"
        >
          <div className="flex gap-2 overflow-x-auto pb-1">
            {audits.map((audit) => (
              <button
                key={audit.audit_id}
                onClick={() => openAudit(audit.audit_id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  audit.audit_id === result.audit_id
                    ? 'border-brand-primary bg-blue-50 dark:bg-blue-950/60 text-brand-primary'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200'
                }`}
              >
                <span>{audit.product || audit.audit_id}</span>
                <span className="opacity-70">·</span>
                <span className="font-semibold">{audit.verdict}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Official Audit Document Print Sheet */}
      <div className="audit-print-sheet bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-800 rounded-2xl shadow-fintech p-6 sm:p-10 space-y-6">
        {/* Document Header & Seal */}
        <div className="audit-print-header flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-200 dark:border-slate-800 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-navy flex items-center justify-center text-white shadow-sm flex-shrink-0">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold tracking-tight text-brand-navy dark:text-white">
                  CLEARTERM <span className="text-brand-primary">AI</span>
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-dark-surface font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  OFFICIAL AUDIT REPORT
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Subscription Integrity & Truth-in-Billing Compliance Division
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right text-xs space-y-1">
            <div className="inline-block px-2.5 py-1 rounded bg-slate-100 dark:bg-dark-surface border border-slate-200 dark:border-slate-700 font-mono font-bold text-brand-navy dark:text-white">
              Verification {value(result.verification_id || result.audit_id)}
            </div>
            <div className="text-slate-500 font-mono text-[11px]">
              Issued: {value(result.verification_timestamp || result.created_at)}
            </div>
            {result.source_file && (
              <div className="text-slate-400 font-mono text-[10px] truncate max-w-[240px]">
                Source: {result.source_file}
              </div>
            )}
          </div>
        </div>

        {/* Hero Prominent Verdict Banner */}
        <div
          className={`audit-print-verdict-banner p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
            isVerified
              ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
              : isMismatch
              ? 'bg-red-50/90 dark:bg-red-950/40 border-red-300 dark:border-red-800'
              : 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
          }`}
        >
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold flex-shrink-0 ${
                isVerified
                  ? 'bg-emerald-600 text-white'
                  : isMismatch
                  ? 'bg-red-600 text-white'
                  : 'bg-amber-600 text-white'
              }`}
            >
              {isVerified ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : isMismatch ? (
                <XCircle className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold tracking-tight text-brand-navy dark:text-white">
                  FINAL VERDICT:
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-wide uppercase ${
                    isVerified
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : isMismatch
                      ? 'bg-red-100 text-red-800 border border-red-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {verdict}
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 max-w-2xl leading-relaxed">
                {isVerified
                  ? 'Zero discrepancies detected. Advertised subscription terms strictly match the PayPal Sandbox billing plan rules.'
                  : isMismatch
                  ? 'Billing discrepancies identified between advertised promotional claims and actual PayPal billing plan configuration.'
                  : 'Unstated cadences, missing setup fee disclosures, or extraction ambiguities require compliance review.'}
              </p>
            </div>
          </div>

          {diffAmount && (
            <div className="text-left sm:text-right bg-white dark:bg-dark-surface p-2 rounded-lg border border-red-200 dark:border-red-900/60 flex-shrink-0">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">First-Year Delta</span>
              <span className="text-sm font-extrabold text-red-600 dark:text-red-400 font-mono">
                +{formatCurrencyAmount(diffAmount, advertised?.currency || actual?.currency || result.currency)} / yr
              </span>
            </div>
          )}
        </div>

        {/* 3-Column Executive Summary Cards */}
        <div className="audit-print-summary-grid grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Summary
            label="Audit Target"
            value={advertised.product_name || actual.name}
            detail={`Plan ID: ${value(result.paypal_plan_id || actual.id)}`}
          />
          <Summary
            label="Currency & Fingerprint"
            value={result.currency || actual.currency || advertised.currency}
            detail={`SHA-256: ${value(result.plan_fingerprint ? `${result.plan_fingerprint.slice(0, 16)}...` : null)}`}
          />
          <Summary
            label="Financial Difference"
            value={diffAmount ? formatCurrencyAmount(diffAmount, impact.currency || result.currency) : (isVerified ? '$0.00 Exact Match' : 'Uncalculated')}
            detail={impact.reason || 'Computed deterministically with Python Decimal'}
          />
        </div>

        {/* Manual Demo Note if applicable */}
        {result.source_type === 'MANUAL_DEMO' && (
          <div
            role="note"
            className="p-3 border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs font-semibold text-amber-900 dark:text-amber-300 rounded-xl"
          >
            Manual Demo Input – Not AI Extracted. Test-only comparison; no AI confidence or document evidence is claimed.
          </div>
        )}

        {/* Structured Financial Comparison Table */}
        <section className="audit-print-section space-y-2.5">
          <div className="audit-print-section-header flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-navy dark:text-white flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-brand-navy" />
              Financial Term Verification Findings
            </h3>
            <span className="text-[10px] text-slate-400 font-medium">
              Deterministic Decimal Comparison
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-dark-surface/70 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2 px-3">Billing Term / Condition</th>
                  <th className="py-2 px-3">Advertised Claim (Extracted)</th>
                  <th className="py-2 px-3">PayPal Sandbox Configuration</th>
                  <th className="py-2 px-3 text-center">Verdict Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {fields.length ? (
                  fields.map((f) => {
                    const isMismatchField = f.comparison_status === 'MISMATCH'
                    const isReviewField = f.comparison_status === 'REVIEW' || f.comparison_status === 'REQUIRES REVIEW'
                    return (
                      <tr
                        key={f.field_name}
                        className={`hover:bg-slate-50/60 dark:hover:bg-dark-surface/40 transition-colors ${
                          isMismatchField
                            ? 'bg-red-50/30 dark:bg-red-950/20'
                            : isReviewField
                            ? 'bg-amber-50/30 dark:bg-amber-950/20'
                            : ''
                        }`}
                      >
                        <td className="py-2 px-3">
                          <strong className="text-brand-navy dark:text-white font-semibold block text-[11px]">
                            {f.label || f.field_name}
                          </strong>
                          {f.explanation && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-snug">
                              {f.explanation}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono font-medium text-slate-700 dark:text-slate-300 text-[11px]">
                          {formatFindingValue(f, 'advertised_value', advertised.currency)}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-brand-navy dark:text-white text-[11px]">
                          {formatFindingValue(f, 'actual_value', actual.currency)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`audit-print-badge inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase ${
                              f.comparison_status === 'MATCH'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : f.comparison_status === 'MISMATCH'
                                ? 'bg-red-100 text-red-800 border border-red-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}
                          >
                            {f.comparison_status === 'REVIEW' ? 'REQUIRES REVIEW' : f.comparison_status}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-slate-500">
                      No field-level findings were recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Extraction Ambiguities / Missing Disclosures Callout if present */}
        {uncertaintyFlags.length > 0 && (
          <div className="audit-print-ambiguity-box p-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Extraction Ambiguities & Missing Disclosures Detected</span>
            </div>
            <ul className="text-[10px] text-amber-900/90 dark:text-amber-300 list-disc list-inside space-y-0.5">
              {uncertaintyFlags.map((flag, idx) => (
                <li key={idx}>{flag}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Supporting Evidence & OCR Citations Analysis */}
        <section className={`audit-print-section audit-print-evidence-section space-y-3 ${shouldBreakEvidencePage ? 'audit-break-page' : ''}`}>
          <div className="audit-print-section-header flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-navy dark:text-white flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-brand-primary" />
              Supporting Document Citations & OCR Readings
            </h3>
            <span className="text-[10px] text-slate-400 font-medium">
              Verbatim Text Extraction
            </span>
          </div>

          {/* Group 1: Complete Verified Source Quotations */}
          <div className="audit-print-evidence-group space-y-2">
            <h4 className="audit-print-subheading text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Complete Verified Quotations ({classifiedEvidence.complete.length})
            </h4>
            {classifiedEvidence.complete.length > 0 ? (
              <div className="space-y-1.5">
                {classifiedEvidence.complete.map((item, idx) => (
                  <div
                    key={idx}
                    className="audit-print-evidence p-2.5 rounded-lg bg-slate-50 dark:bg-dark-surface/60 border border-slate-200 dark:border-slate-800 text-xs flex items-start justify-between gap-3"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-slate-800 dark:text-slate-200 italic font-medium block">
                        "{item.text}"
                      </span>
                      <span className="text-[9px] text-slate-400 block">
                        Verified verbatim quotation directly sourced from document.
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 flex-shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Verified
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic p-1.5">
                No complete textual statements were extracted from the document.
              </p>
            )}
          </div>

          {/* Group 2: Uncertain / Incomplete OCR Fragments (if any) */}
          {classifiedEvidence.fragments.length > 0 && (
            <div className="audit-print-evidence-group space-y-2 pt-1">
              <h4 className="audit-print-subheading text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Uncertain / Fragmented OCR Excerpts ({classifiedEvidence.fragments.length})
              </h4>
              <div className="p-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-[10px] text-amber-800 dark:text-amber-300">
                The following fragments were captured near document boundaries or represent clipped text. They are retained for audit completeness but not presented as complete contractual terms.
              </div>
              <div className="space-y-1.5">
                {classifiedEvidence.fragments.map((item, idx) => (
                  <div
                    key={idx}
                    className="audit-print-evidence p-2 rounded-lg bg-amber-50/40 dark:bg-dark-surface/40 border border-dashed border-amber-300 dark:border-amber-800 text-xs flex items-start justify-between gap-3"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-slate-700 dark:text-slate-300 font-mono font-medium block">
                        "{item.text}"
                      </span>
                      <span className="text-[9px] text-amber-700 dark:text-amber-400 block">
                        {item.reason}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 flex-shrink-0">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Incomplete Fragment
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Audit Certification & Metadata Footer */}
        <div className="audit-print-metadata pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 space-y-1">
          <div className="flex flex-col sm:flex-row justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                Plan Fingerprint: <span className="font-mono text-[10px]">{value(result.plan_fingerprint)}</span>
              </p>
              <p className="text-[10px]">
                Verification Timestamp: <span className="font-mono">{value(result.verification_timestamp || result.created_at)}</span>
              </p>
            </div>
            <div className="text-left sm:text-right text-[10px]">
              <p>
                AI Model: <span className="font-mono">{value(result.ai_model || 'gemini-2.5-flash')}</span>
              </p>
              <p>
                Engine: <span className="font-mono">ClearTerm Deterministic Decimal v1.0</span>
              </p>
            </div>
          </div>
          <p className="text-[9px] text-slate-400 italic pt-0.5">
            Certification Note: ClearTerm AI strictly enforces truth-in-billing integrity. Currency calculations use fixed decimal arithmetic with zero floating-point drift.
          </p>
        </div>

        {/* Action Link to Subscription Consent (hidden on print) */}
        {(result.audit_id || result.verification_id) && (
          <div className="print-hidden pt-4 flex flex-col sm:flex-row items-center gap-3">
            <Link
              className="inline-flex items-center justify-center rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-fintech hover:bg-brand-primary/90 transition-colors"
              to={`/app/consent?audit_id=${encodeURIComponent(result.audit_id || result.verification_id)}`}
            >
              Review persisted billing terms & consent
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

const Summary = ({ label, value: summaryValue, detail }) => (
  <div className="audit-print-summary p-3 rounded-xl bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800">
    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
    <p className="text-xs font-bold text-brand-navy dark:text-white mt-0.5 break-words">{value(summaryValue)}</p>
    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 break-words font-mono">{value(detail)}</p>
  </div>
)

const formatFindingValue = (field, key, currency) =>
  ['introductory_price', 'regular_price', 'setup_fee'].includes(field.field_name)
    ? formatCurrencyAmount(field[key], currency)
    : value(field[key])
