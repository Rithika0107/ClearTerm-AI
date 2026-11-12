import os
import time
import json
import hashlib
import requests
from requests.auth import HTTPBasicAuth
from typing import Dict, Any, Optional, List, Tuple
from decimal import Decimal

class PayPalError(Exception):
    """Base class for PayPal service exceptions."""
    pass

class PayPalConfigurationError(PayPalError):
    """Raised when PayPal credentials are not configured in environment variables."""
    pass

class PayPalAuthError(PayPalError):
    """Raised when authentication against PayPal OAuth 2.0 fails."""
    pass

class PayPalAPIError(PayPalError):
    """Raised when a PayPal REST API request returns an error response."""
    def __init__(self, message: str, status_code: int = 500, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details or {}

class PayPalTimeoutError(PayPalError):
    """Raised when a PayPal API request times out."""
    pass


class PayPalClient:
    """
    Dedicated client for PayPal Sandbox REST API interactions.
    Handles direct OAuth 2.0 client credential exchange, automatic token caching,
    catalog product retrieval, plan inspection, and canonical SHA-256 fingerprinting.
    """

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: int = 12
    ):
        self.client_id = (os.getenv('PAYPAL_CLIENT_ID', '') if client_id is None else client_id).strip()
        self.client_secret = (os.getenv('PAYPAL_CLIENT_SECRET', '') if client_secret is None else client_secret).strip()
        configured_base_url = os.getenv('PAYPAL_BASE_URL', 'https://api-m.sandbox.paypal.com') if base_url is None else base_url
        self.base_url = configured_base_url.rstrip('/')
        self.timeout = timeout

        # In-memory cached token and expiry timestamp
        self._cached_token: Optional[str] = None
        self._token_expires_at: float = 0.0

    @property
    def is_configured(self) -> bool:
        """Checks if Client ID and Secret are provided."""
        return bool(self.client_id and self.client_secret)

    def get_access_token(self, force_refresh: bool = False) -> str:
        """
        Obtains or returns a cached OAuth 2.0 Bearer access token.
        Automatically refreshes token if within 60 seconds of expiration.
        """
        if not self.is_configured:
            raise PayPalConfigurationError("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are not configured.")

        # Return cached token if still valid
        current_time = time.time()
        if not force_refresh and self._cached_token and current_time < (self._token_expires_at - 60):
            return self._cached_token

        token_url = f"{self.base_url}/v1/oauth2/token"
        try:
            response = requests.post(
                token_url,
                auth=HTTPBasicAuth(self.client_id, self.client_secret),
                headers={'Accept': 'application/json', 'Accept-Language': 'en_US'},
                data={'grant_type': 'client_credentials'},
                timeout=self.timeout
            )
        except requests.exceptions.Timeout as e:
            raise PayPalTimeoutError(f"Connection timeout contacting PayPal OAuth at {token_url}") from e
        except requests.exceptions.RequestException as e:
            raise PayPalAPIError(f"Network error during PayPal authentication: {str(e)}") from e

        if response.status_code != 200:
            error_data = {}
            try:
                error_data = response.json()
            except Exception:
                pass
            err_desc = error_data.get('error_description') or error_data.get('message') or response.text
            raise PayPalAuthError(f"PayPal OAuth 2.0 authentication failed (HTTP {response.status_code}): {err_desc}")

        try:
            token_data = response.json()
            access_token = token_data['access_token']
            expires_in = int(token_data.get('expires_in', 32400)) # default ~9h
            self._cached_token = access_token
            self._token_expires_at = current_time + expires_in
            return access_token
        except (KeyError, ValueError) as e:
            raise PayPalAuthError("Malformed response payload received from PayPal OAuth 2.0.") from e

    def _authenticated_request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """Performs an authenticated request with Bearer token and automatic retry on 401."""
        token = self.get_access_token()
        headers = kwargs.pop('headers', {})
        headers.update({
            'Authorization': f"Bearer {token}",
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        })

        url = f"{self.base_url}{endpoint}"
        kwargs.setdefault('timeout', self.timeout)

        try:
            response = requests.request(method, url, headers=headers, **kwargs)
        except requests.exceptions.Timeout as e:
            raise PayPalTimeoutError(f"Request timeout contacting PayPal endpoint: {endpoint}") from e
        except requests.exceptions.RequestException as e:
            raise PayPalAPIError(f"Network error contacting PayPal endpoint {endpoint}: {str(e)}") from e

        # Handle token expiration retry once
        if response.status_code == 401:
            token = self.get_access_token(force_refresh=True)
            headers['Authorization'] = f"Bearer {token}"
            try:
                response = requests.request(method, url, headers=headers, **kwargs)
            except requests.exceptions.RequestException as e:
                raise PayPalAPIError(f"Network error on token retry contacting {endpoint}: {str(e)}") from e

        return response

    def verify_connection(self) -> Dict[str, Any]:
        """
        Verifies real connectivity to PayPal Sandbox by requesting an access token.
        Never exposes raw token or secrets to the caller.
        """
        if not self.is_configured:
            return {
                'configured': False,
                'connected': False,
                'status': 'NOT_CONFIGURED',
                'message': 'PayPal Sandbox credentials (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET) are missing from backend environment variables.',
                'base_url': self.base_url,
                'client_id_mask': None,
            }

        masked_id = f"{self.client_id[:4]}...{self.client_id[-4:]}" if len(self.client_id) > 8 else "***"

        try:
            self.get_access_token()
            return {
                'configured': True,
                'connected': True,
                'status': 'CONNECTED',
                'message': 'Successfully connected to PayPal Sandbox via direct OAuth 2.0.',
                'base_url': self.base_url,
                'client_id_mask': masked_id,
            }
        except PayPalAuthError as e:
            return {
                'configured': True,
                'connected': False,
                'status': 'AUTH_FAILED',
                'message': f"Authentication failed: {str(e)}",
                'base_url': self.base_url,
                'client_id_mask': masked_id,
            }
        except PayPalTimeoutError as e:
            return {
                'configured': True,
                'connected': False,
                'status': 'TIMEOUT',
                'message': f"Connection timed out: {str(e)}",
                'base_url': self.base_url,
                'client_id_mask': masked_id,
            }
        except Exception as e:
            return {
                'configured': True,
                'connected': False,
                'status': 'ERROR',
                'message': f"Unexpected connection error: {str(e)}",
                'base_url': self.base_url,
                'client_id_mask': masked_id,
            }

    def get_products(self, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        """
        Retrieves real products from the PayPal Catalog Products API.
        Handles pagination and distinguishes empty catalog from API failures.
        """
        endpoint = f"/v1/catalogs/products?page={page}&page_size={page_size}&total_required=true"
        response = self._authenticated_request('GET', endpoint)

        if response.status_code != 200:
            error_details = response.json() if response.content else {}
            raise PayPalAPIError(
                f"Failed to retrieve PayPal products (HTTP {response.status_code}): {error_details.get('message', response.text)}",
                status_code=response.status_code,
                details=error_details
            )

        data = response.json()
        raw_products = data.get('products', [])
        total_items = data.get('total_items', len(raw_products))
        total_pages = data.get('total_pages', 1)

        products = []
        for p in raw_products:
            products.append({
                'id': p.get('id'),
                'name': p.get('name'),
                'description': p.get('description'),
                'type': p.get('type'),
                'category': p.get('category'),
                'image_url': p.get('image_url'),
                'create_time': p.get('create_time'),
            })

        return {
            'products': products,
            'total_items': total_items,
            'total_pages': total_pages,
            'page': page,
            'page_size': page_size,
        }

    def get_plans(self, product_id: Optional[str] = None, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        """
        Retrieves subscription plans from the PayPal Subscriptions API.
        Optionally filters by product_id.
        """
        endpoint = f"/v1/billing/plans?page={page}&page_size={page_size}&total_required=true"
        if product_id:
            endpoint += f"&product_id={product_id}"

        response = self._authenticated_request('GET', endpoint)

        if response.status_code != 200:
            error_details = response.json() if response.content else {}
            raise PayPalAPIError(
                f"Failed to retrieve PayPal billing plans (HTTP {response.status_code}): {error_details.get('message', response.text)}",
                status_code=response.status_code,
                details=error_details
            )

        data = response.json()
        raw_plans = data.get('plans', [])
        total_items = data.get('total_items', len(raw_plans))
        total_pages = data.get('total_pages', 1)

        plans = []
        for p in raw_plans:
            # The list endpoint may omit billing-cycle details. Reuse the
            # same field mapper so omitted fields remain None rather than
            # being replaced with fabricated financial defaults.
            normalized = self._format_plan_details(p)
            normalized['create_time'] = p.get('create_time')
            plans.append(normalized)

        return {
            'plans': plans,
            'total_items': total_items,
            'total_pages': total_pages,
            'page': page,
            'page_size': page_size,
        }

    def get_plan_details(self, plan_id: str) -> Dict[str, Any]:
        """
        Retrieves actual plan configurations using the PayPal Subscriptions API.
        Extracts billing cycles, pricing, frequency, and setup fee without fabrication.
        """
        if not plan_id:
            raise ValueError("plan_id is required.")

        endpoint = f"/v1/billing/plans/{plan_id}"
        response = self._authenticated_request('GET', endpoint)

        if response.status_code != 200:
            error_details = response.json() if response.content else {}
            raise PayPalAPIError(
                f"Failed to retrieve plan {plan_id} (HTTP {response.status_code}): {error_details.get('message', response.text)}",
                status_code=response.status_code,
                details=error_details
            )

        raw_plan = response.json()
        return self._format_plan_details(raw_plan)

    def _format_plan_details(self, raw_plan: Dict[str, Any]) -> Dict[str, Any]:
        """Formats and extracts real fields returned by PayPal without fabricating missing values."""
        plan_id = raw_plan.get('id')
        product_id = raw_plan.get('product_id')
        name = raw_plan.get('name')
        status = raw_plan.get('status')
        description = raw_plan.get('description')

        raw_cycles_value = raw_plan.get('billing_cycles')
        raw_cycles = raw_cycles_value if isinstance(raw_cycles_value, list) else []
        formatted_cycles = []

        currency = None
        regular_price = None
        introductory_price = None
        introductory_cycles = None
        trial_cycles = []
        trial_days = None
        billing_frequency = None
        frequency_interval = None

        for cycle in sorted(raw_cycles, key=lambda c: c.get('sequence', 0)):
            seq = cycle.get('sequence')
            tenure = cycle.get('tenure_type')
            total_cycles = cycle.get('total_cycles')

            freq = cycle.get('frequency') if isinstance(cycle.get('frequency'), dict) else {}
            interval_unit = freq.get('interval_unit')
            interval_count = freq.get('interval_count')

            pricing = cycle.get('pricing_scheme') if isinstance(cycle.get('pricing_scheme'), dict) else {}
            fixed_price = pricing.get('fixed_price') if isinstance(pricing.get('fixed_price'), dict) else {}
            price_val = fixed_price.get('value')
            curr = fixed_price.get('currency_code')

            if curr and not currency:
                currency = curr

            formatted_cycle = {
                'sequence': seq,
                'tenure_type': tenure,
                'total_cycles': total_cycles,
                'interval_unit': interval_unit if interval_unit is not None else 'UNKNOWN',
                'interval_count': interval_count if interval_count is not None else 'UNKNOWN',
                'price_value': price_val,
                'currency': curr,
            }
            formatted_cycles.append(formatted_cycle)

            # Analyze cycle roles
            if tenure == 'TRIAL':
                trial_cycles.append(formatted_cycle)
            elif tenure == 'REGULAR':
                if regular_price is None and total_cycles == 0:
                    regular_price = price_val
                    billing_frequency = interval_unit
                    frequency_interval = interval_count
                elif isinstance(total_cycles, int) and total_cycles > 0 and introductory_price is None:
                    # Discounted introductory regular tier
                    introductory_price = price_val
                    introductory_cycles = total_cycles

        # A missing billing_cycles collection is unknown. If the collection is
        # present and contains no TRIAL cycle, no trial is confirmed. Convert
        # to days only when PayPal supplied an exact DAY-based schedule; never
        # approximate MONTH or YEAR intervals.
        if isinstance(raw_cycles_value, list):
            if not trial_cycles:
                trial_days = 0
            elif all(
                c.get('interval_unit') == 'DAY'
                and isinstance(c.get('interval_count'), int)
                and c.get('interval_count') > 0
                and isinstance(c.get('total_cycles'), int)
                and c.get('total_cycles') > 0
                for c in trial_cycles
            ):
                trial_days = sum(c['interval_count'] * c['total_cycles'] for c in trial_cycles)

        # Extract payment preferences (setup fee, auto bill outstanding)
        payment_pref = raw_plan.get('payment_preferences') if isinstance(raw_plan.get('payment_preferences'), dict) else {}
        setup_fee_obj = payment_pref.get('setup_fee') if isinstance(payment_pref.get('setup_fee'), dict) else None
        setup_fee = setup_fee_obj.get('value') if setup_fee_obj and 'value' in setup_fee_obj else None
        setup_fee_curr = setup_fee_obj.get('currency_code') if setup_fee_obj else None

        # Taxes
        taxes = raw_plan.get('taxes', {})

        return {
            'id': plan_id,
            'product_id': product_id,
            'name': name,
            'description': description,
            'status': status,
            'currency': currency,
            'regular_price': regular_price,
            'introductory_price': introductory_price,
            'introductory_cycles': introductory_cycles,
            'trial_days': trial_days,
            'trial_configuration': {
                'present': bool(trial_cycles),
                'cycles': trial_cycles,
                'duration_days': trial_days,
            } if isinstance(raw_cycles_value, list) else None,
            'billing_frequency': billing_frequency,
            'frequency_interval': frequency_interval,
            'setup_fee': setup_fee,
            'setup_fee_currency': setup_fee_curr,
            'billing_cycles': formatted_cycles,
            'payment_preferences': payment_pref,
            'taxes': taxes,
            'raw_plan': raw_plan,
        }

    @staticmethod
    def compute_canonical_fingerprint(plan_details: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """
        Computes a deterministic SHA-256 fingerprint from the canonical financial configuration.
        Excludes transient response metadata (links, timestamps, description).
        Includes:
        - product_id
        - status
        - currency
        - setup_fee (normalized to 2 decimal places)
        - setup_fee_currency
        - billing_cycles (sorted strictly by sequence):
          - sequence
          - tenure_type
          - total_cycles
          - interval_unit
          - interval_count
          - price_value (normalized to 2 decimal places)
          - currency
        """
        raw = plan_details.get('raw_plan', plan_details)

        # Normalize setup fee
        setup_fee_val = 'UNKNOWN'
        setup_fee_curr = 'UNKNOWN'
        payment_pref = raw.get('payment_preferences', {})
        if payment_pref and 'setup_fee' in payment_pref:
            fee_obj = payment_pref['setup_fee']
            if isinstance(fee_obj, dict) and fee_obj.get('value') is not None:
                try:
                    amount = Decimal(str(fee_obj['value']))
                    setup_fee_val = f"{amount:.2f}" if amount.is_finite() else str(fee_obj['value'])
                except Exception:
                    setup_fee_val = str(fee_obj['value'])
                setup_fee_curr = str(fee_obj.get('currency_code') or 'UNKNOWN').upper()

        # Canonicalize billing cycles
        canonical_cycles = []
        raw_cycles_value = raw.get('billing_cycles')
        raw_cycles = raw_cycles_value if isinstance(raw_cycles_value, list) else []
        for c in sorted(raw_cycles, key=lambda x: x.get('sequence', 0)):
            freq = c.get('frequency') if isinstance(c.get('frequency'), dict) else {}
            pricing = c.get('pricing_scheme') if isinstance(c.get('pricing_scheme'), dict) else {}
            fixed_price = pricing.get('fixed_price', {})

            p_val = fixed_price.get('value') if isinstance(fixed_price, dict) else None
            if p_val is None:
                norm_val = 'UNKNOWN'
            else:
                try:
                    amount = Decimal(str(p_val))
                    norm_val = f"{amount:.2f}" if amount.is_finite() else str(p_val)
                except Exception:
                    norm_val = str(p_val)

            sequence = c.get('sequence')
            total_cycles = c.get('total_cycles')
            interval_count = freq.get('interval_count')
            tenure_type = c.get('tenure_type')
            interval_unit = freq.get('interval_unit')
            currency = fixed_price.get('currency_code') if isinstance(fixed_price, dict) else None

            canonical_cycles.append({
                'sequence': sequence if isinstance(sequence, int) and not isinstance(sequence, bool) else 'UNKNOWN',
                'tenure_type': str(tenure_type).upper() if tenure_type else 'UNKNOWN',
                'total_cycles': total_cycles if isinstance(total_cycles, int) and not isinstance(total_cycles, bool) and total_cycles >= 0 else 'UNKNOWN',
                'interval_unit': str(interval_unit).upper() if interval_unit else 'UNKNOWN',
                'interval_count': interval_count if isinstance(interval_count, int) and not isinstance(interval_count, bool) and interval_count > 0 else 'UNKNOWN',
                'price_value': norm_val,
                'currency': str(currency).upper() if currency else 'UNKNOWN',
            })

        canonical_dict = {
            'product_id': raw.get('product_id') or 'UNKNOWN',
            'status': str(raw.get('status') or 'UNKNOWN').upper(),
            'setup_fee': setup_fee_val,
            'setup_fee_currency': setup_fee_curr,
            'billing_cycles': canonical_cycles if isinstance(raw_cycles_value, list) else 'UNKNOWN',
        }

        # Deterministic JSON serialization: sorted keys, compact separators
        canonical_json = json.dumps(canonical_dict, sort_keys=True, separators=(',', ':'))
        fingerprint = hashlib.sha256(canonical_json.encode('utf-8')).hexdigest()

        return fingerprint, canonical_dict

    def create_subscription(self, plan_id: str, application_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        payload = {'plan_id': plan_id}
        if application_context:
            payload['application_context'] = application_context
        response = self._authenticated_request('POST', '/v1/billing/subscriptions', json=payload)
        if response.status_code not in (200, 201):
            details = response.json() if response.content else {}
            raise PayPalAPIError(f'Failed to create PayPal subscription: {details.get("message", response.text)}', response.status_code, details)
        return response.json()

    def get_subscription(self, subscription_id: str) -> Dict[str, Any]:
        response = self._authenticated_request('GET', f'/v1/billing/subscriptions/{subscription_id}')
        if response.status_code != 200:
            details = response.json() if response.content else {}
            raise PayPalAPIError(f'Failed to retrieve PayPal subscription: {details.get("message", response.text)}', response.status_code, details)
        return response.json()

    def verify_webhook_signature(self, headers: Dict[str, str], event_body: Dict[str, Any], webhook_id: str) -> bool:
        payload = {
            'auth_algo': headers.get('PAYPAL-AUTH-ALGO'),
            'cert_url': headers.get('PAYPAL-CERT-URL'),
            'transmission_id': headers.get('PAYPAL-TRANSMISSION-ID'),
            'transmission_sig': headers.get('PAYPAL-TRANSMISSION-SIG'),
            'transmission_time': headers.get('PAYPAL-TRANSMISSION-TIME'),
            'webhook_id': webhook_id,
            'webhook_event': event_body,
        }
        if not all(payload[k] for k in ('auth_algo', 'cert_url', 'transmission_id', 'transmission_sig', 'transmission_time', 'webhook_id')):
            return False
        response = self._authenticated_request('POST', '/v1/notifications/verify-webhook-signature', json=payload)
        if response.status_code != 200:
            return False
        return response.json().get('verification_status') == 'SUCCESS'
