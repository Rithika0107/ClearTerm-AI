# ClearTerm AI — AI-Powered Subscription Consent & Billing Integrity Platform

> **Tagline:** *"Every Payment Should Match Every Promise — What You're Promised Is What You Pay."*  
> **Target Event:** PayPal AI Hackathon 2026

[![Frontend Tests](https://img.shields.io/badge/Frontend%20Tests-20%20passed-emerald)](frontend/src/__tests__)
[![Backend Tests](https://img.shields.io/badge/Backend%20Tests-117%20passed-emerald)](backend/tests)
[![PayPal REST](https://img.shields.io/badge/PayPal-Sandbox%20REST%20v1-blue)](https://developer.paypal.com)
[![Gemini](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-4285F4)](https://ai.google.dev)
[![Python](https://img.shields.io/badge/Python-3.14-3776AB)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61DAFB)](https://react.dev)

---

## Executive Summary

**ClearTerm AI** is an enterprise-grade financial transparency and compliance intelligence platform. It bridges the gap between marketing promotional offers and recurring payment engine execution.

By leveraging Google Gemini multimodal extraction alongside direct PayPal Sandbox REST Subscriptions APIs, ClearTerm AI executes an exact, deterministic mathematical audit of subscription promises versus actual billing plans. It eliminates hidden recurring price escalations, undocumented setup fees, and unstated renewal cadences **before** the subscriber commits.

---

## Architectural Principles & Strict Safeguards

```
+--------------------------------------------------------------------------------------------------+
|                                    CLEARTERM AI ARCHITECTURE                                     |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|   STAGE 1: MULTIMODAL EXTRACTION             STAGE 2: CANONICAL PLAN SYNC                        |
|   +--------------------------------+         +--------------------------------+                  |
|   | Promotional Media / PDF / PNG  |         | PayPal Sandbox REST Gateway    |                  |
|   |         |                      |         |         |                      |                  |
|   |         v                      |         |         v                      |                  |
|   | Gemini 2.5 Flash Structured    |         | Live Catalog & Plan Snapshot   |                  |
|   | - Exact verbatim quotations    |         | - SHA-256 Plan Fingerprint     |                  |
|   | - Field-level citation index   |         | - Cycle rates, frequencies     |                  |
|   | - Uncertainty & ambiguity flags|         | - Setup fees & trial periods   |                  |
|   +--------------------------------+         +--------------------------------+                  |
|                   \                                     /                                        |
|                    \                                   /                                         |
|                     v                                 v                                          |
|            +-----------------------------------------------------+                               |
|            |    STAGE 3: DETERMINISTIC DECIMAL VERIFICATION      |                               |
|            |    - Zero floating-point arithmetic drift (Decimal) |                               |
|            |    - ISO 4217 Currency reconciliation               |                               |
|            |    - Cadence & Interval exact match validation      |                               |
|            |    - First-year cumulative financial delta impact   |                               |
|            +-----------------------------------------------------+                               |
|                                       |                                                          |
|                                       v                                                          |
|            +-----------------------------------------------------+                               |
|            | AUDIT TRAIL, TRUTH-IN-BILLING & ENFORCED CONSENT    |                               |
|            | - Immutable SQLite audit persistence                |                               |
|            | - Formal Printable / PDF Integrity Audit Report     |                               |
|            | - Mandatory Truth-in-Billing Customer Consent Gate  |                               |
|            | - PayPal OAuth 2.0 Subscription Creation            |                               |
|            | - RSA Webhook Signature Verification Engine         |                               |
|            +-----------------------------------------------------+                               |
+--------------------------------------------------------------------------------------------------+
```

1. **Strict AI Boundary Separation:**  
   Multimodal AI (Gemini) is confined strictly to *document understanding, term extraction, and evidence citation*. The verification verdict and financial difference calculations are 100% computed by an air-gapped Python `Decimal` verification engine.
2. **Zero Floating-Point Drift:**  
   All currency values are parsed into `Decimal` representations. ClearTerm never uses floating-point types for billing audits.
3. **Evidence Citations Required:**  
   Every extracted claim (regular price, cadence, trial days, setup fee) requires verbatim textual quotation backing directly from the source document.
4. **Subscription Consent Gate:**  
   Subscribers are protected from accidental subscriptions. PayPal checkout approval is blocked unless the offer has a clean `VERIFIED` audit verdict and the subscriber has explicitly accepted truth-in-billing disclosure.
5. **Webhook Signature Verification:**  
   Inbound webhook deliveries require PayPal cryptographic header verification (transmission ID, cert URL, auth algorithm, and CRC32 signature validation).

---

## 9 Integrated Application Screens

| Screen | Route | Description |
|---|---|---|
| **1. Landing Page** | `/` | Conversion homepage with animated truth-in-billing comparison illustration, workflow architecture, and feature breakdown. |
| **2. Financial Overview** | `/app/overview` | Platform-wide KPIs: Total uploaded audits, verified clean offers, pricing mismatches, review alerts, trend charts, and persisted activity table. |
| **3. AI Offer Verification** | `/app/verify` | Drag-and-drop document upload (PDF, PNG, JPG), sample offers, multimodal Gemini extraction progress, cited quotes, and plan selection. |
| **4. Billing Comparison** | `/app/comparison` | Deterministic side-by-side reconciliation matrix matching advertised claims against live PayPal Sandbox plans with discrepancy indicators. |
| **5. Integrity Reports** | `/app/reports` | Comprehensive compliance investigation document with first-year financial impact, finding details, plan fingerprint, and print/PDF export. |
| **6. Subscription Consent** | `/app/consent` | Truth-in-billing disclosure summary, itemized first-year schedule, explicit consent checkbox, and direct PayPal Sandbox approval redirect. |
| **7. Subscription Monitor** | `/app/monitoring` | Active subscription tracking with live PayPal Sandbox status refresh, failed payment tracking, and detail drawer. |
| **8. Evidence Explorer** | `/app/evidence` | Global compliance search engine querying persisted quotations, verdicts, plan snapshots, and signature-verified webhook events. |
| **9. Platform Settings** | `/app/settings` | Diagnostic hub verifying PayPal REST connectivity, Gemini credentials, SQLite persistence, and webhook delivery status without exposing secrets. |

---

## Complete Demo Workflow

### Pathway A: Live Document Extraction & Verification
1. Open `http://localhost:3000/app/verify`.
2. Click **Upload Document** and choose a promotional flyer, receipt, or subscription agreement (`.pdf`, `.png`, `.jpg`).
3. ClearTerm AI validates magic bytes and invokes `gemini-2.5-flash` with structured Pydantic schema validation.
4. Review the extracted pricing, trial cadence, renewal rate, and supporting document citations.
5. In the **Target PayPal Plan** panel, choose a persisted Sandbox plan snapshot or retrieve a plan by ID.
6. Click **Verify Against PayPal** to advance to **Billing Comparison** (`/app/comparison`).
7. Review side-by-side reconciliation and click **Run Deterministic Verification**.
8. View the **AI Integrity Report** (`/app/reports`) with formal audit stamps and print/save as PDF.
9. If verified, proceed to **Subscription Consent** (`/app/consent`) to review disclosures and launch PayPal checkout.

### Pathway B: Realistic Sample Demonstration
1. Navigate to `http://localhost:3000/app/verify`.
2. Choose one of the pre-configured sample documents:
   - **`CloudSync_Promo_Flyer.png`**: Advertised introductory discount ($9.99/mo for 3 months) followed by $14.99/mo renewal vs. PayPal plan charging $24.99/mo (`PRICING MISMATCH`).
   - **`DevMetrics_Annual_Contract.pdf`**: Annual enterprise agreement at $199.00/yr vs. PayPal plan matching exactly (`VERIFIED`).
   - **`StreamCast_Discount_Banner.jpg`**: Ambiguous promotional banner missing billing interval and setup fee terms (`REQUIRES REVIEW`).
3. Navigate to `/app/comparison` to inspect side-by-side field diffs, calculate first-year delta impact, and view the audit trail.

### Pathway C: Manual Sandbox Testing
1. Navigate to `/app/verify` and expand the **Manual Demo Terms Input** section.
2. Enter custom test parameters (Plan ID, Currency, Regular Price, Frequency).
3. Click **Compare Manual Test Terms**.
4. The system deterministically reconciles your inputs with clear disclaimers that this is a simulated demo without AI extraction.

---

## Technology Stack

### Frontend
- **React 18** + **Vite 8**
- **Tailwind CSS** (Custom Fintech palette with deep dark mode support)
- **React Router DOM 6**
- **Lucide React** (Fintech icon suite)
- **Vitest** + **@testing-library/react**

### Backend
- **Python 3.14** + **Flask 3.1**
- **Flask-SQLAlchemy** (SQLite local persistence)
- **Google GenAI SDK** (`google-genai` v3.0.0, Gemini 2.5 Flash)
- **PyMuPDF (`pymupdf`)** (High-precision PDF rasterization and text extraction)
- **Pydantic v2** (Strict schema validation with verbatim quotation enforcement)
- **Pytest** (Automated test suite with fixtures and sandbox mocks)

---

## Installation & Setup

### Prerequisites
- Python 3.10+ (Tested on Python 3.14)
- Node.js 18+ (npm 9+)

### 1. Backend Setup
```bash
# Navigate to backend
cd backend

# Create & activate a virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run backend development server
python run.py
# Server listens on http://localhost:5000
```

### 2. Frontend Setup
```bash
# In a new terminal, navigate to frontend
cd frontend

# Install npm dependencies
npm install

# Start Vite development server
npm run dev
# Frontend runs on http://localhost:3000 (proxies /api to http://localhost:5000)
```

### 3. Production Build
```bash
cd frontend
npm run build
# Production assets compiled into frontend/dist
```

---

## Running Test Suites

### Backend Tests (Pytest)
```bash
# From workspace root or backend/
.venv\Scripts\python -m pytest backend\tests
# Output: 117 passed, 1 skipped (comprehensive coverage across PayPal, AI, verification, audits)
```

### Frontend Tests (Vitest)
```bash
# From frontend/
cd frontend
npm test -- --run
# Output: 3 test files passed, 20 tests passed
```

---

## Design System & Color Palette

ClearTerm AI uses an intentional, accessible fintech design system tailored for high trust:

| Token | Light Mode | Dark Mode | Usage |
|---|---|---|---|
| **Brand Navy** | `#003087` | `#FFFFFF` | Primary headers, logos, official stamps |
| **Brand Primary** | `#0070E0` | `#38BDF8` | Buttons, interactive links, active pills |
| **Background** | `#F5F8FC` | `#101827` | Application page background |
| **Card Surface** | `#FFFFFF` | `#1D2B42` | Elevated cards, tables, modals |
| **Verified (Clean)** | `#159B72` | `#34D399` | Exact matches, confirmed audits |
| **Review (Notice)** | `#F5A623` | `#FBBF24` | Ambiguous terms, unstated cadences |
| **Mismatch (Danger)** | `#D93036` | `#F87171` | Pricing discrepancies, unauthorized fees |

---

## Security & Privacy Disclosures

- **No Secret Exposure:** API keys and PayPal client secrets are never exposed to the client or returned in API responses.
- **Local Persistence:** All audits, plan fingerprints, and webhook events are stored in local SQLite (`instance/clear_term.db`).
- **Cryptographic Plan Fingerprints:** Every PayPal plan retrieved has a deterministic SHA-256 fingerprint generated from canonical JSON, guaranteeing tampering detection.
- **Truth-in-Billing Safeguard:** No customer can be forwarded to PayPal checkout without verified status and explicit consent record.
