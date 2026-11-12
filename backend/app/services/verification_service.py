import calendar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_DOWN
from typing import Any, Dict, List, Optional, Tuple


# ISO 4217 alphabetic codes, including the standard precious-metal, funds,
# testing and no-currency codes.  The registry is deliberately allow-listed;
# a syntactically valid three-letter string is not necessarily a currency.
ISO_4217_CODES = frozenset('''
AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAD XAG XAU XBA XBB XBC XBD XCD XDR XOF XPD XPF XPT XSU XTS XUA XXX YER ZAR ZMW ZWG
'''.split())

ISO_4217_MINOR_UNITS = {
    'BHD': 3, 'CLF': 4, 'JOD': 3, 'KWD': 3, 'LYD': 3, 'OMR': 3, 'TND': 3,
    'BIF': 0, 'CLP': 0, 'DJF': 0, 'GNF': 0, 'ISK': 0, 'JPY': 0,
    'KMF': 0, 'KRW': 0, 'PYG': 0, 'RWF': 0, 'UGX': 0, 'VND': 0, 'VUV': 0,
    'XAF': 0, 'XOF': 0, 'XPF': 0,
}

SPECIAL_PURPOSE_CODES = frozenset({
    'BOV', 'CHE', 'CHW', 'CLF', 'COU', 'MXV', 'USN', 'UYI', 'UYW',
    'XAD', 'XAG', 'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XCD', 'XDR',
    'XPD', 'XPT', 'XSU', 'XTS', 'XUA', 'XXX',
})
TRANSACTION_CURRENCY_CODES = ISO_4217_CODES - SPECIAL_PURPOSE_CODES
PAYPAL_SUPPORTED_CURRENCIES = frozenset({
    'AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF',
    'ILS', 'JPY', 'MYR', 'MXN', 'NOK', 'NZD', 'PHP', 'PLN', 'SEK', 'SGD',
    'THB', 'TWD', 'USD',
})
PAYPAL_COMPARABLE_CURRENCIES = PAYPAL_SUPPORTED_CURRENCIES | {'INR'}

SUPPORTED_INTERVALS = {'DAY': Decimal('1'), 'WEEK': Decimal('7'), 'MONTH': Decimal('30'), 'YEAR': Decimal('365')}
UNKNOWN_VALUES = {'', 'NONE', 'NULL', 'UNSTATED', 'UNKNOWN', 'UNAVAILABLE', 'N/A'}


def currency_minor_units(code: Any) -> Optional[int]:
    normalized = str(code or '').strip().upper()
    if normalized not in ISO_4217_CODES:
        return None
    return ISO_4217_MINOR_UNITS.get(normalized, 2)


def normalize_currency(code: Any) -> Optional[str]:
    normalized = str(code or '').strip().upper()
    return normalized if normalized in TRANSACTION_CURRENCY_CODES else None


def normalize_paypal_currency(code: Any) -> Optional[str]:
    normalized = normalize_currency(code)
    return normalized if normalized in PAYPAL_COMPARABLE_CURRENCIES else None


def is_paypal_subscription_currency_supported(code: Any) -> bool:
    normalized = normalize_currency(code)
    return normalized in PAYPAL_SUPPORTED_CURRENCIES if normalized else False


def parse_decimal_safe(val: Any) -> Optional[Decimal]:
    """Parse a monetary value without binary floating-point arithmetic."""
    if val is None or isinstance(val, bool) or isinstance(val, float):
        return None
    if isinstance(val, str):
        text = val.strip()
        if text.upper() in UNKNOWN_VALUES:
            return None
        text = text.replace('$', '').replace('€', '').replace('£', '').replace(',', '')
    elif isinstance(val, (Decimal, int)):
        text = str(val)
    else:
        return None
    try:
        amount = Decimal(text)
    except (InvalidOperation, ValueError, TypeError):
        return None
    if not amount.is_finite() or amount < 0:
        return None
    return amount


