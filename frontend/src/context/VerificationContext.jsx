import React, { createContext, useContext, useState } from 'react'

const VerificationContext = createContext()

export const VerificationProvider = ({ children }) => {
  // Uploaded document state
  const [uploadedDoc, setUploadedDoc] = useState(null)
  
  // AI extraction state
  const [extractionState, setExtractionState] = useState({
    loading: false,
    extracted: false,
    data: null,
    error: null,
    retryJobId: null,
    retryAllowed: false,
  })

  // Selected PayPal plan state
  const [paypalPlan, setPaypalPlan] = useState(null)

  // Verification audit result
  const [verificationResult, setVerificationResult] = useState(null)

  // Customer consent state
  const [consentGranted, setConsentGranted] = useState(false)

  // Global toasts
  const [toasts, setToasts] = useState([])

  const addToast = (message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const resetVerification = () => {
    setUploadedDoc(null)
    setExtractionState({ loading: false, extracted: false, data: null, error: null })
    setPaypalPlan(null)
    setVerificationResult(null)
    setConsentGranted(false)
  }

  return (
    <VerificationContext.Provider
      value={{
        uploadedDoc,
        setUploadedDoc,
        extractionState,
        setExtractionState,
        paypalPlan,
        setPaypalPlan,
        verificationResult,
        setVerificationResult,
        consentGranted,
        setConsentGranted,
        toasts,
        addToast,
        removeToast,
        resetVerification,
      }}
    >
      {children}
    </VerificationContext.Provider>
  )
}

export const useVerification = () => {
  const context = useContext(VerificationContext)
  if (!context) {
    throw new Error('useVerification must be used within a VerificationProvider')
  }
  return context
}
