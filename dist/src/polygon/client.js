"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = void 0;
const got_1 = __importDefault(require("got"));
const ws_1 = __importDefault(require("ws"));
const async_mutex_1 = require("async-mutex");
class Client {
    constructor(parameters) {
        this.parameters = parameters;
        this.mutex = new async_mutex_1.Mutex();
        this.socket_authenticated = false;
        this.callbacks = new Map();
        this.stocks = {
            trades: async (parameters) => {
                return await got_1.default(this.endpoint(`ticks/stocks/trades/${parameters.ticker}/${parameters.date}`, (() => {
                    // @ts-ignore
                    delete parameters['ticker'];
                    // @ts-ignore
                    delete parameters['date'];
                    return parameters;
                })())).then((response) => JSON.parse(response.body));
            },
            snapshot: async () => await got_1.default(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${this.parameters.key}`).then((response) => JSON.parse(response.body)),
        };
        this.websocket = {
            disconnect: async () => {
                this.socket && this.socket.close();
                this.socket = undefined;
            },
            subscribe: async (channels) => {
                let release = await this.mutex.acquire();
                try {
                    let socket = this.socket
                        ? this.socket
                        : (this.socket = new ws_1.default('wss://socket.polygon.io/stocks'));
                    !this.socket_authenticated &&
                        (await new Promise((resolve, reject) => socket.on('open', () => socket.on('message', (data) => {
                            let message = JSON.parse(data.toString())[0];
                            if (this.callbacks.has('message')) {
                                // @ts-ignore
                                this.callbacks.get('message')(message);
                            }
                            if (this.callbacks.has(message.ev)) {
                                // @ts-ignore
                                this.callbacks.get(message.ev)(message);
                            }
                            if (this.socket_authenticated) {
                                return;
                            }
                            switch (message.ev) {
                                case 'status':
                                    switch (message.status) {
                                        case 'connected':
                                            socket.send(JSON.stringify({
                                                action: 'auth',
                                                params: this.parameters.key,
                                            }), (error) => {
                                                if (error) {
                                                    reject(error.message);
                                                }
                                            });
                                            break;
                                        case 'auth_success':
                                            this.socket_authenticated = true;
                                            resolve();
                                            break;
                                        case 'auth_failed':
                                            reject(message.status);
                                    }
                            }
                        }))).catch((error) => {
                            throw error;
                        }));
                    await new Promise((resolve, reject) => {
                        socket.send(JSON.stringify({
                            action: 'subscribe',
                            params: channels.join(','),
                        }), (error) => {
                            if (error) {
                                reject(error.message);
                            }
                            else {
                                resolve();
                            }
                        });
                    }).catch((error) => {
                        throw error;
                    });
                }
                catch (error) {
                    throw error instanceof Error ? error : new Error(error);
                }
                finally {
                    release();
                }
            },
            on: async (name, callback) => {
                this.callbacks.set({
                    error: 'error',
                    message: 'message',
                    status: 'status',
                    trade: 'T',
                    quote: 'Q',
                }[name], callback);
            },
        };
    }
    async authenticated() {
        return await this.market_status()
            .then((response) => {
            if ('status' in response) {
                if (response['status'] == 'ERROR') {
                    return false;
                }
            }
            return true;
        })
            .catch(() => false);
    }
    async market_status() {
        return await got_1.default(`https://api.polygon.io/v1/marketstatus/now?apiKey=${this.parameters.key}`).then((response) => JSON.parse(response.body));
    }
    endpoint(path, params) {
        params = params == undefined ? {} : params;
        params['apiKey'] = this.parameters.key;
        return `https://api.polygon.io/v2/${path}/?${Object.entries(params)
            .map(([key, value]) => key + '=' + value)
            .join('&')}`;
    }
}
exports.Client = Client;