def parse_nonnegative_integer(val: Any) -> Optional[int]:
    if isinstance(val, bool) or val is None:
        return None
    if isinstance(val, int):
        return val if val >= 0 else None
    if isinstance(val, str) and val.strip().isdigit():
        parsed = int(val.strip())
        return parsed if parsed >= 0 else None
    return None


def parse_positive_integer(val: Any) -> Optional[int]:
    parsed = parse_nonnegative_integer(val)
    return parsed if parsed and parsed > 0 else None


def format_money(value: Any, currency: Any) -> Optional[str]:
    # Monetary inputs reject negatives, but a calculated signed difference may
    # legitimately be negative (the actual plan is cheaper than advertised).
    amount = value if isinstance(value, Decimal) and value.is_finite() else parse_decimal_safe(value)
    units = currency_minor_units(currency)
    if amount is None or units is None:
        return None
    quantum = Decimal(1).scaleb(-units)
    if amount != amount.quantize(quantum):
        return None
    return f'{amount:.{units}f}'


def parse_money(value: Any, currency: Any) -> Optional[Decimal]:
    amount = parse_decimal_safe(value)
    units = currency_minor_units(currency)
    if amount is None or units is None:
        return None
    quantum = Decimal(1).scaleb(-units)
    return amount if amount == amount.quantize(quantum) else None


def normalize_frequency(unit: Any, interval: Any = 1) -> Optional[Tuple[str, int]]:
    if unit is None:
        return None
    normalized = str(unit).strip().upper().replace('S', '')
    aliases = {'D': 'DAY', 'DAY': 'DAY', 'W': 'WEEK', 'WEEK': 'WEEK', 'M': 'MONTH', 'MONTH': 'MONTH', 'Y': 'YEAR', 'YEAR': 'YEAR'}
    name = aliases.get(normalized)
    count = parse_positive_integer(interval)
    return (name, count) if name and count else None


def parse_iso_date(value: Any) -> Optional[date]:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def _money_or_none(value: Any, currency: str) -> Optional[str]:
    return format_money(value, currency) if value is not None else None


