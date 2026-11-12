import React, { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { Lock, ShieldCheck, AlertCircle } from 'lucide-react'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { useVerification } from '../context/VerificationContext'
import { createPayPalSubscription, getAuditReport, getPayPalSubscription } from '../services/api'
import { formatCurrencyAmount } from '../services/formatters'

const show = (v) => v === null || v === undefined || v === '' ? 'Unavailable' : String(v)

/**
 * Renders a trial-days value with an explicit distinction between:
 *   null / undefined → "Unstated in offer" (data was not present)
 *   0               → "0 days (No free trial)" (PayPal confirmed: no trial cycle)
 *   N               → "N days"
 */
const showTrialDays = (v, source = 'paypal') => {
  if (v === null || v === undefined) return source === 'advertised' ? 'Unstated in offer' : 'Not configured'
  if (v === 0 || v === '0') return '0 days (No free trial)'
  return `${v} day${Number(v) === 1 ? '' : 's'}`
}

/**
 * Renders a monetary field with an explicit distinction between:
 *   null / undefined / UNKNOWN → 'Unstated in offer' or 'Not configured'
 *   0 / "0.00"                 → formatted zero (e.g. "$0.00 — No fee")
 *   valid number               → formatted amount with currency
 */
const showMoney = (v, currency, source = 'paypal') => {
  if (v === null || v === undefined || v === '' || String(v).trim().toUpperCase() === 'UNKNOWN') {
    return source === 'advertised' ? 'Unstated in offer' : 'Not configured'
  }
  const num = typeof v === 'number' ? v : Number(String(v).trim())
  if (!Number.isFinite(num)) return source === 'advertised' ? 'Unstated in offer' : 'Not configured'
  const formatted = formatCurrencyAmount(v, currency)
  if (num === 0) return `${formatted === 'Unavailable' ? '0' : formatted} — No fee`
  return formatted === 'Unavailable' ? `${num} ${currency || ''}`.trim() : formatted
}

/** Currency badge for inline labeling */
const CurrencyTag = ({ code }) =>
  code ? <span className="ml-1 text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{code}</span> : null
const PAYPAL_SUBSCRIPTION_CURRENCIES = new Set([
  'AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF',
  'ILS', 'JPY', 'MYR', 'MXN', 'NOK', 'NZD', 'PHP', 'PLN', 'SEK', 'SGD',
  'THB', 'TWD', 'USD',
])
export const isPayPalCheckoutCurrencySupported = (currency) =>
  PAYPAL_SUBSCRIPTION_CURRENCIES.has(String(currency || '').toUpperCase())
export const getPayPalReturnState = (search) => {
  const params = new URLSearchParams(search)
  return {
    outcome: params.get('paypal'),
    subscriptionId: params.get('subscription_id'),
  }
}

export const SubscriptionConsent = () => {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { verificationResult, consentGranted, setConsentGranted, addToast } = useVerification()
  const requestedAuditId = searchParams.get('audit_id')?.trim() || null
  const contextAuditId = verificationResult?.audit_id || verificationResult?.verification_id
  const selectedAuditId = requestedAuditId || contextAuditId
  const [persistedReport, setPersistedReport] = useState(null)
  const [auditLoading, setAuditLoading] = useState(Boolean(selectedAuditId))
  const [auditError, setAuditError] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [approvalUrl, setApprovalUrl] = useState(null)
  const [checkoutError, setCheckoutError] = useState(null)
  const [providerReturn, setProviderReturn] = useState({ state: 'idle', outcome: null, subscription: null, error: null })
  useEffect(() => {
    let active = true
    setConsentGranted(false)
    setPersistedReport(null)
    setAuditError(null)
    if (!selectedAuditId) { setAuditLoading(false); return () => { active = false } }
    setAuditLoading(true)
    getAuditReport(selectedAuditId)
      .then((data) => { if (active) setPersistedReport(data.report) })
      .catch((error) => { if (active) setAuditError(error.message) })
      .finally(() => { if (active) setAuditLoading(false) })
    return () => { active = false }
  }, [selectedAuditId, setConsentGranted])

  const selectedResult = selectedAuditId ? (persistedReport?.audit_id === selectedAuditId ? persistedReport : null) : verificationResult
  const verdict = selectedResult?.verdict || selectedResult?.final_verdict
  const advertised = selectedResult?.advertised_terms || {}
  const plan = selectedResult?.paypal_plan_terms || {}
  const manualDemo = selectedResult?.source_type === 'MANUAL_DEMO' || advertised.source_type === 'MANUAL_DEMO'
  const genuineUploadedAudit = selectedResult?.source_type === 'DOCUMENT_UPLOAD' && Boolean(selectedResult?.document_id)
  const evidenceComplete = selectedResult?.evidence_complete === true
  const currency = selectedResult?.currency || plan.currency || advertised.currency
  const money = (v, amountCurrency = plan.currency || verificationResult?.currency || advertised.currency) =>
    formatCurrencyAmount(v, amountCurrency)
  const checkoutCurrencySupported = isPayPalCheckoutCurrencySupported(plan.currency)
  const allowed = verdict === 'VERIFIED'
    && genuineUploadedAudit
    && evidenceComplete
    && Boolean(selectedResult?.paypal_plan_id || plan.id)
    && checkoutCurrencySupported
    && !manualDemo

  useEffect(() => {
    const { outcome, subscriptionId } = getPayPalReturnState(location.search)
    if (outcome !== 'return' && outcome !== 'cancel' && !subscriptionId) return
    if (!subscriptionId) {
      setProviderReturn({
        state: outcome === 'cancel' ? 'cancelled' : 'error',
        outcome,
        subscription: null,
        error: outcome === 'cancel' ? null : 'PayPal returned without a subscription ID.',
      })
      return
    }

    let active = true
    setProviderReturn({ state: 'loading', outcome, subscription: null, error: null })
    getPayPalSubscription(subscriptionId)
      .then((result) => {
        if (active) setProviderReturn({ state: outcome === 'cancel' ? 'cancelled' : 'ready', outcome, subscription: result.provider_status || result.subscription, error: null })
      })
      .catch((error) => {
        if (active) setProviderReturn({ state: 'error', outcome, subscription: null, error: error.message })
      })
    return () => { active = false }
  }, [location.search])

  const checkout = async () => {
    if (!allowed || !consentGranted) return addToast('A current eligible uploaded-document VERIFIED result and explicit consent are required.', 'warning')
    setProcessing(true)
    setCheckoutError(null)
    try {
      const data = await createPayPalSubscription({ plan_id: selectedResult.paypal_plan_id || plan.id, verification_id: selectedResult.audit_id || selectedResult.verification_id, consent: true })
      setApprovalUrl(data.approval_url)
      if (data.approval_url) window.location.assign(data.approval_url)
      else {
        setCheckoutError('PayPal did not return an approval URL. The subscription remains pending and must not be treated as active.')
        addToast('PayPal did not return an approval URL.', 'warning')
      }
    } catch (error) {
      setCheckoutError(error.message)
      addToast(error.message, 'error')
    } finally { setProcessing(false) }
  }

  const providerMessage = () => {
    if (providerReturn.state === 'loading') return 'Checking the actual subscription status with PayPal…'
    if (providerReturn.state === 'error') return `Unable to confirm status with PayPal: ${providerReturn.error}`
    if (providerReturn.state === 'cancelled') {
      const currentStatus = providerReturn.subscription?.status
      return currentStatus
        ? `Checkout was cancelled. PayPal currently reports ${currentStatus}; no payment is inferred.`
        : 'Checkout was cancelled. No PayPal subscription status was returned.'
    }
    const status = providerReturn.subscription?.status
    if (status === 'APPROVAL_PENDING') return 'PayPal reports approval is still pending. The subscription is not active.'
    if (status === 'APPROVED') return 'PayPal reports approval recorded. Activation and payment are not confirmed.'
    if (status === 'ACTIVE') return 'PayPal reports ACTIVE. This status does not by itself confirm a completed payment.'
    if (status) return `PayPal reports ${status}.`
    return providerReturn.state === 'ready' ? 'PayPal status was refreshed.' : null
  }

  return <div className="space-y-6 max-w-3xl mx-auto"><div className="text-center space-y-2"><div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950 text-brand-primary border border-blue-200 dark:border-blue-800"><ShieldCheck className="w-3.5 h-3.5" />Customer Consent</div><h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-brand-navy dark:text-white">Subscription Consent & Truth-in-Billing</h1><p className="text-xs sm:text-sm text-brand-muted dark:text-dark-muted">Review the actual verified billing terms before authorizing PayPal.</p></div>
    <Card><div className="space-y-6">{auditLoading && <Notice text="Loading the selected persisted audit report…" />}{auditError && <Notice text={`Unable to load the selected audit report: ${auditError}. Checkout is blocked.`} />}{!auditLoading && !auditError && !selectedResult && <Notice text="No verification result is available. Select a saved audit from Integrity Reports. Checkout is blocked." />}{selectedResult && verdict !== 'VERIFIED' && <Notice text={`Checkout is blocked because the verification verdict is ${show(verdict)}.`} />}{selectedResult?.verdict_downgraded && <Notice text={selectedResult.evidence_message || 'Evidence is incomplete. Checkout is blocked.'} />}{selectedResult && verdict === 'VERIFIED' && (!genuineUploadedAudit || !evidenceComplete) && <Notice text="Checkout requires a genuine uploaded-document audit with complete persisted source evidence." />}
      {providerMessage() && <Notice text={providerMessage()} />}
      {checkoutError && <Notice text={checkoutError} />}
      {manualDemo && <Notice text="Manual Demo Input – Not AI Extracted. This test comparison cannot be used for PayPal checkout." />}
      <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-4"><div><span className="text-[10px] font-bold text-slate-400 uppercase">Verified subscription</span><h2 className="text-lg font-bold text-brand-navy dark:text-white">{show(advertised.product_name || plan.name)}</h2></div><div className="text-right"><span className="text-[10px] text-slate-400">Plan ID</span><div className="text-xs font-mono text-brand-primary">{show(selectedResult?.paypal_plan_id || plan.id)}</div></div></div>
      {selectedResult && verdict === 'VERIFIED' && !checkoutCurrencySupported && <Notice text={`PayPal checkout is unavailable for ${show(currency)} subscription plans. The verification result is unchanged.`} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-y border-slate-100 dark:border-slate-800 py-4">
        <section aria-label="Advertised billing terms">
          <h2 className="text-xs font-bold uppercase text-slate-500 mb-1">Advertised terms</h2>
          <p className="text-[10px] text-slate-400 mb-2 flex items-center gap-1">
            Currency: <CurrencyTag code={advertised.currency} />
            {!advertised.currency && <span className="text-amber-600 dark:text-amber-400">Unstated</span>}
          </p>
          <dl className="space-y-1.5 text-xs">
            <Term label="Introductory price" value={showMoney(advertised.introductory_price, advertised.currency, 'advertised')} />
            <Term label="Billing amount" value={showMoney(advertised.regular_price, advertised.currency, 'advertised')} />
            <Term label="Billing interval" value={advertised.billing_frequency ? `Every ${advertised.frequency_interval || 1} ${advertised.billing_frequency}` : 'Unstated in offer'} />
            <Term label="Trial" value={showTrialDays(advertised.trial_duration_days, 'advertised')} />
            <Term label="Setup fee" value={showMoney(advertised.setup_fee, advertised.currency, 'advertised')} />
          </dl>
        </section>
        <section aria-label="Actual PayPal billing terms">
          <h2 className="text-xs font-bold uppercase text-slate-500 mb-1">Actual PayPal terms</h2>
          <p className="text-[10px] text-slate-400 mb-2 flex items-center gap-1">
            Currency: <CurrencyTag code={plan.currency} />
            {!plan.currency && <span className="text-amber-600 dark:text-amber-400">Not configured</span>}
          </p>
          <dl className="space-y-1.5 text-xs">
            <Term label="Introductory price" value={showMoney(plan.introductory_price, plan.currency, 'paypal')} />
            <Term label="Billing amount" value={showMoney(plan.regular_price, plan.currency, 'paypal')} />
            <Term label="Billing interval" value={plan.billing_frequency ? `Every ${plan.frequency_interval || 1} ${plan.billing_frequency}` : 'Not configured'} />
            <Term label="Trial" value={showTrialDays(plan.trial_days, 'paypal')} />
            <Term label="Setup fee" value={showMoney(plan.setup_fee, plan.currency, 'paypal')} />
          </dl>
        </section>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[
        ['Introductory price (PayPal)', showMoney(plan.introductory_price, plan.currency, 'paypal')],
        ['Introductory cycles', show(plan.introductory_cycles)],
        ['Renewal price (PayPal)', showMoney(plan.regular_price, plan.currency, 'paypal')],
        ['Billing frequency', show(plan.billing_frequency)],
        ['Trial period (PayPal)', showTrialDays(plan.trial_days, 'paypal')],
        ['Setup fee (PayPal)', showMoney(plan.setup_fee, plan.currency, 'paypal')],
        ['Advertised currency', show(advertised.currency)],
        ['PayPal currency', show(plan.currency)],
        ['Verdict', show(verdict)],
      ].map(([label, val]) => <div key={label} className="p-3 rounded-xl bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800"><span className="text-[10px] font-semibold text-slate-500 block">{label}</span><span className="text-sm font-bold text-brand-navy dark:text-white mt-1 block">{val}</span></div>)}</div>
      <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl bg-slate-50 dark:bg-dark-surface/80 border border-slate-200 dark:border-slate-700"><input type="checkbox" checked={consentGranted} onChange={(e) => setConsentGranted(e.target.checked)} className="mt-1 w-4 h-4" /><span className="text-xs text-slate-700 dark:text-slate-200">I explicitly agree to the billing terms displayed above, including the introductory and renewal amounts.</span></label>
      {approvalUrl && <p className="text-xs text-slate-500">Approval URL returned by PayPal: {approvalUrl}</p>}<Button onClick={checkout} disabled={!allowed || auditLoading || Boolean(auditError) || !consentGranted} loading={processing} size="lg" className="w-full bg-[#003087] text-white"><span className="flex items-center justify-center gap-2"><Lock className="w-4 h-4" />Approve & Subscribe with PayPal</span></Button>
    </div></Card></div>
}

const Notice = ({ text }) => <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200 flex gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{text}</div>
const Term = ({ label, value }) => <div className="flex justify-between gap-2"><dt className="text-slate-500">{label}</dt><dd className="font-semibold text-right text-brand-navy dark:text-white">{value}</dd></div>
