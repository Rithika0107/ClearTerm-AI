import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Cpu,
  RefreshCw,
  Eye,
  FileCheck2,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { PlanSelector } from '../components/verification/PlanSelector'
import { useVerification } from '../context/VerificationContext'
import { uploadDocument, extractTerms, retryExtraction, verifyManualTerms } from '../services/api'
import { formatCurrencyAmount } from '../services/formatters'

export const OfferVerification = () => {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const {
    uploadedDoc,
    setUploadedDoc,
    extractionState,
    setExtractionState,
    paypalPlan,
    setPaypalPlan,
    setVerificationResult,
    setConsentGranted,
    addToast,
  } = useVerification()

  const [dragActive, setDragActive] = useState(false)
  const [selectedSample, setSelectedSample] = useState(null)
  const [manualForm, setManualForm] = useState({
    plan_id: '',
    product_name: '',
    currency: '',
    regular_price: '',
    billing_frequency: '',
    frequency_interval: '',
    introductory_price: '',
    introductory_cycles: '',
    trial_duration_days: '',
    setup_fee: '',
  })
  const [manualState, setManualState] = useState({ loading: false, error: null, result: null })

  // Pre-configured realistic sample promotional documents for quick testing
  const SAMPLE_DOCS = [
    {
      id: 'sample-1',
      name: 'CloudSync_Promo_Flyer.png',
      type: 'image/png',
      size: '1.2 MB',
      preview: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
      extractedData: {
        product_name: 'CloudSync Enterprise Tier',
        introductory_price: '9.99',
        introductory_cycles: 3,
        regular_price: '14.99',
        billing_frequency: 'MONTH',
        frequency_interval: 1,
        trial_duration_days: 14,
        setup_fee: '0.00',
        currency: 'USD',
        auto_renewal: null,
        confidence_score: 0.98,
        evidence_quotes: [
          'Flyer headline: "Start today for just $9.99/mo for your first 3 months."',
          'Small print: "Standard rate of $14.99 billed monthly thereafter. Cancel anytime."',
          'Badge: "14-Day Free Evaluation Period Included. No Setup Fees."',
        ],
        uncertainty_flags: [],
        ai_explanation: 'Gemini detected high-clarity promotional flyer with unambiguous 3-month introductory discount, explicit $14.99 renewal, and 14-day free trial.',
      },
      paypalPlanMatch: {
        id: 'P-8Y2908182',
        product_id: 'PROD-CLOUDSYNC',
        name: 'CloudSync Enterprise Plan',
        currency: 'USD',
        introductory_price: '9.99',
        introductory_cycles: 3,
        regular_price: '24.99', // Discrepancy intentional: Advertised 14.99 vs PayPal 24.99
        billing_frequency: 'MONTH',
        frequency_interval: 1,
        trial_days: 14,
        setup_fee: '0.00',
        status: 'ACTIVE',
      }
    },
    {
      id: 'sample-2',
      name: 'DevMetrics_Annual_Contract.pdf',
      type: 'application/pdf',
      size: '480 KB',
      preview: null,
      extractedData: {
        product_name: 'DevMetrics Pro Annual',
        introductory_price: null,
        introductory_cycles: null,
        regular_price: '199.00',
        billing_frequency: 'YEAR',
        frequency_interval: 1,
        trial_duration_days: 0,
        setup_fee: '0.00',
        currency: 'USD',
        auto_renewal: true,
        confidence_score: 0.99,
        evidence_quotes: [
          'Agreement Section 2: "Annual subscription fee of $199.00 USD invoiced annually."',
          'Section 3.1: "Zero setup fee. Auto-renews each year unless terminated with 30 days notice."',
        ],
        uncertainty_flags: [],
        ai_explanation: 'Legal PDF contract with fully verified fixed annual pricing terms and zero setup fee.',
      },
      paypalPlanMatch: {
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
      }
    },
    {
      id: 'sample-3',
      name: 'StreamCast_Discount_Banner.jpg',
      type: 'image/jpeg',
      size: '890 KB',
      preview: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80',
      extractedData: {
        product_name: 'StreamCast Creator Suite',
        introductory_price: '19.00',
        introductory_cycles: null,
        regular_price: '49.00',
        billing_frequency: 'UNKNOWN',
        frequency_interval: null,
        trial_duration_days: null,
        setup_fee: null,
        currency: 'USD',
        auto_renewal: null,
        confidence_score: 0.72,
        evidence_quotes: [
          'Banner text: "Only $19 to get started!"',
          'Footer disclaimer: "Regular price $49."',
        ],
        uncertainty_flags: [
          'Billing cadence (monthly vs annual) omitted in advertised text.',
          'Trial duration not specified.',
          'Applicable setup fees unstated.',
        ],
        ai_explanation: 'Extracted terms contain ambiguities: promotional banner states $19 intro and $49 regular without defining billing period intervals or setup conditions.',
      },
      paypalPlanMatch: {
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
      }
    }
  ]

  const handleSelectSample = (sample) => {
    setSelectedSample(sample.id)
    setUploadedDoc({
      name: sample.name,
      type: sample.type,
      size: sample.size,
      preview: sample.preview,
      hash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    })

    // Demonstration terms are explicitly local UI data; they are never treated as a live audit.
    setExtractionState({
      loading: true,
      extracted: false,
      data: null,
      error: null,
    })

    setTimeout(() => {
      setExtractionState({
        loading: false,
        extracted: true,
        data: sample.extractedData,
        error: null,
      })
      if (sample.paypalPlanMatch) {
        setPaypalPlan(sample.paypalPlanMatch)
      }
      addToast('Demonstration terms loaded. Upload a document for live Gemini extraction and PayPal verification.', 'info')
    }, 600)
  }

  const handleFileUpload = async (file) => {
    if (!file) return

    setSelectedSample(null)
    setUploadedDoc({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: `${(file.size / 1024).toFixed(1)} KB`,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      hash: 'Validating magic bytes & computing SHA-256...',
    })

    setExtractionState({
      loading: true,
      extracted: false,
      data: null,
      error: null,
    })

    try {
      addToast(`Uploading & inspecting ${file.name}...`, 'info')
      const uploadRes = await uploadDocument(file)
      const doc = uploadRes.document

      setUploadedDoc({
        id: doc.id,
        name: doc.original_filename,
        type: doc.mime_type,
        size: `${(doc.file_size_bytes / 1024).toFixed(1)} KB`,
        preview: doc.preview_url,
        hash: doc.sha256_hash,
      })

      addToast('Binary validated. Invoking Gemini 2.5 Flash...', 'info')
      const extractRes = await extractTerms(doc.id)
      const terms = extractRes.terms

      setExtractionState({
        loading: false,
        extracted: true,
        data: terms,
        error: null,
      })

      // A PayPal plan must be retrieved from the backend before comparison or checkout.
      setPaypalPlan(null)

      addToast('Gemini structured extraction completed successfully', 'success')
    } catch (err) {
      setExtractionState({
        loading: false,
        extracted: false,
        data: null,
        error: err.message,
        retryJobId: err.jobId || null,
        retryAllowed: err.retryAllowed === true,
      })
      addToast(`Extraction failure: ${err.message}`, 'error')
    }
  }

  const handleRetryExtraction = async () => {
    if (!extractionState.retryAllowed || !extractionState.retryJobId) return
    setExtractionState({ ...extractionState, loading: true, data: null, error: null, retryAllowed: false })
    try {
      const result = await retryExtraction(extractionState.retryJobId)
      setExtractionState({ loading: false, extracted: true, data: result.terms, error: null, retryJobId: null, retryAllowed: false })
      addToast('Gemini structured extraction completed successfully', 'success')
    } catch (err) {
      setExtractionState({
        loading: false,
        extracted: false,
        data: null,
        error: err.message,
        retryJobId: err.jobId || null,
        retryAllowed: err.retryAllowed === true,
      })
      addToast(`Extraction failure: ${err.message}`, 'error')
    }
  }

  const handleProceedToComparison = () => {
    if (!extractionState.extracted) {
      addToast('Please upload or select a promotional document first', 'warning')
      return
    }
    navigate('/app/comparison')
  }

  const handleManualVerify = async (event) => {
    event.preventDefault()
    setManualState({ loading: true, error: null, result: null })
    try {
      const result = await verifyManualTerms(manualForm)
      setManualState({ loading: false, error: null, result })
      setSelectedSample(null)
      setUploadedDoc(null)
      setExtractionState({ loading: false, extracted: false, data: null, error: null })
      setVerificationResult(result)
      setPaypalPlan(result.paypal_plan_terms)
      setConsentGranted(false)
      addToast('Manual demo comparison completed. It is not a Gemini extraction and cannot be checked out.', 'info')
    } catch (error) {
      setManualState({ loading: false, error: error.message, result: null })
    }
  }

  const updateManualField = (field) => (event) => {
    setManualForm((previous) => ({ ...previous, [field]: event.target.value }))
  }

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0])
          }
        }}
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        className="hidden"
      />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-brand-navy dark:text-white">
              AI Offer Verification Workspace
            </h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-brand-primary border border-blue-200 dark:border-blue-800">
              Stage 1 of 3
            </span>
          </div>
          <p className="text-xs text-brand-muted dark:text-dark-muted mt-1">
            Upload marketing materials, screenshots or contract PDFs to extract advertised financial terms with Google Gemini.
          </p>
        </div>

        {/* Stage separation indicator pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-dark-card border border-slate-200 dark:border-slate-800 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-brand-primary">
            <Sparkles className="w-3.5 h-3.5" />
            1. Gemini Extraction
          </span>
          <span className="text-slate-400">→</span>
          <span className="text-slate-400 font-medium">
            2. PayPal Retrieval
          </span>
          <span className="text-slate-400">→</span>
          <span className="text-slate-400 font-medium">
            3. Decimal Audit
          </span>
        </div>
      </div>

      <Card
        title="Manual Demo Input – Not AI Extracted"
        subtitle="TEST ONLY. Enter terms explicitly to exercise the Decimal verifier against an actual Sandbox plan. This does not run Gemini or enable checkout."
        action={<Badge status="TEST ONLY" />}
      >
        <form onSubmit={handleManualVerify} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <ManualInput label="PayPal Plan ID" value={manualForm.plan_id} onChange={updateManualField('plan_id')} required />
            <ManualInput label="Offer label (optional)" value={manualForm.product_name} onChange={updateManualField('product_name')} />
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Currency</span>
              <select value={manualForm.currency} onChange={updateManualField('currency')} required className="w-full px-3 py-2 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-card">
                <option value="">Select currency</option>
                <option value="USD">USD</option>
                <option value="INR">INR</option>
              </select>
            </label>
            <ManualInput label="Total billing amount" value={manualForm.regular_price} onChange={updateManualField('regular_price')} placeholder="Amount or UNKNOWN" required />
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Billing interval</span>
              <select value={manualForm.billing_frequency} onChange={updateManualField('billing_frequency')} required className="w-full px-3 py-2 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-card">
                <option value="">Select interval</option>
                {['DAY', 'WEEK', 'MONTH', 'YEAR', 'UNKNOWN'].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <ManualInput label="Interval count" value={manualForm.frequency_interval} onChange={updateManualField('frequency_interval')} placeholder="e.g. 1 or 3" inputMode="numeric" />
            <ManualInput label="Introductory amount (optional)" value={manualForm.introductory_price} onChange={updateManualField('introductory_price')} />
            <ManualInput label="Introductory cycles (optional)" value={manualForm.introductory_cycles} onChange={updateManualField('introductory_cycles')} inputMode="numeric" />
            <ManualInput label="Trial days (optional)" value={manualForm.trial_duration_days} onChange={updateManualField('trial_duration_days')} inputMode="numeric" />
            <ManualInput label="Setup fee (optional)" value={manualForm.setup_fee} onChange={updateManualField('setup_fee')} placeholder="Leave blank if unknown" />
          </div>
          <p className="text-[11px] text-slate-500">Manual values carry no extraction confidence or document quotations. Missing values remain unknown and may require review.</p>
          {manualState.error && <p role="alert" className="text-xs text-red-600">{manualState.error}</p>}
          {manualState.result && <div role="status" className="flex flex-wrap items-center gap-2 text-xs"><Badge status={manualState.result.verdict} /><span className="font-semibold">{manualState.result.source_label}</span><span className="text-slate-500">Actual PayPal plan: {manualState.result.paypal_plan_terms?.id} · {manualState.result.paypal_plan_terms?.currency} {manualState.result.paypal_plan_terms?.regular_price} / {manualState.result.paypal_plan_terms?.frequency_interval} {manualState.result.paypal_plan_terms?.billing_frequency}</span><Button variant="outline" size="sm" icon={ArrowRight} onClick={() => navigate('/app/comparison')}>View Decimal Comparison</Button></div>}
          <Button type="submit" size="sm" loading={manualState.loading} disabled={manualState.loading} icon={ShieldCheck}>Compare Manual Test Terms</Button>
        </form>
      </Card>

      {/* Quick Sample Selector */}
      <div className="p-4 rounded-xl bg-white dark:bg-dark-card border border-slate-200 dark:border-slate-800 shadow-fintech space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-brand-primary" />
            Demonstration Terms (not a live audit):
          </span>
          <span className="text-[11px] text-slate-400">These examples never call Gemini or PayPal and cannot enable checkout.</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SAMPLE_DOCS.map((sample) => (
            <button
              key={sample.id}
              onClick={() => handleSelectSample(sample)}
              className={`p-3 rounded-lg border text-left transition-all ${
                selectedSample === sample.id
                  ? 'border-brand-primary bg-blue-50/70 dark:bg-blue-950/40 shadow-xs'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/50 dark:bg-dark-surface/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-brand-navy dark:text-white truncate">
                  {sample.name}
                </span>
                <span className="text-[10px] uppercase font-semibold text-slate-400">{sample.type.split('/')[1]}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 truncate">
                {sample.extractedData.product_name}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Upload & Preview (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          <Card
            title="Document Ingestion"
            subtitle="Drag & drop promotional images or PDF documents"
          >
            {/* Upload Box */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-brand-primary bg-blue-50 dark:bg-blue-950/40'
                  : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50/50 dark:bg-dark-surface/40'
              }`}
            >
              <UploadCloud className="w-10 h-10 text-brand-primary mx-auto mb-3" />
              <p className="text-xs font-semibold text-brand-navy dark:text-white">
                Drag and drop your file here, or{' '}
                <span className="text-brand-primary hover:underline">browse</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Supports PDF, PNG, JPEG, WEBP (Max 10 MB)
              </p>
            </div>

            {/* Document Preview & Metadata */}
            {uploadedDoc ? (
              <div className="mt-4 p-3.5 rounded-xl bg-slate-50 dark:bg-dark-surface/80 border border-slate-200/80 dark:border-slate-700 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-950 text-brand-primary flex items-center justify-center flex-shrink-0">
                    {uploadedDoc.type.includes('pdf') ? (
                      <FileText className="w-5 h-5" />
                    ) : (
                      <ImageIcon className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 truncate">
                    <p className="text-xs font-bold text-brand-navy dark:text-white truncate">
                      {uploadedDoc.name}
                    </p>
                    <p className="text-[10px] text-slate-400">{uploadedDoc.size} • {uploadedDoc.type}</p>
                  </div>
                  <Badge variant="success" status="READY" />
                </div>

                {uploadedDoc.preview && (
                  <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 h-36 bg-slate-100 dark:bg-dark-surface">
                    <img
                      src={uploadedDoc.preview}
                      alt="Document Preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9px] font-mono">
                      Preview Snapshot
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 font-mono text-[10px] text-slate-500 space-y-1">
                  <div className="flex justify-between">
                    <span>Integrity Hash:</span>
                    <span className="truncate ml-2 max-w-[150px]" title={uploadedDoc.hash}>{uploadedDoc.hash}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Validation:</span>
                    <span className="text-emerald-600 font-semibold">MIME & Magic Bytes Verified</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                No document currently loaded. Choose a test sample above or click the box to browse.
              </div>
            )}
          </Card>
        </div>

        {/* CENTRE COLUMN: Extracted Terms (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card
            title="Extracted Financial Terms"
            subtitle="Live uploads use Gemini only when backend configuration is available"
            action={
              extractionState.loading ? (
                <span className="flex items-center gap-1.5 text-xs text-brand-primary animate-pulse font-medium">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {selectedSample ? 'Loading demo...' : 'Extracting...'}
                </span>
              ) : extractionState.extracted ? (
                <Badge variant="primary" status={selectedSample ? 'DEMONSTRATION' : 'AI Extracted'} />
              ) : null
            }
          >
            {extractionState.loading ? (
              <div className="py-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-brand-primary animate-spin mx-auto" />
                <p className="text-xs font-semibold text-brand-navy dark:text-white">
                  {selectedSample ? 'Loading illustrative sample terms...' : 'Running Multimodal Gemini Extraction...'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {selectedSample ? 'No Gemini or PayPal request is made for this sample.' : 'Parsing pricing tiers, renewal cadences, and trial conditions into strict JSON schema'}
                </p>
              </div>
            ) : extractionState.error ? (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 space-y-1">
                <p className="font-bold">Extraction Error</p>
                <p>{extractionState.error}</p>
                {extractionState.retryAllowed && extractionState.retryJobId && (
                  <Button variant="secondary" size="sm" onClick={handleRetryExtraction} className="mt-2">
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry extraction
                  </Button>
                )}
              </div>
            ) : extractionState.data ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Identified Product Name
                  </span>
                  <p className="text-sm font-bold text-brand-navy dark:text-white mt-0.5">
                    {extractionState.data.product_name}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Introductory Price
                    </span>
                    <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {extractionState.data.introductory_price
                        ? formatCurrencyAmount(extractionState.data.introductory_price, extractionState.data.currency)
                        : 'None'}
                    </p>
                    <span className="text-[10px] text-slate-500">
                      {extractionState.data.introductory_cycles
                        ? `for ${extractionState.data.introductory_cycles} cycles`
                        : 'No promo tier'}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Total Billing Amount
                    </span>
                    <p className="text-base font-bold text-brand-navy dark:text-white mt-0.5">
                      {formatCurrencyAmount(extractionState.data.regular_price, extractionState.data.currency)}
                    </p>
                    <span className="text-[10px] text-slate-500">
                      {extractionState.data.billing_frequency && extractionState.data.billing_frequency !== 'UNKNOWN'
                        ? `Total every ${extractionState.data.frequency_interval || 1} ${extractionState.data.billing_frequency.toLowerCase()}${(extractionState.data.frequency_interval || 1) === 1 ? '' : 's'}`
                        : 'Billing interval unknown'}
                    </span>
                    {extractionState.data.monthly_equivalent && (
                      <span className="block text-[10px] text-slate-500">
                        {formatCurrencyAmount(extractionState.data.monthly_equivalent, extractionState.data.currency)} per month
                      </span>
                    )}
                  </div>
                </div>

                {extractionState.data.billing_options?.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Available Billing Options</span>
                    {extractionState.data.billing_options.map((option, index) => (
                      <div key={index} className="p-3 rounded-lg bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-xs font-semibold text-brand-navy dark:text-white">
                            {option.plan_label ? `${option.plan_label}: ` : ''}
                            {option.frequency_interval || '?'} {option.billing_frequency?.toLowerCase() || 'period'}{option.selected === true ? ' (selected)' : ''}
                          </span>
                          <span className="text-xs font-bold text-brand-navy dark:text-white">
                            {formatCurrencyAmount(option.total_price, extractionState.data.currency)} total
                          </span>
                        </div>
                        {option.monthly_equivalent && (
                          <p className="text-[10px] text-slate-500 mt-1">
                            {formatCurrencyAmount(option.monthly_equivalent, extractionState.data.currency)} per month equivalent
                          </p>
                        )}
                        {option.evidence_quotes?.map((quote, quoteIndex) => (
                          <p key={quoteIndex} className="text-[10px] text-slate-500 italic mt-1">"{quote}"</p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800 text-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      Trial Duration
                    </span>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                      {extractionState.data.trial_duration_days !== null && extractionState.data.trial_duration_days !== undefined
                        ? `${extractionState.data.trial_duration_days} Days`
                        : 'Unstated'}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800 text-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      Setup Fee
                    </span>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                      {extractionState.data.setup_fee !== null && extractionState.data.setup_fee !== undefined
                        ? formatCurrencyAmount(extractionState.data.setup_fee, extractionState.data.currency)
                        : 'Unstated'}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800 text-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      Currency
                    </span>
                    <p className="text-xs font-bold text-brand-primary mt-0.5">
                      {extractionState.data.currency}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                    Automatic Renewal Condition
                  </span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {extractionState.data.auto_renewal === true
                      ? 'Yes, automatic renewal stated'
                      : extractionState.data.auto_renewal === false
                        ? 'No, non-renewal stated'
                        : 'Unknown, not stated'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                Awaiting document processing.
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT COLUMN: Evidence & Verification Summary (3 Cols) */}
        <div className="lg:col-span-3 space-y-4">
          <Card
            title="Verification Summary"
            subtitle="AI Confidence & Citations"
          >
            {extractionState.data ? (
              <div className="space-y-4">
                {/* Confidence indicator */}
                <div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-300">Extraction Confidence</span>
                    <span className="font-bold text-brand-primary">
                      {Math.round(extractionState.data.confidence_score * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-brand-primary rounded-full transition-all duration-500"
                      style={{ width: `${extractionState.data.confidence_score * 100}%` }}
                    />
                  </div>
                </div>

                {/* Uncertainty flags if any */}
                {extractionState.data.uncertainty_flags && extractionState.data.uncertainty_flags.length > 0 ? (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Missing / Ambiguous Terms</span>
                    </div>
                    <ul className="text-[11px] text-amber-900/80 dark:text-amber-300 list-disc list-inside space-y-1">
                      {extractionState.data.uncertainty_flags.map((flag, i) => (
                        <li key={i}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>No extraction ambiguities detected.</span>
                  </div>
                )}

                {/* Evidence References */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Supporting Document Citations
                  </span>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {extractionState.data.evidence_by_field && Object.entries(extractionState.data.evidence_by_field).flatMap(([field, quotes]) =>
                      (quotes || []).map((quote, idx) => (
                        <div key={`${field}-${idx}`} className="p-2 rounded bg-slate-50 dark:bg-dark-surface/70 border border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                          <span className="block text-[9px] font-bold uppercase text-slate-400">{field.replaceAll('_', ' ')}</span>
                          <span className="italic">"{quote}"</span>
                        </div>
                      ))) }
                    {(!extractionState.data.evidence_by_field || !Object.values(extractionState.data.evidence_by_field).some((quotes) => quotes?.length)) && extractionState.data.evidence_quotes && extractionState.data.evidence_quotes.map((quote, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded bg-slate-50 dark:bg-dark-surface/70 border border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 italic"
                      >
                        "{quote}"
                      </div>
                    ))}
                  </div>
                </div>

                {/* Primary CTA Button */}
                <div className="pt-2">
                  <Button
                    onClick={handleProceedToComparison}
                    size="md"
                    className="w-full shadow-fintech"
                    icon={ArrowRight}
                  >
                    Verify Against PayPal
                  </Button>
                  <p className="text-[10px] text-center text-slate-400 mt-2">
                    Proceeds to deterministic PayPal Sandbox comparison
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                Extraction summary will appear once a document is parsed.
              </div>
            )}
          </Card>

          {extractionState.data && (
            <Card
              title="Target PayPal Plan"
              subtitle="Sandbox Plan Selection"
            >
              <PlanSelector
                selectedPlan={paypalPlan}
                onSelect={(plan) => setPaypalPlan(plan)}
                onNotify={(msg, type) => addToast(msg, type)}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

const ManualInput = ({ label, value, onChange, required = false, placeholder = '', inputMode = 'decimal' }) => (
  <label className="space-y-1 text-xs">
    <span className="font-semibold text-slate-600 dark:text-slate-300">{label}</span>
    <input value={value} onChange={onChange} required={required} placeholder={placeholder} inputMode={inputMode} className="w-full px-3 py-2 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-card" />
  </label>
)
