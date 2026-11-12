import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { VerificationProvider } from './context/VerificationContext'
import { AppLayout } from './components/layout/AppLayout'

// Page Components
import { LandingPage } from './pages/LandingPage'
import { DashboardOverview } from './pages/DashboardOverview'
import { OfferVerification } from './pages/OfferVerification'
import { BillingComparison } from './pages/BillingComparison'
import { IntegrityReport } from './pages/IntegrityReport'
import { SubscriptionConsent } from './pages/SubscriptionConsent'
import { SubscriptionMonitoring } from './pages/SubscriptionMonitoring'
import { EvidenceExplorer } from './pages/EvidenceExplorer'
import { SettingsPage } from './pages/SettingsPage'

export const App = () => {
  return (
    <ThemeProvider>
      <VerificationProvider>
        <BrowserRouter>
          <Routes>
            {/* Screen 1: Landing Page */}
            <Route path="/" element={<LandingPage />} />

            {/* Dashboard Shell with Screens 2-9 */}
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<Navigate to="/app/overview" replace />} />
              {/* Screen 2: Financial Overview Dashboard */}
              <Route path="overview" element={<DashboardOverview />} />
              {/* Screen 3: AI Offer Verification */}
              <Route path="verify" element={<OfferVerification />} />
              {/* Screen 4: PayPal Billing Comparison */}
              <Route path="comparison" element={<BillingComparison />} />
              {/* Screen 5: AI Integrity Report */}
              <Route path="reports" element={<IntegrityReport />} />
              {/* Screen 6: Subscription Consent */}
              <Route path="consent" element={<SubscriptionConsent />} />
              {/* Screen 7: Subscription Monitoring */}
              <Route path="monitoring" element={<SubscriptionMonitoring />} />
              {/* Screen 8: Evidence Explorer */}
              <Route path="evidence" element={<EvidenceExplorer />} />
              {/* Screen 9: Settings */}
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            {/* Catch-all fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </VerificationProvider>
    </ThemeProvider>
  )
}

export default App
