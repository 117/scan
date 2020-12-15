export interface Ticker {
  ticker: string
  name: string
  market: string
  locale: string
  currency: string
  active: boolean
  primaryExch: string
  type: string
  codes: {
    cik: string
    figiuid: string
    scfigi: string
    cfigi: string
    figi: string
  }
  updated: string
  url: string
}
