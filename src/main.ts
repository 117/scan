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

import { Trade } from './trade'
import { Ticker } from './ticker'

const line = draftlog.into(console)

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
      .option('volume', {
        number: true,
        default: 1000000,
        describe: 'minimum volume',
      })
      .option('gap', {
        number: true,
        default: 0.02,
        describe: 'gap percent',
      })
      .option('polygon-key', {
        string: true,
        describe: 'polygon API key',
        demandOption: true,
      }),
  async (argv) => {
    let tickers = new Array<Ticker>(),
      // @ts-ignore
      line = console.draft('please wait')

    await got(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${argv['polygon-key']}`,
    ).then((response) => {
      tickers.push(...JSON.parse(response.body)['tickers'])
      line(`got ${tickers.length} tickers`)
    })

    // filter out shit-ass tickers
    let symbols = tickers
      .map((ticker) => ticker.ticker)
      .filter(
        (symbol) =>
          symbol.length < 5 && !symbol.includes('.') && !symbol.includes('-'),
      )

    console.log(`got ${symbols.length} symbols`)
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
      volumes = new Map<string, number>()

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

          // get
          let volume = volumes.get(next.sym) ?? 0,
            newVolume = volume + next.s

          // set
          volumes.set(next.sym, newVolume)

          // did it meet the volume minimum
          if (newVolume < argv['volume']) {
            break
          }

          // percent change since last trade
          let change = (next.p - last.p) / last.p

          if (
            // check fits gap duration
            Math.abs(next.t - last.t) <= 60e3 &&
            // check fits gap percent
            Math.abs(change) > argv['gap']
          ) {
            console.log(
              `${moment().format('MM-DD-YY HH:mm:ss').padEnd(18)}${(change > 0
                ? chalk.green
                : chalk.red)(`gap_${change > 0 ? 'up' : 'down'}`).padEnd(20)}${(
                (change > 0 ? '+' : '') +
                change.toFixed(2) +
                '%'
              ).padEnd(8)}${next.sym.padEnd(6)}${abbv(newVolume, 0)?.padEnd(
                8,
              )}${`$${next.p.toLocaleString()}`}`,
            )
          }

          break
      }
    })
  },
).argv

function abbv(num: number, fixed: number) {
  if (num === null) {
    return null
  } // terminate early
  if (num === 0) {
    return '0'
  } // terminate early
  fixed = !fixed || fixed < 0 ? 0 : fixed // number of decimal places to show
  var b = num.toPrecision(2).split('e'), // get power
    k =
      b.length === 1
        ? 0
        : Math.floor(Math.min(parseFloat(b[1].slice(1)), 14) / 3), // floor at decimals, ceiling at trillions
    c =
      k < 1
        ? parseFloat(num.toFixed(0 + fixed))
        : parseFloat((num / Math.pow(10, k * 3)).toFixed(1 + fixed)), // divide by power
    d = c < 0 ? c : Math.abs(c), // enforce -0 is 0
    e = d + ['', 'K', 'M', 'B', 'T'][k] // append power
  return e
}
