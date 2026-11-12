/**
 * ClearTerm AI API Client Service
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export async function getHealth() {
  const res = await fetch(`${BASE_URL}/health`)
  if (!res.ok) throw new Error(`Health check failed with status ${res.status}`)
  return res.json()
}

export async function getDashboard() {
  const res = await fetch(`${BASE_URL}/dashboard`)
  if (!res.ok) throw new Error(`Dashboard request failed with status ${res.status}`)
  return res.json()
}

export async function getEvidence() {
  const res = await fetch(`${BASE_URL}/evidence`)
  if (!res.ok) throw new Error(`Evidence request failed with status ${res.status}`)
  return res.json()
}

// --- Document Management & AI Extraction ---

export async function uploadDocument(file) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${BASE_URL}/documents/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.message || `Upload failed with status ${res.status}`)
  }

  return res.json()
}

function extractionError(data, fallback, responseStatus) {
  const error = new Error(data.message || fallback)
  error.category = data.category || null
  error.jobId = data.job_id || null
  error.retryAllowed = data.retry_allowed === true
  error.responseStatus = responseStatus || null
  return error
}

async function pollExtractionJob(jobId, maxLifetimeSeconds = 900) {
  const startedAt = Date.now()
  const clientDeadline = Math.max(60_000, (maxLifetimeSeconds + 60) * 1000)
  while (Date.now() - startedAt < clientDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    let poll
    let result
    try {
      poll = await fetch(`${BASE_URL}/ai/extract-terms/${encodeURIComponent(jobId)}`)
      result = await poll.json().catch(() => ({}))
    } catch {
      continue
    }
    if (result.status === 'IN_PROGRESS' && (poll.status === 202 || poll.ok)) continue
    if (result.status === 'COMPLETED') {
      return { status: 'success', message: 'Subscription terms extracted successfully via Gemini.', terms: result.terms }
    }
    if (result.status === 'FAILED' || !poll.ok) {
      throw extractionError(result, `Extraction failed with status ${poll.status}`, poll.status)
    }
  }

  throw extractionError({ category: 'CLIENT_POLL_TIMEOUT' }, 'Extraction status could not be confirmed. Retry is unavailable until the backend confirms the previous provider operation is terminal.')
}

export async function extractTerms(documentId) {
  const res = await fetch(`${BASE_URL}/ai/extract-terms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_id: documentId }),
  })
  const initial = await res.json().catch(() => ({}))
  if (!res.ok) throw extractionError(initial, `Extraction failed with status ${res.status}`, res.status)
  if (initial.status === 'COMPLETED') return { status: 'success', terms: initial.terms }
  if (initial.status !== 'IN_PROGRESS' || !initial.job_id) return initial
  return pollExtractionJob(initial.job_id, initial.max_lifetime_seconds)
}

export async function retryExtraction(jobId) {
  const res = await fetch(`${BASE_URL}/ai/extract-terms/${encodeURIComponent(jobId)}/retry`, { method: 'POST' })
  const initial = await res.json().catch(() => ({}))
  if (!res.ok) throw extractionError(initial, `Extraction retry failed with status ${res.status}`, res.status)
  if (initial.status !== 'IN_PROGRESS' || !initial.job_id) return initial
  return pollExtractionJob(initial.job_id, initial.max_lifetime_seconds)
}

export async function getDocument(documentId) {
  const res = await fetch(`${BASE_URL}/documents/${documentId}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch document ${documentId}`)
  }
  return res.json()
}

// --- PayPal Sandbox Direct REST APIs ---

export async function getPayPalStatus() {
  const res = await fetch(`${BASE_URL}/paypal/status`)
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.message || 'Failed to check PayPal connection status')
  }
  return res.json()
}

export async function getPayPalProducts(page = 1, pageSize = 20) {
  const res = await fetch(`${BASE_URL}/paypal/products?page=${page}&page_size=${pageSize}`)
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.message || 'Failed to fetch PayPal products')
  }
  return res.json()
}

export async function getPayPalPlans(productId = null, page = 1, pageSize = 20) {
  let url = `${BASE_URL}/paypal/plans?page=${page}&page_size=${pageSize}`
  if (productId) {
    url += `&product_id=${encodeURIComponent(productId)}`
  }
  const res = await fetch(url)
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.message || 'Failed to fetch PayPal plans')
  }
  return res.json()
}

export async function getPayPalPlanDetails(planId) {
  const res = await fetch(`${BASE_URL}/paypal/plans/${encodeURIComponent(planId)}`)
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.message || `Failed to fetch plan ${planId}`)
  }
  return res.json()
}

// --- Deterministic Financial Verification API ---

export async function verifyIntegrity(documentId, planId) {
  const res = await fetch(`${BASE_URL}/integrity/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ document_id: documentId, plan_id: planId }),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.message || `Verification failed with status ${res.status}`)
  }

  return res.json()
}

export async function verifyManualTerms(payload) {
  const res = await fetch(`${BASE_URL}/integrity/verify-manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `Manual verification failed with status ${res.status}`)
  return data
}

export async function createPayPalSubscription(payload) {
  const res = await fetch(`${BASE_URL}/paypal/subscriptions/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `Subscription creation failed with status ${res.status}`)
  return data
}

export async function getPayPalSubscription(subscriptionId) {
  const res = await fetch(`${BASE_URL}/paypal/subscriptions/${encodeURIComponent(subscriptionId)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `Failed to retrieve PayPal subscription (${res.status})`)
  return data
}

export async function getSubscriptions({ refresh = false } = {}) {
  const res = await fetch(`${BASE_URL}/paypal/subscriptions${refresh ? '?refresh=true' : ''}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `Failed to fetch subscriptions (${res.status})`)
  return data
}
// --- Persisted audit reports ---

export async function getAudits(limit = 50) {
  const res = await fetch(`${BASE_URL}/integrity/audits?limit=${limit}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `Failed to load audits (${res.status})`)
  return data
}

export async function getAuditReport(auditId) {
  const res = await fetch(`${BASE_URL}/integrity/audits/${encodeURIComponent(auditId)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `Failed to load audit ${auditId}`)
  return data
}

// --- Persisted PayPal plan snapshots (no provider call) ---

export async function getPersistedPlanSnapshots() {
  const res = await fetch(`${BASE_URL}/paypal/plans-snapshots`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `Failed to load persisted plans (${res.status})`)
  return data
}

// --- Persisted, signature-verified webhook deliveries ---

export async function getWebhookEvents(limit = 50) {
  const res = await fetch(`${BASE_URL}/paypal/webhooks?limit=${limit}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `Failed to load webhook events (${res.status})`)
  return data
}
