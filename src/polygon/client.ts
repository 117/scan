import _ from 'lodash'
import got from 'got'

import WebSocket from 'ws'

import { Mutex } from 'async-mutex'
import { Snapshot } from './snapshot.js'
import { Status } from './status.js'
import { Trade } from './trade.js'
import { Quote } from './quote.js'

declare interface PolygonEvents {
  error: (event: Error) => void
  message: (event: Object) => void
  status: (event: Status) => void
  trade: (event: Trade) => void
  quote: (event: Quote) => void
}

export class Client {
  private mutex = new Mutex()
  private socket: WebSocket | undefined
  private socket_authenticated = false
  private callbacks = new Map<string, CallableFunction>()

  constructor(protected parameters: { key: string }) {}

  async authenticated(): Promise<boolean> {
    return await this.market_status()
      .then((response) => {
        if ('status' in response) {
          if (response['status'] == 'ERROR') {
            return false
          }
        }
        return true
      })
      .catch(() => false)
  }

  async market_status(): Promise<{
    market: string
    serverTime: string
    exchanges: {
      nyse: string
      nasdaq: string
      otc: string
    }
    currencies: {
      fx: string
      crypto: string
    }
  }> {
    return await got(
      `https://api.polygon.io/v1/marketstatus/now?apiKey=${this.parameters.key}`,
    ).then((response) => JSON.parse(response.body))
  }

  public stocks = {
    trades: async (parameters: {
      ticker: string
      date: string
      timestamp?: number
      timestampLimit?: number
      reverse?: boolean
      limit?: number
    }): Promise<{
      ticker: string
      results_count: number
      db_latency: number
      success: boolean
      results: {
        t: number
        y: number
        q: number
        i: string
        x: number
        s: number
        c: number[]
        p: number
        z: number
      }[]
    }> => {
      return await got(
        this.endpoint(
          `ticks/stocks/trades/${parameters.ticker}/${parameters.date}`,
          (() => {
            // @ts-ignore
            delete parameters['ticker']
            // @ts-ignore
            delete parameters['date']
            return parameters
          })(),
        ),
      ).then((response) => JSON.parse(response.body))
    },

    snapshot: async (): Promise<Snapshot> =>
      await got(
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${this.parameters.key}`,
      ).then((response) => JSON.parse(response.body)),
  }

  public websocket = {
    disconnect: async () => {
      this.socket && this.socket.close()
      this.socket = undefined
    },
    subscribe: async (channels: string[]) => {
      let release = await this.mutex.acquire()

      try {
        let socket = this.socket
          ? this.socket
          : (this.socket = new WebSocket('wss://socket.polygon.io/stocks'))

        !this.socket_authenticated &&
          (await new Promise<void>((resolve, reject) =>
            socket.on('open', () =>
              socket.on('message', (data) => {
                let message = JSON.parse(data.toString())[0]

                if (this.callbacks.has('message')) {
                  // @ts-ignore
                  this.callbacks.get('message')(message)
                }

                if (this.callbacks.has(message.ev)) {
                  // @ts-ignore
                  this.callbacks.get(message.ev)(message)
                }

                if (this.socket_authenticated) {
                  return
                }

                switch (message.ev) {
                  case 'status':
                    switch (message.status) {
                      case 'connected':
                        socket.send(
                          JSON.stringify({
                            action: 'auth',
                            params: this.parameters.key,
                          }),
                          (error) => {
                            if (error) {
                              reject(error.message)
                            }
                          },
                        )
                        break
                      case 'auth_success':
                        this.socket_authenticated = true
                        resolve()
                        break
                      case 'auth_failed':
                        reject(message.status)
                    }
                }
              }),
            ),
          ).catch((error) => {
            throw error
          }))

        await new Promise<void>((resolve, reject) => {
          socket.send(
            JSON.stringify({
              action: 'subscribe',
              params: channels.join(','),
            }),
            (error) => {
              if (error) {
                reject(error.message)
              } else {
                resolve()
              }
            },
          )
        }).catch((error) => {
          throw error
        })
      } catch (error) {
        throw error instanceof Error ? error : new Error(error)
      } finally {
        release()
      }
    },
    on: async <U extends keyof PolygonEvents>(
      name: U,
      callback: PolygonEvents[U],
    ) => {
      this.callbacks.set(
        {
          error: 'error',
          message: 'message',
          status: 'status',
          trade: 'T',
          quote: 'Q',
        }[name],
        callback,
      )
    },
  }

  private endpoint(path: string, params?: any): string {
    params = params == undefined ? {} : params
    params['apiKey'] = this.parameters.key

    return `https://api.polygon.io/v2/${path}/?${Object.entries(params)
      .map(([key, value]) => key + '=' + value)
      .join('&')}`
  }
}
