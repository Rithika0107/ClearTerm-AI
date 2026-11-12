import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractTerms, retryExtraction } from '../services/api'

const response = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
})

describe('Gemini extraction job recovery', () => {
  afterEach(() => vi.restoreAllMocks())

  it('surfaces a terminal provider failure with its safe retry eligibility', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(504, {
      status: 'FAILED',
      category: 'PROVIDER_TIMEOUT',
      message: 'Gemini did not complete generation before the provider deadline.',
      job_id: 'JOB-TERMINAL',
      retry_allowed: true,
    }))

    await expect(extractTerms('DOC-1')).rejects.toMatchObject({
      category: 'PROVIDER_TIMEOUT',
      jobId: 'JOB-TERMINAL',
      retryAllowed: true,
    })
  })

  it('does not expose retry when the backend says the prior operation is uncertain', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(409, {
      category: 'RETRY_NOT_SAFE',
      message: 'The previous provider operation may still be running.',
      retry_allowed: false,
    }))

    await expect(retryExtraction('JOB-STALE')).rejects.toMatchObject({
      category: 'RETRY_NOT_SAFE',
      retryAllowed: false,
    })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/ai/extract-terms/JOB-STALE/retry')
  })
})
