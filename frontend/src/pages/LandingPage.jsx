import React from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Cpu,
  FileText,
  DollarSign,
  TrendingUp,
  Scale,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
import { Button } from '../components/common/Button'
import { Badge } from '../components/common/Badge'

export const LandingPage = () => {
  return (
    <div className="min-h-screen bg-brand-bg dark:bg-dark-bg text-brand-text dark:text-dark-text transition-colors">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-40 bg-white/90 dark:bg-dark-surface/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-navy flex items-center justify-center text-white shadow-sm">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-brand-navy dark:text-white flex items-center gap-1.5">
                CLEARTERM <span className="text-brand-primary">AI</span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Subscription Billing Integrity
              </span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-8 text-xs font-medium text-slate-600 dark:text-slate-300">
            <a href="#how-it-works" className="hover:text-brand-primary transition-colors">How It Works</a>
            <a href="#paypal-integration" className="hover:text-brand-primary transition-colors">PayPal Architecture</a>
            <a href="#features" className="hover:text-brand-primary transition-colors">Integrity Engine</a>
            <a href="#security" className="hover:text-brand-primary transition-colors">Security & Trust</a>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/app/overview">
              <Button variant="outline" size="sm">
                Live Dashboard
              </Button>
            </Link>
            <Link to="/app/verify">
              <Button variant="primary" size="sm" icon={ArrowRight}>
                Start Verification
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 lg:pt-24 lg:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-brand-light dark:bg-blue-950/60 text-brand-navy dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
              PayPal AI Hackathon 2026 Official Project
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-brand-navy dark:text-white leading-[1.12]">
              Every Payment Should Match Every Promise.
            </h1>

            <p className="text-base sm:text-lg text-brand-muted dark:text-dark-muted max-w-2xl mx-auto leading-relaxed">
              Verify subscription pricing, detect hidden billing discrepancies and build customer trust with AI-powered financial transparency between advertised offers and live PayPal billing configurations.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link to="/app/verify" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto px-8 shadow-fintech-md" icon={ArrowRight}>
                  Start Verification
                </Button>
              </Link>
              <Link to="/app/overview" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="w-full sm:w-auto px-8">
                  Explore Platform
                </Button>
              </Link>
            </div>

            <div className="pt-6 flex items-center justify-center gap-6 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-brand-success" /> Multimodal Gemini Extraction
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-brand-success" /> PayPal Sandbox REST API
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-brand-success" /> Deterministic Python Decimal Engine
              </span>
            </div>
          </div>

          {/* Hero Illustration: Advertised vs Actual Billing Comparison */}
          <div className="mt-16 max-w-5xl mx-auto">
            <div className="bg-white dark:bg-dark-card rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-fintech-lg overflow-hidden">
              <div className="bg-slate-50 dark:bg-dark-surface px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                    <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
                  </div>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Illustrative Demo Scenario: CloudSync Promo vs PayPal Plan
                  </span>
                </div>
                <Badge status="DEMONSTRATION" />
              </div>
              <div role="note" className="px-6 py-2 text-[11px] font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border-b border-amber-200 dark:border-amber-900">Illustrative example only. These values are not live Gemini or PayPal results.</div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 p-6 gap-6">
                {/* Left: Advertised Offer */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Example Promotional Document (illustrative values)
                    </span>
                    <span className="text-xs font-semibold text-brand-primary">Confidence: 98.4%</span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Advertised Plan</span>
                      <span className="font-semibold text-brand-text dark:text-white">CloudSync Enterprise Annual</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Introductory Tier</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">$9.99 / first 3 months</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Promised Renewal</span>
                      <span className="font-semibold text-brand-text dark:text-white">$14.99 / month</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Free Trial Period</span>
                      <span className="font-semibold text-brand-text dark:text-white">14 Days Free</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Promised Setup Fee</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">$0.00 (Waived)</span>
                    </div>
                  </div>
                </div>

                {/* Right: PayPal Configuration */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Example PayPal Configuration (not live data)
                    </span>
                    <span className="text-xs font-mono text-slate-500">ID: P-8Y2908182</span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-dark-surface/60 border border-slate-200/60 dark:border-slate-800 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Product Registered</span>
                      <span className="font-semibold text-brand-text dark:text-white">PROD-SYNC-ENT (Active)</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">PayPal Tier 1</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">$9.99 / 3 cycles</span>
                    </div>
                    <div className="flex justify-between items-center text-xs p-1.5 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900">
                      <span className="text-red-700 dark:text-red-400 font-medium">Actual PayPal Renewal</span>
                      <span className="font-bold text-red-600 dark:text-red-400">$24.99 / month (+$10.00 Hidden!)</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Trial Configuration</span>
                      <span className="font-semibold text-brand-text dark:text-white">14 Days (Cycle 0)</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Setup Fee Config</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">$0.00 USD</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-red-50/60 dark:bg-red-950/20 border-t border-red-100 dark:border-red-900/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span><strong>Discrepancy Impact:</strong> Customer would be overcharged by $120.00 in the first year after introductory tier expires.</span>
                </div>
                <Link to="/app/comparison">
                  <Button variant="danger" size="sm">
                    Inspect Comparison
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 bg-white dark:bg-dark-surface/50 border-y border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-primary">Workflow Architecture</span>
            <h2 className="text-3xl font-extrabold text-brand-navy dark:text-white mt-2">
              Three-Stage Deterministic Verification
            </h2>
            <p className="text-sm text-brand-muted dark:text-dark-muted mt-2">
              ClearTerm AI strictly separates multimodal AI claim extraction from deterministic financial verification.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-brand-bg dark:bg-dark-card border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-brand-light dark:bg-blue-950 text-brand-primary flex items-center justify-center font-bold text-base">
                1
              </div>
              <h3 className="text-base font-bold text-brand-navy dark:text-white">Multimodal Document Extraction</h3>
              <p className="text-xs text-brand-muted dark:text-dark-muted leading-relaxed">
                Upload marketing flyers, checkout screenshots or PDF agreements. Google Gemini parses promotional pricing, trial durations, renewal cadences, and cited evidence.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-brand-bg dark:bg-dark-card border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-brand-light dark:bg-blue-950 text-brand-primary flex items-center justify-center font-bold text-base">
                2
              </div>
              <h3 className="text-base font-bold text-brand-navy dark:text-white">PayPal Sandbox Synchronization</h3>
              <p className="text-xs text-brand-muted dark:text-dark-muted leading-relaxed">
                Backend connects directly to PayPal REST Subscriptions API via OAuth 2.0 to retrieve raw billing plans, cycle tiers, setup fees, and generates SHA-256 plan fingerprints.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-brand-bg dark:bg-dark-card border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-brand-light dark:bg-blue-950 text-brand-primary flex items-center justify-center font-bold text-base">
                3
              </div>
              <h3 className="text-base font-bold text-brand-navy dark:text-white">Deterministic Decimal Audit</h3>
              <p className="text-xs text-brand-muted dark:text-dark-muted leading-relaxed">
                A dedicated Python Decimal verification engine computes differences with zero floating-point drift. Currencies and frequencies must match exactly to earn VERIFIED status.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PayPal Integration & Security Section */}
      <section id="paypal-integration" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <Lock className="w-3.5 h-3.5" /> Direct PayPal REST API Integration
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-brand-navy dark:text-white tracking-tight">
                Built For Real-World Financial Integrity.
              </h2>
              <p className="text-sm text-brand-muted dark:text-dark-muted leading-relaxed">
                Unlike ordinary AI chatbots that summarize terms with loose assumptions, ClearTerm AI enforces strict financial checks:
              </p>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-success flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-brand-navy dark:text-white">Pre-Subscription Plan Fingerprinting</h4>
                    <p className="text-xs text-brand-muted dark:text-dark-muted mt-0.5">
                      Before initiating checkout, the backend re-fetches the PayPal plan to ensure merchants have not changed terms between audit and approval.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-success flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-brand-navy dark:text-white">Strict Customer Consent Gate</h4>
                    <p className="text-xs text-brand-muted dark:text-dark-muted mt-0.5">
                      Subscriptions cannot be provisioned until customers explicitly review and acknowledge transparent first-year cost breakdowns.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-success flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-brand-navy dark:text-white">Cryptographic Webhook Signature Verification</h4>
                    <p className="text-xs text-brand-muted dark:text-dark-muted mt-0.5">
                      PayPal webhook events are validated using official PayPal certificate chains with transmission ID deduplication to prevent replay tampering.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Link to="/app/consent">
                  <Button variant="navy" icon={ArrowRight}>
                    View Customer Consent Experience
                  </Button>
                </Link>
              </div>
            </div>

            {/* Architecture Card */}
            <div className="bg-white dark:bg-dark-card rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-fintech space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-brand-navy dark:text-white">Verification Engine Architecture</span>
                <span className="text-[10px] font-mono text-slate-400">REST v1/billing/subscriptions</span>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-dark-surface/80 border border-slate-200/60 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-slate-500">1. OAuth 2.0 Auth</span>
                  <span className="text-emerald-600 font-bold">Bearer Token (Cached)</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-dark-surface/80 border border-slate-200/60 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-slate-500">2. Document Parser</span>
                  <span className="text-blue-600 font-bold">Gemini 2.5 Flash</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-dark-surface/80 border border-slate-200/60 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-slate-500">3. Verification Rule</span>
                  <span className="text-brand-navy dark:text-white font-bold">Python Decimal / ISO 4217</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-dark-surface/80 border border-slate-200/60 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-slate-500">4. Fingerprint Hash</span>
                  <span className="text-slate-700 dark:text-slate-300 font-bold">SHA-256 Canonical</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-brand-light/60 dark:bg-blue-950/40 text-brand-navy dark:text-blue-300 text-[11px] leading-relaxed">
                ClearTerm AI guarantees that ambiguous terms never silently pass as verified. If a promotion omits regular renewal costs, the platform deterministically flags <code>REQUIRES REVIEW</code>.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white dark:bg-dark-surface border-t border-slate-200 dark:border-slate-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-primary" />
            <span className="font-semibold text-brand-navy dark:text-white">CLEARTERM AI</span>
            <span>— What You're Promised Is What You Pay.</span>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/app/overview" className="hover:text-brand-primary">Dashboard</Link>
            <Link to="/app/verify" className="hover:text-brand-primary">Verification</Link>
            <Link to="/app/settings" className="hover:text-brand-primary">Settings</Link>
            <a
              href="https://developer.paypal.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-brand-primary flex items-center gap-1"
            >
              <span>PayPal Sandbox</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
