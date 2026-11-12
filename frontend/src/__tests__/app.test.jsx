import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { App } from '../App'
import { formatCurrencyAmount } from '../services/formatters'
import { getPayPalReturnState, isPayPalCheckoutCurrencySupported } from '../pages/SubscriptionConsent'

describe('ClearTerm AI Frontend Application Shell', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('renders Landing Page with official tagline and branding', () => {
    render(<App />)
    expect(screen.getAllByText(/CLEARTERM/i)[0]).toBeInTheDocument()
    expect(screen.getByText(/Every Payment Should Match Every Promise/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Start Verification/i })[0]).toBeInTheDocument()
  })

  it('navigates to the Financial Overview Dashboard', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => ({
      ok: true,
      status: 200,
      json: async () => String(url).endsWith('/dashboard')
        ? { status: 'success', counts: { document_audits: 2, document_verified: 1, document_mismatches: 1, document_reviews: 0, manual_demo_audits: 3 }, trend: [], recent_audits: [] }
        : { status: 'healthy', services: { gemini: {} } },
    }))
    render(<App />)
    const exploreButtons = screen.getAllByRole('button', { name: /Explore Platform|Live Dashboard/i })
    fireEvent.click(exploreButtons[0])

    expect(await screen.findByText(/Financial Overview Dashboard/i)).toBeInTheDocument()
    expect(screen.getByText(/Uploaded Offers Audited/i)).toBeInTheDocument()
    expect(screen.getByText(/Verified Clean Offers/i)).toBeInTheDocument()
    fetchMock.mockRestore()
  })

  it('keeps sidebar destinations usable in its collapsed mobile layout', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(max-width: 767px)', media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }))
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true, status: 200,
      json: async () => ({ status: 'success', audits: [], services: { gemini: {} } }),
    }))
    window.history.pushState({}, '', '/app/overview')
    render(<App />)
    fireEvent.click(await screen.findByTitle('Integrity Reports'))
    expect(await screen.findByText(/Persisted Integrity Reports/i)).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Financial Overview'))
    expect(await screen.findByText(/Financial Overview Dashboard/i)).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('navigates to Offer Verification workspace and handles test selection', async () => {
    window.history.pushState({}, '', '/app/verify')
    render(<App />)

    expect(await screen.findByText(/AI Offer Verification Workspace/i)).toBeInTheDocument()
    expect(screen.getByText(/Document Ingestion/i)).toBeInTheDocument()

    // Click sample document
    const sampleBtn = screen.getByText(/CloudSync_Promo_Flyer.png/i)
    fireEvent.click(sampleBtn)

    // Extracted terms should appear
    expect(await screen.findByText(/CloudSync Enterprise Tier/i, {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('formats extraction currency from its ISO code and leaves renewal unknown when unstated', async () => {
    expect(formatCurrencyAmount('149.00', 'INR')).toBe('₹149.00')
    expect(formatCurrencyAmount('1234567.89', 'INR')).toBe('₹12,34,567.89')
    expect(formatCurrencyAmount('14.99', 'USD')).toBe('$14.99')
    expect(formatCurrencyAmount(Number.NaN, 'INR')).toBe('Unavailable')
    expect(formatCurrencyAmount('NaN', 'USD')).toBe('Unavailable')
    expect(formatCurrencyAmount('undefined', 'USD')).toBe('Unavailable')
    expect(formatCurrencyAmount('not-a-number', 'USD')).toBe('Unavailable')
    expect(formatCurrencyAmount('10', 'INVALID-CURRENCY')).toBe('Unavailable')
    expect(isPayPalCheckoutCurrencySupported('USD')).toBe(true)
    expect(isPayPalCheckoutCurrencySupported('INR')).toBe(false)
    expect(isPayPalCheckoutCurrencySupported(null)).toBe(false)
    expect(getPayPalReturnState('?paypal=return&subscription_id=I-SANDBOX')).toEqual({ outcome: 'return', subscriptionId: 'I-SANDBOX' })
    expect(getPayPalReturnState('?paypal=cancel')).toEqual({ outcome: 'cancel', subscriptionId: null })

    window.history.pushState({}, '', '/app/verify')
    render(<App />)
    fireEvent.click(screen.getByText(/StreamCast_Discount_Banner.jpg/i))

    expect(await screen.findByText(/Unknown, not stated/i)).toBeInTheDocument()
    expect(screen.queryByText(/^Enforced$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Manual$/i)).not.toBeInTheDocument()
  })

  it('toggles light and dark mode correctly', async () => {
    window.history.pushState({}, '', '/app/overview')
    render(<App />)

    const themeToggleBtn = screen.getByLabelText(/Toggle Theme/i)
    expect(themeToggleBtn).toBeInTheDocument()

    // Initial state check
    const root = document.documentElement
    const initialDark = root.classList.contains('dark')

    fireEvent.click(themeToggleBtn)
    expect(root.classList.contains('dark')).toBe(!initialDark)
  })

  it('blocks PayPal approval until verification and customer consent are present', async () => {
    window.history.pushState({}, '', '/app/consent')
    render(<App />)

    expect(await screen.findByText(/Subscription Consent & Truth-in-Billing/i)).toBeInTheDocument()

    const checkoutBtn = screen.getByRole('button', { name: /Approve & Subscribe with PayPal/i })
    expect(checkoutBtn).toBeDisabled()

    // Check consent checkbox
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    expect(checkoutBtn).toBeDisabled()
  })

  it('shows a PayPal checkout cancellation without implying activation or payment', async () => {
    window.history.pushState({}, '', '/app/consent?paypal=cancel')
    render(<App />)

    expect(await screen.findByText(/Checkout was cancelled/i)).toBeInTheDocument()
    expect(screen.queryByText(/payment completed|paid/i)).not.toBeInTheDocument()
  })

  it('submits manual demo terms without calling Gemini or adding AI evidence', async () => {
    window.history.pushState({}, '', '/app/verify')
    const manualResult = {
      status: 'success',
      source_type: 'MANUAL_DEMO',
      source_label: 'Manual Demo Input – Not AI Extracted',
      verdict: 'REQUIRES REVIEW',
      audit_id: 'AUD-MANUAL',
      paypal_plan_id: 'P-SANDBOX',
      advertised_terms: { product_name: 'Manual Demo Offer', currency: 'USD', regular_price: 'UNKNOWN', evidence_quotes: [] },
      paypal_plan_terms: { id: 'P-SANDBOX', currency: 'USD', regular_price: '19.99', billing_frequency: 'MONTH', frequency_interval: 1 },
      fields: [],
      uncertainty_flags: [],
      financial_impact: { status: 'REQUIRES REVIEW', difference_amount: null },
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => ({
      ok: true,
      status: 200,
      json: async () => String(url).endsWith('/integrity/verify-manual') ? manualResult : { status: 'success' },
    }))

    render(<App />)
    expect(await screen.findByText('Manual Demo Input – Not AI Extracted')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('PayPal Plan ID'), { target: { value: 'P-SANDBOX' } })
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } })
    fireEvent.change(screen.getByLabelText('Total billing amount'), { target: { value: '19.99' } })
    fireEvent.change(screen.getByLabelText('Billing interval'), { target: { value: 'MONTH' } })
    fireEvent.change(screen.getByLabelText('Interval count'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /Compare Manual Test Terms/i }))

    expect(await screen.findByText(/Manual Demo Input – Not AI Extracted/i)).toBeInTheDocument()
    const manualCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/integrity/verify-manual'))
    expect(manualCall).toBeDefined()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/ai/extract-terms'))).toBe(false)
    const requestBody = JSON.parse(manualCall[1].body)
    expect(requestBody.regular_price).toBe('19.99')
    expect(requestBody).not.toHaveProperty('confidence_score')
    expect(requestBody).not.toHaveProperty('evidence_quotes')
    fireEvent.click(screen.getByRole('button', { name: /View Decimal Comparison/i }))
    expect(await screen.findByText(/Manual Demo Input – Not AI Extracted\. This result is for testing only\./i)).toBeInTheDocument()

    fetchMock.mockRestore()
  })

  it('renders PayPal Sandbox Gateway diagnostics and Inspector in Settings', async () => {
    window.history.pushState({}, '', '/app/settings')
    render(<App />)

    expect(await screen.findByText(/Platform Configuration & Diagnostics/i)).toBeInTheDocument()
    expect(screen.getByText(/PayPal Sandbox REST Gateway/i)).toBeInTheDocument()
    expect(screen.getByText(/PayPal Sandbox Live Catalog & Plan Inspector/i)).toBeInTheDocument()
  })

  it('renders empty comparison state when no session loaded', async () => {
    window.history.pushState({}, '', '/app/comparison')
    render(<App />)

    expect(await screen.findByText(/No Verification Session Loaded/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Go to Offer Verification/i })).toBeInTheDocument()
  })

  it('searches and displays persisted quotation evidence with its source and verdict status', async () => {
    window.history.pushState({}, '', '/app/evidence')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const path = String(url)
      const payload = path.endsWith('/evidence') ? {
        status: 'success', source: 'sqlite', counts: { records: 1 }, records: [{
          id: 'AUD-EVIDENCE-UI', category: 'VERIFICATION_AUDIT', title: 'CloudSync Offer',
          source_label: 'Uploaded Document • Gemini Extraction', source_file: 'cloudsync.pdf',
          verdict: 'REQUIRES REVIEW', evidence_status: 'INCOMPLETE',
          evidence_message: 'No source quotation backs: regular price.',
          evidence_quotes: ['Standard renewal rate is $14.99 monthly.'],
          evidence_by_field: { regular_price: ['Standard renewal rate is $14.99 monthly.'] },
          field_results: [{ field_name: 'regular_price', label: 'Renewal Price', advertised_value: '14.99', actual_value: '24.99', comparison_status: 'MISMATCH', explanation: 'The PayPal price is higher.', evidence: ['Standard renewal rate is $14.99 monthly.'] }],
        }],
      } : { status: 'success', services: { gemini: {} } }
      return { ok: true, status: 200, json: async () => payload }
    })

    render(<App />)
    expect(await screen.findByText(/Uploaded Document • Gemini Extraction/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Standard renewal rate is \$14\.99 monthly\./i).length).toBeGreaterThan(0)
    expect(screen.getByText(/No source quotation backs: regular price/i)).toBeInTheDocument()
    const search = screen.getByPlaceholderText(/Search source quotations/i)
    fireEvent.change(search, { target: { value: 'Standard renewal rate' } })
    expect(screen.getByText(/CloudSync Offer/i)).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'does-not-exist' } })
    expect(screen.getByText(/No persisted evidence records match this view/i)).toBeInTheDocument()
    fetchMock.mockRestore()
  })

  it('falls back to persisted subscription statuses when live PayPal refresh fails', async () => {
    window.history.pushState({}, '', '/app/monitoring')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const path = String(url)
      if (path.endsWith('/subscriptions?refresh=true')) return { ok: false, status: 503, json: async () => ({ message: 'Sandbox is not configured' }) }
      if (path.endsWith('/subscriptions')) return { ok: true, status: 200, json: async () => ({ subscriptions: [{ id: 'I-STORED', paypal_plan_id: 'P-STORED', billing_amount: '19.99', currency: 'USD', status: 'ACTIVE', last_payment_status: 'FAILED', last_payment_event_at: '2026-11-12T00:00:00Z' }] }) }
      return { ok: true, status: 200, json: async () => ({ status: 'healthy', services: { gemini: {} } }) }
    })
    render(<App />)
    expect(await screen.findByText(/Live PayPal refresh unavailable/i)).toBeInTheDocument()
    expect(screen.getByText('I-STORED')).toBeInTheDocument()
    fireEvent.click(screen.getByText('I-STORED'))
    expect(screen.getByRole('alert')).toHaveTextContent(/failed payment/i)
    fetchMock.mockRestore()
  })

  it('opens persisted audit reports from the report index', async () => {
    window.history.pushState({}, '', '/app/reports')
    const savedReport = {
      audit_id: 'AUD-SAVED-UI', source_type: 'DOCUMENT_UPLOAD', source_label: 'Uploaded Document • Gemini Extraction',
      source_file: 'offer.pdf', verdict: 'REQUIRES REVIEW', evidence_status: 'INCOMPLETE',
      verification_timestamp: '2026-11-12T00:00:00Z', currency: 'USD',
      advertised_terms: { product_name: 'Saved Plan', currency: 'USD', regular_price: 'UNKNOWN' },
      paypal_plan_terms: { id: 'P-SAVED', name: 'Saved Plan', currency: 'USD' },
      fields: [], supporting_evidence: [], financial_impact: { difference_amount: null, status: 'REQUIRES REVIEW' },
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const path = String(url)
      const payload = path.includes('/integrity/audits?')
        ? { audits: [{ audit_id: 'AUD-SAVED-UI', product: 'Saved Plan', source_label: 'Uploaded Document • Gemini Extraction', verdict: 'REQUIRES REVIEW', created_at: '2026-11-12T00:00:00Z' }] }
        : path.endsWith('/integrity/audits/AUD-SAVED-UI') ? { report: savedReport }
          : { status: 'healthy', services: { gemini: {} } }
      return { ok: true, status: 200, json: async () => payload }
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Saved Plan.*REQUIRES REVIEW/i }))
    expect(await screen.findByText(/Verification AUD-SAVED-UI/i)).toBeInTheDocument()
    fetchMock.mockRestore()
  })

  it('passes a selected saved audit into consent and keeps a mismatch blocked', async () => {
    window.history.pushState({}, '', '/app/reports')
    const mismatchReport = {
      audit_id: 'AUD-MISMATCH-CONSENT', document_id: 'DOC-UPLOADED', source_type: 'DOCUMENT_UPLOAD',
      source_label: 'Uploaded Document â€¢ Gemini Extraction', verdict: 'MISMATCH DETECTED',
      evidence_complete: true, paypal_plan_id: 'P-MISMATCH', currency: 'USD',
      advertised_terms: { product_name: 'Promotional Plan', currency: 'USD', regular_price: '9.99', billing_frequency: 'MONTH' },
      paypal_plan_terms: { id: 'P-MISMATCH', name: 'Sandbox Plan', currency: 'USD', regular_price: '19.99', billing_frequency: 'MONTH' },
      fields: [], supporting_evidence: ['Promo flyer: $9.99 per month.'], financial_impact: {},
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const path = String(url)
      const payload = path.includes('/integrity/audits?')
        ? { audits: [{ audit_id: mismatchReport.audit_id, product: 'Promotional Plan', source_label: mismatchReport.source_label, verdict: mismatchReport.verdict, created_at: '2026-11-12T00:00:00Z' }] }
        : path.endsWith(`/integrity/audits/${mismatchReport.audit_id}`) ? { report: mismatchReport }
          : { status: 'healthy', services: { gemini: {} } }
      return { ok: true, status: 200, json: async () => payload }
    })

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Promotional Plan.*MISMATCH DETECTED/i }))
    fireEvent.click(await screen.findByRole('link', { name: /Review persisted billing terms & consent/i }))

    expect(await screen.findByText('MISMATCH DETECTED')).toBeInTheDocument()
    expect(screen.getByText('$9.99')).toBeInTheDocument()
    expect(screen.getAllByText('$19.99').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: /Approve & Subscribe with PayPal/i })).toBeDisabled()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/paypal/subscriptions/create'))).toBe(false)
    fetchMock.mockRestore()
  })

  it('loads persisted manual demo terms but never makes them checkout eligible', async () => {
    window.history.pushState({}, '', '/app/consent?audit_id=AUD-MANUAL-SAVED')
    const report = {
      audit_id: 'AUD-MANUAL-SAVED', source_type: 'MANUAL_DEMO', verdict: 'VERIFIED',
      evidence_complete: false, paypal_plan_id: 'P-DEMO', currency: 'USD',
      advertised_terms: { product_name: 'Demo offer', currency: 'USD', regular_price: '10.00' },
      paypal_plan_terms: { id: 'P-DEMO', name: 'Sandbox demo plan', currency: 'USD', regular_price: '10.00' },
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => ({
      ok: true, status: 200,
      json: async () => String(url).endsWith('/integrity/audits/AUD-MANUAL-SAVED') ? { report } : { status: 'healthy', services: { gemini: {} } },
    }))

    render(<App />)
    expect(await screen.findByText('Demo offer')).toBeInTheDocument()
    expect(screen.getByText(/Manual Demo Input.*cannot be used for PayPal checkout/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: /Approve & Subscribe with PayPal/i })).toBeDisabled()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/paypal/subscriptions/create'))).toBe(false)
    fetchMock.mockRestore()
  })

  it('hydrates AUD-5A85D72C from the direct consent URL and blocks its mismatch verdict', async () => {
    window.history.pushState({}, '', '/app/consent?audit_id=AUD-5A85D72C')
    const report = {
      audit_id: 'AUD-5A85D72C', document_id: 'c9cd7ffb-eabd-4495-b600-a61c2538227e',
      source_type: 'DOCUMENT_UPLOAD', verdict: 'MISMATCH DETECTED', evidence_complete: true,
      paypal_plan_id: 'P-90485136PR3630011NL2C2LA', currency: 'INR',
      advertised_terms: { product_name: 'Super', currency: 'INR', regular_price: '349', billing_frequency: 'MONTH', frequency_interval: 3 },
      paypal_plan_terms: { id: 'P-90485136PR3630011NL2C2LA', name: 'ClearTerm Monthly Test', currency: 'USD', regular_price: '19.99', billing_frequency: 'MONTH', frequency_interval: 1 },
      fields: [], supporting_evidence: ['To pay: ₹349'], financial_impact: {},
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => ({
      ok: true, status: 200,
      json: async () => String(url).endsWith('/integrity/audits/AUD-5A85D72C') ? { report } : { status: 'healthy', services: { gemini: {} } },
    }))

    render(<App />)
    expect(await screen.findByText('MISMATCH DETECTED')).toBeInTheDocument()
    expect(screen.getByText('Super')).toBeInTheDocument()
    expect(screen.getAllByText(/₹349/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('$19.99').length).toBeGreaterThan(0)
    // INR and USD must be labelled separately, not merged into one "Currency" card
    expect(screen.getAllByText('INR').length).toBeGreaterThan(0)
    expect(screen.getAllByText('USD').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Approve & Subscribe with PayPal/i })).toBeDisabled()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/paypal/subscriptions/create'))).toBe(false)
    fetchMock.mockRestore()
  })

  it('displays zero trial days distinctly from an unstated trial period', async () => {
    window.history.pushState({}, '', '/app/consent?audit_id=AUD-ZERO-TRIAL')
    // Plan with trial_days=0 (confirmed no trial) and advertised with null trial (unstated)
    const report = {
      audit_id: 'AUD-ZERO-TRIAL', document_id: 'DOC-ZERO-TRIAL', source_type: 'DOCUMENT_UPLOAD',
      verdict: 'VERIFIED', evidence_complete: true, paypal_plan_id: 'P-ZERO-TRIAL',
      advertised_terms: {
        product_name: 'Zero Trial Offer', currency: 'USD', regular_price: '14.99',
        billing_frequency: 'MONTH', trial_duration_days: null, setup_fee: null,
      },
      paypal_plan_terms: {
        id: 'P-ZERO-TRIAL', currency: 'USD', regular_price: '14.99',
        billing_frequency: 'MONTH', trial_days: 0, setup_fee: '0.00',
      },
      fields: [], supporting_evidence: [], financial_impact: {},
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => ({
      ok: true, status: 200,
      json: async () => String(url).endsWith('/integrity/audits/AUD-ZERO-TRIAL') ? { report } : { status: 'healthy', services: { gemini: {} } },
    }))

    render(<App />)
    expect(await screen.findByText('Zero Trial Offer')).toBeInTheDocument()
    // PayPal confirmed zero trial should say "0 days (No free trial)"
    expect(screen.getAllByText(/0 days \(No free trial\)/i).length).toBeGreaterThan(0)
    // Advertised null trial should say "Unstated in offer" not "0"
    expect(screen.getAllByText('Unstated in offer').length).toBeGreaterThan(0)
    // PayPal $0.00 setup fee should indicate "No fee"
    expect(screen.getAllByText(/No fee/i).length).toBeGreaterThan(0)
    fetchMock.mockRestore()
  })
})
