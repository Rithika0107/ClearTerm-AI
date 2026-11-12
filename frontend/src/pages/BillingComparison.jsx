import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  GitCompare,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  RefreshCw,
  FileText,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { PlanSelector } from '../components/verification/PlanSelector'
import { useVerification } from '../context/VerificationContext'
import { verifyIntegrity, verifyManualTerms } from '../services/api'
import { formatCurrencyAmount } from '../services/formatters'

const display = (v) => (v === null || v === undefined || v === '' ? 'Unavailable' : String(v))

export const BillingComparison = () => {
  const navigate = useNavigate()
  const {
    uploadedDoc,
    extractionState,
    paypalPlan,
    setPaypalPlan,
    verificationResult,
    setVerificationResult,
    setConsentGranted,
    addToast,
  } = useVerification()

  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState(null)

  const advertised = verificationResult?.advertised_terms || extractionState?.data || {}
  const paypalTerms = verificationResult?.paypal_plan_terms || paypalPlan || {}
  const isManualDemo = verificationResult?.source_type === 'MANUAL_DEMO' || advertised?.source_type === 'MANUAL_DEMO'
  const hasExtractedTerms = Boolean(extractionState?.data && extractionState?.extracted)
  const hasVerificationResult = Boolean(verificationResult)
  const hasPlan = Boolean(paypalPlan?.id || paypalTerms?.id)

  // Empty state check
  if (!hasExtractedTerms && !hasVerificationResult && !isManualDemo) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy dark:text-white">
            PayPal Billing Comparison
          </h1>
          <p className="text-xs text-brand-muted dark:text-dark-muted mt-1">
            Deterministic side-by-side comparison between extracted promotional terms and PayPal Sandbox plans.
          </p>
        </div>

        <Card>
          <div className="py-12 px-4 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-brand-primary mx-auto flex items-center justify-center">
              <GitCompare className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h2 className="text-base font-bold text-brand-navy dark:text-white">
                No Verification Session Loaded
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Please upload a promotional document or select a sample offer in the Offer Verification workspace to initiate a comparison session.
              </p>
            </div>
            <div className="pt-2">
              <Button
                onClick={() => navigate('/app/verify')}
                size="md"
                icon={ArrowLeft}
              >
                Go to Offer Verification
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // Handle running deterministic verification
  const handleRunVerification = async () => {
    const targetPlanId = paypalPlan?.id || paypalTerms?.id
    if (!targetPlanId) {
      addToast('Please select a PayPal Sandbox plan to compare against', 'warning')
      return
    }

    setVerifying(true)
    setError(null)

    try {
      if (uploadedDoc?.id) {
        // Genuine uploaded document verification
        const result = await verifyIntegrity(uploadedDoc.id, targetPlanId)
        setVerificationResult(result)
        setConsentGranted(false)
        addToast('Deterministic comparison completed and persisted to SQLite audit trail.', 'success')
      } else {
        // Fallback for sample documents or client-side demonstration
        const sampleAdvertised = extractionState?.data || {}
        const samplePayload = {
          plan_id: targetPlanId,
          product_name: sampleAdvertised.product_name || 'Sample Offer',
          currency: sampleAdvertised.currency || 'USD',
          regular_price: sampleAdvertised.regular_price || 'UNKNOWN',
          billing_frequency: sampleAdvertised.billing_frequency || 'UNKNOWN',
          frequency_interval: sampleAdvertised.frequency_interval != null ? String(sampleAdvertised.frequency_interval) : '',
          introductory_price: sampleAdvertised.introductory_price != null ? String(sampleAdvertised.introductory_price) : '',
          introductory_cycles: sampleAdvertised.introductory_cycles != null ? String(sampleAdvertised.introductory_cycles) : '',
          trial_duration_days: sampleAdvertised.trial_duration_days != null ? String(sampleAdvertised.trial_duration_days) : '',
          setup_fee: sampleAdvertised.setup_fee != null ? String(sampleAdvertised.setup_fee) : '',
        }
        const result = await verifyManualTerms(samplePayload)
        setVerificationResult(result)
        setConsentGranted(false)
        addToast('Comparison evaluated against selected Sandbox plan.', 'info')
      }
    } catch (err) {
      setError(err.message)
      addToast(`Verification failed: ${err.message}`, 'error')
    } finally {
      setVerifying(false)
    }
  }

  // Prepare comparison fields
  const fields = verificationResult?.fields || [
    {
      field_name: 'regular_price',
      label: 'Regular Renewal Price',
      advertised_value: advertised.regular_price,
      actual_value: paypalTerms.regular_price,
      comparison_status: advertised.regular_price && paypalTerms.regular_price
        ? (String(advertised.regular_price) === String(paypalTerms.regular_price) ? 'MATCH' : 'MISMATCH')
        : 'REVIEW',
      explanation: advertised.regular_price && paypalTerms.regular_price
        ? (String(advertised.regular_price) === String(paypalTerms.regular_price) ? 'Exact numerical match' : 'Advertised regular price differs from PayPal plan.')
        : 'Term not fully configured for comparison.',
    },
    {
      field_name: 'billing_frequency',
      label: 'Billing Frequency / Cadence',
      advertised_value: advertised.billing_frequency,
      actual_value: paypalTerms.billing_frequency,
      comparison_status: advertised.billing_frequency && paypalTerms.billing_frequency
        ? (String(advertised.billing_frequency).toUpperCase() === String(paypalTerms.billing_frequency).toUpperCase() ? 'MATCH' : 'MISMATCH')
        : 'REVIEW',
      explanation: 'Billing period intervals must match exactly.',
    },
    {
      field_name: 'currency',
      label: 'Billing Currency',
      advertised_value: advertised.currency,
      actual_value: paypalTerms.currency,
      comparison_status: advertised.currency && paypalTerms.currency
        ? (String(advertised.currency).toUpperCase() === String(paypalTerms.currency).toUpperCase() ? 'MATCH' : 'MISMATCH')
        : 'REVIEW',
      explanation: 'ISO currency code consistency.',
    },
    {
      field_name: 'introductory_price',
      label: 'Introductory / Trial Price',
      advertised_value: advertised.introductory_price,
      actual_value: paypalTerms.introductory_price,
      comparison_status: advertised.introductory_price === paypalTerms.introductory_price ? 'MATCH' : (advertised.introductory_price ? 'REVIEW' : 'MATCH'),
      explanation: 'Initial discount phase rate.',
    },
    {
      field_name: 'trial_duration_days',
      label: 'Free Trial Duration (Days)',
      advertised_value: advertised.trial_duration_days,
      actual_value: paypalTerms.trial_days || paypalTerms.trial_duration_days,
      comparison_status: 'MATCH',
      explanation: 'Trial evaluation period.',
    },
    {
      field_name: 'setup_fee',
      label: 'Initial Setup Fee',
      advertised_value: advertised.setup_fee,
      actual_value: paypalTerms.setup_fee,
      comparison_status: 'MATCH',
      explanation: 'One-time onboarding surcharge.',
    },
  ]

  const verdict = verificationResult?.verdict || verificationResult?.final_verdict
  const financialImpact = verificationResult?.financial_impact
  const differenceAmount = financialImpact?.difference_amount ?? verificationResult?.financial_difference

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-brand-navy dark:text-white">
              PayPal Billing Comparison
            </h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-brand-primary border border-blue-200 dark:border-blue-800">
              Stage 2 of 3
            </span>
          </div>
          <p className="text-xs text-brand-muted dark:text-dark-muted mt-1">
            Deterministic side-by-side reconciliation of advertised promotional claims against PayPal Sandbox plans.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            icon={ArrowLeft}
            onClick={() => navigate('/app/verify')}
          >
            Back to Verify
          </Button>
          {verificationResult && (
            <Button
              size="sm"
              icon={ArrowRight}
              onClick={() => navigate('/app/reports')}
            >
              View Integrity Report
            </Button>
          )}
        </div>
      </div>

      {/* Manual Demo Banner */}
      {isManualDemo && (
        <div
          role="note"
          className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-3"
        >
          <Info className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <div>
            <strong className="block font-semibold">
              Manual Demo Input – Not AI Extracted. This result is for testing only.
            </strong>
            <span className="text-[11px] opacity-90">
              This comparison was generated from operator manual input for testing and simulation. It carries no AI confidence score, cannot claim document evidence, and cannot be used for subscription checkout.
            </span>
          </div>
        </div>
      )}

      {/* Main Grid: Left Column (Plan Selector & Targets) | Right Column (Comparison Matrix) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Plan Selection & Source Overview (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Target PayPal Plan Card */}
          <Card
            title="Target PayPal Plan"
            subtitle="Select or retrieve the target Sandbox plan"
          >
            <PlanSelector
              selectedPlan={paypalPlan || (paypalTerms?.id ? paypalTerms : null)}
              onSelect={(plan) => setPaypalPlan(plan)}
              onNotify={(msg, type) => addToast(msg, type)}
            />

            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
              <Button
                onClick={handleRunVerification}
                loading={verifying}
                disabled={!hasPlan || verifying}
                size="md"
                className="w-full shadow-fintech"
                icon={GitCompare}
              >
                {verifying ? 'Comparing...' : 'Run Deterministic Verification'}
              </Button>
              <p className="text-[10px] text-center text-slate-400 mt-2">
                Evaluates fixed decimal difference with zero floating-point drift
              </p>
            </div>
          </Card>

          {/* Document / Source Information Card */}
          <Card
            title="Extraction Source"
            subtitle="Document or simulation origin"
          >
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Source Type</span>
                <span className="font-semibold text-brand-navy dark:text-white">
                  {verificationResult?.source_label || (uploadedDoc ? 'Uploaded Document • Gemini' : 'Demonstration Input')}
                </span>
              </div>
              {uploadedDoc && (
                <>
                  <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Filename</span>
                    <span className="font-mono text-[11px] truncate max-w-[180px]">{uploadedDoc.name}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Binary Hash</span>
                    <span className="font-mono text-[10px] truncate max-w-[180px]" title={uploadedDoc.hash}>
                      {uploadedDoc.hash ? `${uploadedDoc.hash.slice(0, 16)}...` : 'Unavailable'}
                    </span>
                  </div>
                </>
              )}
              {advertised?.confidence_score != null && (
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-slate-500">Gemini Confidence</span>
                  <span className="font-bold text-brand-primary">
                    {Math.round(advertised.confidence_score * 100)}%
                  </span>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Side-by-Side Comparison Matrix (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Audit Verdict Banner (if verified) */}
          {verdict && (
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                verdict === 'VERIFIED'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                  : verdict === 'PRICING MISMATCH'
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                    verdict === 'VERIFIED'
                      ? 'bg-emerald-600 text-white'
                      : verdict === 'PRICING MISMATCH'
                      ? 'bg-red-600 text-white'
                      : 'bg-amber-600 text-white'
                  }`}
                >
                  {verdict === 'VERIFIED' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : verdict === 'PRICING MISMATCH' ? (
                    <XCircle className="w-5 h-5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-brand-navy dark:text-white">
                      Verification Verdict:
                    </span>
                    <Badge status={verdict} />
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {verdict === 'VERIFIED'
                      ? 'All advertised terms strictly match the PayPal Sandbox plan configuration.'
                      : verdict === 'PRICING MISMATCH'
                      ? 'Discrepancies identified between advertised pricing and actual PayPal billing rates.'
                      : 'Certain advertised terms are unstated, ambiguous, or require manual compliance review.'}
                  </p>
                </div>
              </div>

              {differenceAmount && (
                <div className="text-left sm:text-right flex-shrink-0">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">First-Year Delta</span>
                  <span className="text-sm font-extrabold text-red-600 dark:text-red-400 font-mono">
                    {formatCurrencyAmount(differenceAmount, advertised?.currency || paypalTerms?.currency)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Side-by-side Comparison Matrix */}
          <Card
            title="Decimal Term Reconciliation"
            subtitle="Field-by-field truth-in-billing verification"
            action={
              verificationResult && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={FileText}
                  onClick={() => navigate('/app/reports')}
                >
                  Full Report
                </Button>
              )
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    <th className="py-2.5 px-3">Term / Field</th>
                    <th className="py-2.5 px-3">Advertised Claim</th>
                    <th className="py-2.5 px-3">PayPal Sandbox Actual</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {fields.map((field) => {
                    const isCurrencyField = ['regular_price', 'introductory_price', 'setup_fee'].includes(field.field_name)
                    const formatVal = (v) => isCurrencyField
                      ? formatCurrencyAmount(v, advertised.currency || paypalTerms.currency)
                      : display(v)

                    return (
                      <tr key={field.field_name} className="hover:bg-slate-50/70 dark:hover:bg-dark-surface/40 transition-colors">
                        <td className="py-3 px-3">
                          <span className="font-semibold text-brand-navy dark:text-white block">
                            {field.label || field.field_name}
                          </span>
                          {field.explanation && (
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              {field.explanation}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                          {formatVal(field.advertised_value)}
                        </td>
                        <td className="py-3 px-3 font-mono text-brand-navy dark:text-white font-medium">
                          {formatVal(field.actual_value)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Badge status={field.comparison_status === 'REVIEW' ? 'REQUIRES REVIEW' : field.comparison_status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Workflow Action Bar */}
            <div className="pt-6 mt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                {verificationResult ? (
                  <span>
                    Audit record: <strong className="font-mono text-brand-navy dark:text-white">{verificationResult.audit_id || verificationResult.verification_id}</strong>
                  </span>
                ) : (
                  <span>Select a PayPal plan and run verification to persist this comparison.</span>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button
                  onClick={() => navigate('/app/reports')}
                  variant={verificationResult ? 'primary' : 'outline'}
                  size="sm"
                  className="w-full sm:w-auto"
                  icon={FileText}
                >
                  Generate Integrity Report
                </Button>
                {verdict === 'VERIFIED' && !isManualDemo && (
                  <Button
                    onClick={() => navigate(`/app/consent?audit_id=${verificationResult.audit_id || verificationResult.verification_id}`)}
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    icon={Lock}
                  >
                    Proceed to Consent
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
