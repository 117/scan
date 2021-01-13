import _ from 'lodash'
import pkg from '../package.json'
import math from './math.js'
import yargs from 'yargs'
import chalk from 'chalk'
import moment from 'moment-timezone'
import parseDuration from 'parse-duration'
import prettyTable from '@master-chief/pretty-table'

import { Client as PolygonClient } from './polygon/client.js'
import { AlpacaClient } from '@master-chief/alpaca'
import { Trade } from './polygon/trade'

yargs(process.argv.slice(2)).command(
  '$0',
  '...',
  (argv) =>
    argv
      .version(pkg.version)
      .help('help', 'show help')
      .option('version', {
        alias: 'v',
      })
      .option('volume', {
        number: true,
        default: 50000,
      })
      .option('change', {
        number: true,
        default: 4,
      })
      .option('alpaca-key', {
        string: true,
        demandOption: true,
      })
      .option('alpaca-secret', {
        string: true,
        demandOption: true,
      })
      .option('polygon-key', {
        string: true,
        demandOption: true,
      }),
  async (argv) => {
    // build the alpaca client
    const alpaca = new AlpacaClient({
      credentials: {
        key: argv['alpaca-key'],
        secret: argv['alpaca-secret'],
      },
      rate_limit: true,
    })

    // check if alpaca is authenticated
    if (!(await alpaca.isAuthenticated())) {
      throw new Error('not authenticated with alpaca')
    }

    // build the polygon client
    const polygon = new PolygonClient({ key: argv['polygon-key'] })

    // check if polygon is authenticated
    if (!(await polygon.authenticated())) {
      throw new Error('not authenticated with polygon')
    }

    // fetch assets for the day
    let assets = (await alpaca.getAssets({ status: 'active' })).filter(
      (asset) =>
        // do we care about tradeable stocks
        asset.tradable == true &&
        // do we care about anything more than n chars
        asset.symbol.length <= 4 &&
        // do we care about different classes of shares
        asset.symbol.match(/^[A-Z]+$/),
    )

    console.log(`got ${assets.length.toLocaleString()} assets`)

    // subscribe to the channels
    await polygon.websocket
      .subscribe(assets.map((asset) => `T.${asset.symbol}`))
      .then(() => console.log(`subscribed to channels`))
      .catch((error) => console.log(error))

    // create trade cache
    const cache = new Map<string, Trade[]>()

    // listen for events
    polygon.websocket.on('trade', (event) => {
      // get and filter the trades
      let trades = (cache.get(event.sym) ?? [])
          .concat(event)
          .filter((trade) => Date.now() - trade.t <= 60000),
        change = math.change({
          from: trades[0].p,
          to: trades[trades.length - 1].p,
        })

      // does change exceed threshold
      if (change >= argv.change) {
        let volume = trades.map((trade) => trade.s).reduce((a, b) => a + b)
        // does volume exceed threshold
        if (volume >= argv.volume) {
          // print alert
          console.log(
            `${moment().format('MM-DD-YYYY HH:mm:ss')}\t ${
              event.sym
            } ${event.p.toFixed(2)} ${tiny(volume, 0)} gap_up`,
          )

          // wipe the trades
          trades = [].concat(event)
        }
      }

      cache.set(event.sym, trades)
    })
  },
).argv

function tiny(value: number, places: number): string {
  let level = 0

  while (value >= 1000) {
    ;(value /= 1000), level++
  }

  return value.toFixed(places).concat(['', 'K', 'M', 'B', 'T'][level] ?? 'ERR')
}
