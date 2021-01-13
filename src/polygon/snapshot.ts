export interface Snapshot {
  status: string
  count: number
  tickers?: Ticker[] | null
}

export interface Ticker {
  day: {
    c: number
    h: number
    l: number
    o: number
    v: number
    vw: number
  }
  lastQuote: {
    P: number
    S: number
    p: number
    s: number
    t: number
  }
  lastTrade: {
    c?: number[] | null
    i: string
    p: number
    s: number
    t: number
    x: number
  }
  min: {
    av: number
    c: number
    h: number
    l: number
    o: number
    v: number
    vw: number
  }
  prevDay: {
    c: number
    h: number
    l: number
    o: number
    v: number
    vw: number
  }
  ticker: string
  todaysChange: number
  todaysChangePerc: number
  updated: number
}
