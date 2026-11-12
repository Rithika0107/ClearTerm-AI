import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { App } from '../App'

describe('Offer Verification extraction UI', () => {
  afterEach(() => vi.restoreAllMocks())

  it('clears previous terms on a new upload and stops the spinner on terminal failure', async () => {
    window.history.pushState({}, '', '/app/verify')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const path = String(url)
      if (path.endsWith('/documents/upload')) {
        return { ok: true, status: 201, json: async () => ({ document: {
          id: 'DOC-NEW', original_filename: 'fresh.png', mime_type: 'image/png',
          file_size_bytes: 32, preview_url: null, sha256_hash: 'fresh-hash',
        } }) }
      }
      if (path.endsWith('/ai/extract-terms')) {
        return { ok: false, status: 502, json: async () => ({
          category: 'PROVIDER_ERROR', message: 'Gemini returned an unusable provider response.',
        }) }
      }
      return { ok: true, status: 200, json: async () => ({ status: 'healthy', services: { gemini: {} } }) }
    })

    render(<App />)
    fireEvent.click(await screen.findByText(/CloudSync_Promo_Flyer.png/i))
    expect(await screen.findByText('CloudSync Enterprise Tier')).toBeInTheDocument()

    const fileInput = document.querySelector('input[type="file"]')
    const freshFile = new File([new Uint8Array([137, 80, 78, 71])], 'fresh.png', { type: 'image/png' })
    fireEvent.change(fileInput, { target: { files: [freshFile] } })

    expect(await screen.findByText('Gemini returned an unusable provider response.')).toBeInTheDocument()
    const termsHeading = screen.getByText('Extracted Financial Terms')
    const termsCard = termsHeading.closest('.rounded-xl')
    expect(within(termsCard).queryByText('CloudSync Enterprise Tier')).not.toBeInTheDocument()
    expect(screen.queryByText('Running Multimodal Gemini Extraction...')).not.toBeInTheDocument()
  })
})