class FinancialVerificationEngine:
    """Deterministic, Decimal-only comparison of advertised and PayPal terms."""

    @classmethod
    def verify(cls, advertised_terms: Dict[str, Any], paypal_plan: Dict[str, Any], supporting_evidence: Optional[List[str]] = None) -> Dict[str, Any]:
        evidence = supporting_evidence or advertised_terms.get('evidence_quotes', []) or []
        evidence_map = advertised_terms.get('evidence_by_field') or {}
        if not isinstance(evidence_map, dict):
            evidence_map = {}
        uncertainty = advertised_terms.get('uncertainty_flags', []) or []
        fields: List[Dict[str, Any]] = []
        adv_curr = normalize_currency(advertised_terms.get('currency'))
        pay_curr = normalize_paypal_currency(paypal_plan.get('currency'))
        raw_pay_curr = str(paypal_plan.get('currency') or '').strip().upper()
        if not adv_curr or not pay_curr:
            reason = 'missing or not an ordinary ISO 4217 transaction currency'
            if raw_pay_curr in TRANSACTION_CURRENCY_CODES and raw_pay_curr not in PAYPAL_SUPPORTED_CURRENCIES:
                reason = f'PayPal does not support {raw_pay_curr} for this transaction'
            currency_status, currency_explanation = 'REVIEW', f'Currency is {reason}.'
        elif adv_curr != pay_curr:
            currency_status, currency_explanation = 'MISMATCH', f'Currency mismatch: advertised {adv_curr} versus PayPal {pay_curr}; no conversion was applied.'
        else:
            currency_status, currency_explanation = 'MATCH', f'ISO 4217 currency match: {adv_curr}.'
        fields.append(cls._field('currency', 'Currency Code', adv_curr or 'Unavailable', pay_curr or 'Unavailable', currency_status, currency_explanation, cls._find_evidence('currency', evidence_map)))

        adv_intro = parse_money(advertised_terms.get('introductory_price'), adv_curr)
        pay_intro = parse_money(paypal_plan.get('introductory_price'), pay_curr)
        fields.append(cls._compare_amount('introductory_price', 'Introductory Price', adv_intro, pay_intro, adv_curr, pay_curr, evidence_map, missing_both='Both sides specify no introductory price.'))

        adv_cycles_raw, pay_cycles_raw = advertised_terms.get('introductory_cycles'), paypal_plan.get('introductory_cycles')
        adv_cycles, pay_cycles = parse_positive_integer(adv_cycles_raw), parse_positive_integer(pay_cycles_raw)
        if adv_cycles_raw is None and pay_cycles_raw is None and adv_intro is None and pay_intro is None:
            cycle_status, cycle_explanation = 'MATCH', 'No introductory tier is configured on either side.'
        elif adv_cycles is None or pay_cycles is None:
            cycle_status, cycle_explanation = 'REVIEW', 'Introductory price/cycle information is missing or is not a positive integer.'
        elif adv_cycles != pay_cycles:
            cycle_status, cycle_explanation = 'MISMATCH', f'Introductory cycle count mismatch: advertised {adv_cycles} versus PayPal {pay_cycles}.'
        else:
            cycle_status, cycle_explanation = 'MATCH', f'Introductory cycle count matches: {adv_cycles}.'
        fields.append(cls._field('introductory_cycles', 'Introductory Billing Cycles', f'{adv_cycles} cycles' if adv_cycles else 'Unavailable', f'{pay_cycles} cycles' if pay_cycles else 'Unavailable', cycle_status, cycle_explanation, cls._find_evidence('introductory_cycles', evidence_map)))

        adv_regular, pay_regular = parse_money(advertised_terms.get('regular_price'), adv_curr), parse_money(paypal_plan.get('regular_price'), pay_curr)
        fields.append(cls._compare_amount('regular_price', 'Regular / Renewal Price', adv_regular, pay_regular, adv_curr, pay_curr, evidence_map, missing_both='Regular renewal price is missing from both sources.'))

        adv_frequency = normalize_frequency(advertised_terms.get('billing_frequency'), advertised_terms.get('frequency_interval', 1))
        pay_frequency = normalize_frequency(paypal_plan.get('billing_frequency'), paypal_plan.get('frequency_interval', 1))
        if not adv_frequency or not pay_frequency:
            frequency_status, frequency_explanation = 'REVIEW', 'Billing cadence or interval is missing, unsupported or malformed.'
        elif adv_frequency != pay_frequency:
            frequency_status, frequency_explanation = 'MISMATCH', f'Cadence mismatch: advertised {adv_frequency[1]} {adv_frequency[0]} versus PayPal {pay_frequency[1]} {pay_frequency[0]}.'
        else:
            frequency_status, frequency_explanation = 'MATCH', f'Billing cadence matches: every {adv_frequency[1]} {adv_frequency[0]}.'
        fields.append(cls._field('billing_frequency', 'Billing Frequency', cls._frequency_text(adv_frequency), cls._frequency_text(pay_frequency), frequency_status, frequency_explanation, cls._find_evidence('billing_frequency', evidence_map)))

        adv_trial_raw, pay_trial_raw = advertised_terms.get('trial_duration_days'), paypal_plan.get('trial_days')
        adv_trial, pay_trial = parse_nonnegative_integer(adv_trial_raw), parse_nonnegative_integer(pay_trial_raw)
        if adv_trial_raw is None and pay_trial_raw is None:
            trial_status, trial_explanation = 'REVIEW', 'Trial duration is unavailable on both sides; absence was not treated as zero.'
        elif adv_trial is None or pay_trial is None:
            trial_status, trial_explanation = 'REVIEW', 'Trial duration is malformed or unavailable.'
        elif adv_trial != pay_trial:
            trial_status, trial_explanation = 'MISMATCH', f'Trial duration mismatch: advertised {adv_trial} days versus PayPal {pay_trial} days.'
        else:
            trial_status, trial_explanation = 'MATCH', f'Trial duration matches: {adv_trial} days.'
        fields.append(cls._field('trial_duration', 'Free Trial Period', f'{adv_trial} days' if adv_trial is not None else 'Unavailable', f'{pay_trial} days' if pay_trial is not None else 'Unavailable', trial_status, trial_explanation, cls._find_evidence('trial_duration', evidence_map)))

        adv_setup_raw, pay_setup_raw = advertised_terms.get('setup_fee'), paypal_plan.get('setup_fee')
        adv_setup, pay_setup = parse_money(adv_setup_raw, adv_curr), parse_money(pay_setup_raw, pay_curr)
        if adv_setup_raw is None or pay_setup_raw is None:
            if adv_setup_raw is None and pay_setup is not None and pay_setup > 0:
                setup_status, setup_explanation = 'MISMATCH', f'Undisclosed setup fee: PayPal charges {_money_or_none(pay_setup, pay_curr) or "Unavailable"}.'
            else:
                setup_status, setup_explanation = 'REVIEW', 'Setup fee is missing or unavailable; it was not treated as zero.'
        elif adv_setup is None or pay_setup is None:
            setup_status, setup_explanation = 'REVIEW', 'Setup fee is malformed, negative or non-finite.'
        elif adv_setup != pay_setup:
            setup_status, setup_explanation = 'MISMATCH', f'Setup fee mismatch: advertised {_money_or_none(adv_setup, adv_curr) or "Unavailable"} versus PayPal {_money_or_none(pay_setup, pay_curr) or "Unavailable"}.'
        else:
            setup_status, setup_explanation = 'MATCH', f'Setup fee matches: {_money_or_none(adv_setup, adv_curr) or "Unavailable"}.'
        fields.append(cls._field('setup_fee', 'Setup / Onboarding Fee', _money_or_none(adv_setup, adv_curr) or 'Unavailable', _money_or_none(pay_setup, pay_curr) or 'Unavailable', setup_status, setup_explanation, cls._find_evidence('setup_fee', evidence_map)))

        status = str(paypal_plan.get('status') or '').strip().upper()
        status_result = 'MATCH' if status == 'ACTIVE' else ('REVIEW' if not status else 'MISMATCH')
        fields.append(cls._field('plan_status', 'PayPal Plan Status', 'Public Offer', status or 'Unavailable', status_result, 'PayPal plan is ACTIVE.' if status == 'ACTIVE' else 'PayPal plan status is unavailable or not ACTIVE.'))

        mismatches = [f['field_name'] for f in fields if f['comparison_status'] == 'MISMATCH']
        reviews = [f['field_name'] for f in fields if f['comparison_status'] == 'REVIEW']
        matched = [f['field_name'] for f in fields if f['comparison_status'] == 'MATCH']
        verdict = 'MISMATCH DETECTED' if mismatches else ('REQUIRES REVIEW' if reviews or uncertainty else 'VERIFIED')
        return {'final_verdict': verdict, 'fields': fields, 'matched_fields': matched, 'mismatched_fields': mismatches, 'review_fields': reviews, 'uncertainty_flags': uncertainty, 'financial_impact': cls._calculate_first_year_impact(advertised_terms, paypal_plan, fields), 'verification_timestamp': datetime.now(timezone.utc).isoformat()}

    @staticmethod
    def _field(name: str, label: str, advertised: Any, actual: Any, status: str, explanation: str, evidence: Any = None) -> Dict[str, Any]:
        return {'field_name': name, 'label': label, 'advertised_value': advertised, 'actual_value': actual, 'comparison_status': status, 'explanation': explanation, 'evidence': evidence}

    @staticmethod
    def _find_evidence(field_name: str, evidence_map: Dict[str, Any]) -> Any:
        return evidence_map.get(field_name)

    @classmethod
    def _compare_amount(cls, name: str, label: str, advertised: Optional[Decimal], actual: Optional[Decimal], advertised_currency: Optional[str], actual_currency: Optional[str], evidence_map: Dict[str, Any], missing_both: str) -> Dict[str, Any]:
        if advertised is None and actual is None:
            status, explanation = ('MATCH', missing_both) if name == 'introductory_price' else ('REVIEW', missing_both)
        elif advertised is None or actual is None:
            status, explanation = 'REVIEW', f'{label} is missing or malformed on one side.'
        elif not advertised_currency or not actual_currency or advertised_currency != actual_currency:
            status, explanation = 'REVIEW', f'{label} cannot be compared without the same valid currency.'
        elif advertised == actual:
            status, explanation = 'MATCH', f'{label} matches at {_money_or_none(advertised, advertised_currency)} {advertised_currency}.'
        else:
            difference = actual - advertised
            sign = '+' if difference > 0 else '-'
            status, explanation = 'MISMATCH', f'{label} mismatch: advertised {_money_or_none(advertised, advertised_currency)} versus PayPal {_money_or_none(actual, actual_currency)} ({sign}{_money_or_none(abs(difference), actual_currency)} {actual_currency}).'
        return cls._field(name, label, _money_or_none(advertised, advertised_currency) or 'Unavailable', _money_or_none(actual, actual_currency) or 'Unavailable', status, explanation, cls._find_evidence(name, evidence_map))

    @staticmethod
    def _frequency_text(value: Optional[Tuple[str, int]]) -> str:
        return f'every {value[1]} {value[0]}' if value else 'Unavailable'

    @classmethod
    def _calculate_first_year_impact(cls, advertised: Dict[str, Any], paypal: Dict[str, Any], fields: List[Dict[str, Any]]) -> Dict[str, Any]:
        adv_currency, pay_currency = normalize_currency(advertised.get('currency')), normalize_paypal_currency(paypal.get('currency'))
        adv_frequency = normalize_frequency(advertised.get('billing_frequency'), advertised.get('frequency_interval', 1))
        pay_frequency = normalize_frequency(paypal.get('billing_frequency'), paypal.get('frequency_interval', 1))
        if not adv_currency or adv_currency != pay_currency:
            return {'status': 'REQUIRES REVIEW', 'reason': 'Cannot calculate across missing, invalid or different currencies.', 'difference_amount': None}
        if not adv_frequency or not pay_frequency or adv_frequency != pay_frequency:
            return {'status': 'REQUIRES REVIEW', 'reason': 'Cannot calculate without matching, supported billing cadence and interval.', 'difference_amount': None}
        start_raw = advertised.get('calculation_start_date') or paypal.get('calculation_start_date')
        advertised_start = parse_iso_date(advertised.get('calculation_start_date')) if advertised.get('calculation_start_date') else None
        paypal_start = parse_iso_date(paypal.get('calculation_start_date')) if paypal.get('calculation_start_date') else None
        if advertised.get('calculation_start_date') and not advertised_start or paypal.get('calculation_start_date') and not paypal_start:
            return {'status': 'REQUIRES REVIEW', 'reason': 'The billing start date is malformed.', 'difference_amount': None}
        if advertised_start and paypal_start and advertised_start != paypal_start:
            return {'status': 'REQUIRES REVIEW', 'reason': 'Advertised and PayPal billing start dates differ.', 'difference_amount': None}
        if adv_frequency[0] in {'DAY', 'WEEK'} and not start_raw:
            return {'status': 'REQUIRES REVIEW', 'reason': 'Exact daily or weekly first-year cost requires a billing start date.', 'difference_amount': None}
        adv_regular, pay_regular = parse_money(advertised.get('regular_price'), adv_currency), parse_money(paypal.get('regular_price'), pay_currency)
        adv_intro, pay_intro = parse_money(advertised.get('introductory_price'), adv_currency), parse_money(paypal.get('introductory_price'), pay_currency)
        adv_cycles, pay_cycles = parse_positive_integer(advertised.get('introductory_cycles')), parse_positive_integer(paypal.get('introductory_cycles'))
        adv_setup, pay_setup = parse_money(advertised.get('setup_fee'), adv_currency), parse_money(paypal.get('setup_fee'), pay_currency)
        if any(field['comparison_status'] == 'REVIEW' for field in fields if field['field_name'] in {'introductory_price', 'introductory_cycles', 'regular_price', 'billing_frequency', 'trial_duration', 'setup_fee'}):
            return {'status': 'REQUIRES REVIEW', 'reason': 'A required financial term is missing, malformed or ambiguous.', 'difference_amount': None}
        if (advertised.get('introductory_cycles') is not None or paypal.get('introductory_cycles') is not None) and (adv_intro is None or pay_intro is None or adv_cycles is None or pay_cycles is None):
            return {'status': 'REQUIRES REVIEW', 'reason': 'Introductory cycle information is incomplete.', 'difference_amount': None}
        if any(v is None for v in (adv_regular, pay_regular, adv_setup, pay_setup)) or ((adv_intro is not None or pay_intro is not None) and (adv_intro is None or pay_intro is None or adv_cycles is None or pay_cycles is None)):
            return {'status': 'REQUIRES REVIEW', 'reason': 'Incomplete or malformed prices, setup fees or introductory terms.', 'difference_amount': None}
        adv_intro_frequency = normalize_frequency(advertised.get('introductory_frequency', advertised.get('billing_frequency')), advertised.get('introductory_frequency_interval', advertised.get('frequency_interval', 1)))
        pay_intro_frequency = normalize_frequency(paypal.get('introductory_frequency', paypal.get('billing_frequency')), paypal.get('introductory_frequency_interval', paypal.get('frequency_interval', 1)))
        if adv_intro is not None and pay_intro is not None and (not adv_intro_frequency or not pay_intro_frequency):
            return {'status': 'REQUIRES REVIEW', 'reason': 'Introductory cadence is incomplete or unsupported.', 'difference_amount': None}
        regular_days = SUPPORTED_INTERVALS[pay_frequency[0]] * pay_frequency[1]
        year_days = Decimal('365')
        if advertised_start or paypal_start:
            start = advertised_start or paypal_start
            if start.month == 2 and start.day == 29:
                return {'status': 'REQUIRES REVIEW', 'reason': 'Leap-day billing anniversary requires an explicit provider policy.', 'difference_amount': None}
            try:
                end = start.replace(year=start.year + 1)
            except ValueError:
                return {'status': 'REQUIRES REVIEW', 'reason': 'Billing anniversary cannot be established from the supplied date.', 'difference_amount': None}
            year_days = Decimal((end - start).days)
        def cycles_in_year(intro_price: Optional[Decimal], intro_count: Optional[int], intro_frequency: Optional[Tuple[str, int]], regular_price: Decimal) -> Optional[Decimal]:
            if pay_frequency[0] in {'MONTH', 'YEAR'}:
                total_periods = 12 if pay_frequency[0] == 'MONTH' else 1
                regular_interval = pay_frequency[1]
                if intro_price is None:
                    regular_cycles = (total_periods + regular_interval - 1) // regular_interval
                    return regular_price * regular_cycles
                if not intro_count or not intro_frequency or intro_frequency[0] != pay_frequency[0]:
                    return None
                intro_periods = intro_count * intro_frequency[1]
                if intro_periods >= total_periods:
                    return intro_price * ((total_periods + intro_frequency[1] - 1) // intro_frequency[1])
                remaining_periods = total_periods - intro_periods
                regular_cycles = (remaining_periods + regular_interval - 1) // regular_interval
                return intro_price * intro_count + regular_price * regular_cycles
            if intro_price is None:
                return regular_price * (year_days / regular_days).to_integral_value(rounding=ROUND_DOWN)
            if not intro_count or not intro_frequency:
                return None
            intro_days = SUPPORTED_INTERVALS[intro_frequency[0]] * intro_frequency[1]
            intro_total_days = intro_days * intro_count
            if intro_total_days > year_days:
                return intro_price * (year_days / intro_days).to_integral_value(rounding=ROUND_DOWN)
            regular_cycles = ((year_days - intro_total_days) / regular_days).to_integral_value(rounding=ROUND_DOWN)
            return intro_price * intro_count + regular_price * regular_cycles
        advertised_total = cycles_in_year(adv_intro, adv_cycles, adv_intro_frequency, adv_regular)
        actual_total = cycles_in_year(pay_intro, pay_cycles, pay_intro_frequency, pay_regular)
        if advertised_total is not None:
            advertised_total += adv_setup
        if actual_total is not None:
            actual_total += pay_setup
        if advertised_total is None or actual_total is None:
            return {'status': 'REQUIRES REVIEW', 'reason': 'First-year commitment cannot be established from the supplied intervals.', 'difference_amount': None}
        difference = actual_total - advertised_total
        return {'status': 'CALCULATED', 'currency': pay_currency, 'advertised_first_year': format_money(advertised_total, pay_currency), 'actual_first_year': format_money(actual_total, pay_currency), 'difference_amount': format_money(difference, pay_currency), 'has_overcharge': difference > 0, 'discrepancy_explanation': f'First-year difference: {format_money(difference, pay_currency)} {pay_currency}.'}

    @staticmethod
    def _advance_billing_date(current: date, frequency: Tuple[str, int]) -> Optional[date]:
        unit, interval = frequency
        if unit == 'DAY':
            return current + timedelta(days=interval)
        if unit == 'WEEK':
            return current + timedelta(days=7 * interval)
        if unit == 'MONTH':
            month_index = current.year * 12 + current.month - 1 + interval
            year, month = divmod(month_index, 12)
            day = min(current.day, calendar.monthrange(year, month + 1)[1])
            return date(year, month + 1, day)
        if unit == 'YEAR':
            if current.month == 2 and current.day == 29:
                return None
            try:
                return current.replace(year=current.year + interval)
            except ValueError:
                return None
        return None

    @classmethod
    def _calendar_schedule_total(
        cls,
        start: date,
        end: date,
        trial_days: int,
        introductory_price: Optional[Decimal],
        introductory_cycles: Optional[int],
        introductory_frequency: Optional[Tuple[str, int]],
        regular_price: Decimal,
        regular_frequency: Tuple[str, int],
        setup_fee: Decimal,
    ) -> Optional[Decimal]:
        cursor = start + timedelta(days=trial_days)
        total = setup_fee
        if introductory_price is not None:
            if not introductory_cycles or not introductory_frequency:
                return None
            for _ in range(introductory_cycles):
                if cursor >= end:
                    return total
                total += introductory_price
                cursor = cls._advance_billing_date(cursor, introductory_frequency)
                if cursor is None:
                    return None
        while cursor < end:
            total += regular_price
            cursor = cls._advance_billing_date(cursor, regular_frequency)
            if cursor is None:
                return None
        return total

    @classmethod
    def _calculate_first_year_impact(cls, advertised: Dict[str, Any], paypal: Dict[str, Any], fields: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate a real calendar-year schedule; never substitute fixed day counts."""
        adv_currency = normalize_currency(advertised.get('currency'))
        pay_currency = normalize_paypal_currency(paypal.get('currency'))
        if not adv_currency or adv_currency != pay_currency:
            return {'status': 'REQUIRES REVIEW', 'reason': 'Cannot calculate across missing, invalid, unsupported or different currencies.', 'difference_amount': None}
        if any(field['comparison_status'] == 'REVIEW' for field in fields if field['field_name'] in {'introductory_price', 'introductory_cycles', 'regular_price', 'billing_frequency', 'trial_duration', 'setup_fee'}):
            return {'status': 'REQUIRES REVIEW', 'reason': 'A required financial term is missing, malformed or ambiguous.', 'difference_amount': None}
        advertised_start = parse_iso_date(advertised.get('calculation_start_date'))
        paypal_start = parse_iso_date(paypal.get('calculation_start_date'))
        if not advertised_start or not paypal_start or advertised_start != paypal_start:
            return {'status': 'REQUIRES REVIEW', 'reason': 'Matching advertised and PayPal billing start dates are required for an exact first-year commitment.', 'difference_amount': None}
        if advertised_start.month == 2 and advertised_start.day == 29:
            return {'status': 'REQUIRES REVIEW', 'reason': 'Leap-day billing anniversary requires an explicit provider policy.', 'difference_amount': None}
        try:
            end = advertised_start.replace(year=advertised_start.year + 1)
        except ValueError:
            return {'status': 'REQUIRES REVIEW', 'reason': 'Billing anniversary cannot be established from the supplied calendar date.', 'difference_amount': None}

        adv_frequency = normalize_frequency(advertised.get('billing_frequency'), advertised.get('frequency_interval', 1))
        pay_frequency = normalize_frequency(paypal.get('billing_frequency'), paypal.get('frequency_interval', 1))
        if not adv_frequency or not pay_frequency or adv_frequency != pay_frequency:
            return {'status': 'REQUIRES REVIEW', 'reason': 'Matching supported billing cadence and interval are required.', 'difference_amount': None}
        adv_trial = parse_nonnegative_integer(advertised.get('trial_duration_days'))
        pay_trial = parse_nonnegative_integer(paypal.get('trial_days'))
        adv_regular = parse_money(advertised.get('regular_price'), adv_currency)
        pay_regular = parse_money(paypal.get('regular_price'), pay_currency)
        adv_setup = parse_money(advertised.get('setup_fee'), adv_currency)
        pay_setup = parse_money(paypal.get('setup_fee'), pay_currency)
        adv_intro = parse_money(advertised.get('introductory_price'), adv_currency)
        pay_intro = parse_money(paypal.get('introductory_price'), pay_currency)
        if any(value is None for value in (adv_trial, pay_trial, adv_regular, pay_regular, adv_setup, pay_setup)):
            return {'status': 'REQUIRES REVIEW', 'reason': 'Trial, price or setup-fee data is incomplete or invalid.', 'difference_amount': None}
        adv_cycles = parse_positive_integer(advertised.get('introductory_cycles')) if adv_intro is not None else None
        pay_cycles = parse_positive_integer(paypal.get('introductory_cycles')) if pay_intro is not None else None
        if (adv_intro is not None and not adv_cycles) or (pay_intro is not None and not pay_cycles):
            return {'status': 'REQUIRES REVIEW', 'reason': 'Introductory cycle data is required for exact scheduling.', 'difference_amount': None}
        adv_intro_frequency = normalize_frequency(advertised.get('introductory_frequency', advertised.get('billing_frequency')), advertised.get('introductory_frequency_interval', advertised.get('frequency_interval', 1))) if adv_intro is not None else None
        pay_intro_frequency = normalize_frequency(paypal.get('introductory_frequency', paypal.get('billing_frequency')), paypal.get('introductory_frequency_interval', paypal.get('frequency_interval', 1))) if pay_intro is not None else None
        advertised_total = cls._calendar_schedule_total(advertised_start, end, adv_trial, adv_intro, adv_cycles, adv_intro_frequency, adv_regular, adv_frequency, adv_setup)
        actual_total = cls._calendar_schedule_total(paypal_start, end, pay_trial, pay_intro, pay_cycles, pay_intro_frequency, pay_regular, pay_frequency, pay_setup)
        if advertised_total is None or actual_total is None:
            return {'status': 'REQUIRES REVIEW', 'reason': 'The supplied billing schedule cannot be represented exactly on calendar dates.', 'difference_amount': None}
        difference = actual_total - advertised_total
        formatted_difference = format_money(difference, pay_currency)
        return {'status': 'CALCULATED', 'currency': pay_currency, 'advertised_first_year': format_money(advertised_total, pay_currency), 'actual_first_year': format_money(actual_total, pay_currency), 'difference_amount': formatted_difference, 'has_overcharge': difference > 0, 'discrepancy_explanation': f'First-year difference: {formatted_difference} {pay_currency}.'}
