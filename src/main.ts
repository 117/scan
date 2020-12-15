import _ from 'lodash'
import pkg from '../package.json'
import got from 'got'
import yargs from 'yargs'
import chalk from 'chalk'
import moment from 'moment-timezone'
import parseDuration from 'parse-duration'
// @ts-ignore
import draftlog from 'draftlog'
import WebSocket from 'ws'

import { default as Decimal } from 'decimal.js'

const DraftLog = draftlog.into(console)

enum Alert {
  GAP_UP,
  GAP_DOWN,
}

interface Ticker {
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

interface Trade {
  ev: string
  sym: string
  i: string
  x: number
  p: number
  s: number
  t: number
  z: number
}

yargs(process.argv.slice(2)).command(
  '$0',
  '...',
  (argv) =>
    argv
      .version(pkg.version)
      .help('help', 'show help')
      .option('version', {
        alias: 'v',
        describe: 'show version',
      })
      .option('gap', {
        boolean: true,
        default: true,
        describe: 'toggle gap detection',
      })
      .option('gap-percent', {
        number: true,
        default: 0.02,
        describe: 'gap percent threshold',
      })
      .option('gap-duration', {
        number: true,
        default: '10 seconds',
        describe: 'gap duration threshold',
      })
      .option('polygon-key', {
        string: true,
        describe: 'polygon API key',
        demandOption: true,
      }),
  async (argv) => {
    let tickers = new Array<Ticker>(),
      // todo: change
      pages = 200,
      // @ts-ignore
      line = console.draft('please wait')

    await Promise.allSettled(
      [...Array(pages + 1).keys()].slice(1).map((_, page) =>
        got(
          `https://api.polygon.io/v2/reference/tickers?sort=ticker&perpage=50&active=true&page=${page}&apiKey=${argv['polygon-key']}`,
        ).then((response) => {
          tickers.push(...JSON.parse(response.body)['tickers']),
            line(`got ${tickers.length} tickers`)
        }),
      ),
    )

    // filter out shit-ass tickers
    let symbols = tickers
      .map((ticker) => ticker.ticker)
      .filter(
        (symbol) =>
          symbol.length < 5 && !symbol.includes('.') && !symbol.includes('-'),
      )

    console.log(`using ${symbols.length} symbols`)
    console.log('connecting to websocket')

    const websocket = new WebSocket('wss://socket.polygon.io/stocks')

    console.log('done')

    websocket.on('open', () =>
      websocket.send(
        JSON.stringify({ action: 'auth', params: argv['polygon-key'] }),
        (error) => {
          if (error) {
            throw error
          } else {
            console.log('auth pending')
          }
        },
      ),
    )

    const trades = new Map<string, Trade>(),
      gapDurationInMs = parseDuration(argv['gap-duration'], 'ms') ?? 60e3

    websocket.on('message', (data) => {
      let message = JSON.parse(data.toString())[0]

      switch (message.ev) {
        case 'status':
          switch (message.status) {
            case 'auth_success':
              console.log('success')

              let total = 0,
                // @ts-ignore
                line = console.draft()

              _.chunk(symbols, 300).forEach((chunk) =>
                websocket.send(
                  JSON.stringify({
                    action: 'subscribe',
                    params: chunk.map((symbol) => `T.${symbol}`).join(','),
                  }),
                  (error) => {
                    if (error) {
                      throw error
                    } else {
                      total += chunk.length
                      line(`subscribed to ${total} channels`)
                    }
                  },
                ),
              )

              break
          }

          break
        case 'T':
          // new trade
          let next = message as Trade,
            // get
            last = trades.get(next.sym) ?? next

          // set
          trades.set(next.sym, next)

          // percent change since last trade
          let change = (next.p - last.p) / last.p

          if (
            // check fits gap duration
            Math.abs(next.t - last.t) <= gapDurationInMs &&
            // check fits gap percent
            Math.abs(change) > argv['gap-percent']
          ) {
            console.log(
              moment().format('MM-DD-YY HH:mm:ss').padEnd(22),
              (change > 0 ? chalk.green : chalk.red)(
                `gap_${change > 0 ? 'up' : 'down'}`,
              ).padEnd(10),
              `${(change * 100).toFixed(2)}%`.padEnd(8),
              next.sym.padEnd(8),
              `$${chalk.gray(next.p.toLocaleString())}`,
            )
          }

          break
      }
    })
  },
).argv
