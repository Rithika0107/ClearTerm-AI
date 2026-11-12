export const formatCurrencyAmount = (amount, currency) => {
  if (amount === null || amount === undefined || amount === '' || String(amount).trim().toUpperCase() === 'UNKNOWN') return 'Unavailable'
  const numericAmount = typeof amount === 'number' ? amount : Number(String(amount).trim())
  if (!Number.isFinite(numericAmount)) return 'Unavailable'
  const code = String(currency || '').toUpperCase()
  if (code && !/^[A-Z]{3}$/.test(code)) return 'Unavailable'
  const supportedCurrencies = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('currency')
    : null
  if (code && supportedCurrencies && !supportedCurrencies.includes(code)) return 'Unavailable'
  if (code === 'INR' || code === 'USD') {
    const locale = code === 'INR' ? 'en-IN' : 'en-US'
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numericAmount)
    } catch {
      return 'Unavailable'
    }
  }
  return `${numericAmount}${code ? ` ${code}` : ''}`
}
