#!/bin/sh 
':' //# comment; exec /usr/bin/env node --experimental-top-level-await --no-warnings --experimental-json-modules --experimental-import-meta-resolve "$0" "$@"
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = __importDefault(require("lodash"));
const package_json_1 = __importDefault(require("../package.json"));
const got_1 = __importDefault(require("got"));
const yargs_1 = __importDefault(require("yargs"));
const chalk_1 = __importDefault(require("chalk"));
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const parse_duration_1 = __importDefault(require("parse-duration"));
// @ts-ignore
const draftlog_1 = __importDefault(require("draftlog"));
const ws_1 = __importDefault(require("ws"));
const DraftLog = draftlog_1.default.into(console);
var Alert;
(function (Alert) {
    Alert[Alert["GAP_UP"] = 0] = "GAP_UP";
    Alert[Alert["GAP_DOWN"] = 1] = "GAP_DOWN";
})(Alert || (Alert = {}));
yargs_1.default(process.argv.slice(2)).command('$0', '...', (argv) => argv
    .version(package_json_1.default.version)
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
}), async (argv) => {
    let tickers = new Array(), 
    // todo: change
    pages = 200, 
    // @ts-ignore
    line = console.draft('please wait');
    await Promise.allSettled([...Array(pages + 1).keys()].slice(1).map((_, page) => got_1.default(`https://api.polygon.io/v2/reference/tickers?sort=ticker&perpage=50&active=true&page=${page}&apiKey=${argv['polygon-key']}`).then((response) => {
        tickers.push(...JSON.parse(response.body)['tickers']),
            line(`got ${tickers.length} tickers`);
    })));
    // filter out shit-ass tickers
    let symbols = tickers
        .map((ticker) => ticker.ticker)
        .filter((symbol) => symbol.length < 5 && !symbol.includes('.') && !symbol.includes('-'));
    console.log(`using ${symbols.length} symbols`);
    console.log('connecting to websocket');
    const websocket = new ws_1.default('wss://socket.polygon.io/stocks');
    console.log('done');
    websocket.on('open', () => websocket.send(JSON.stringify({ action: 'auth', params: argv['polygon-key'] }), (error) => {
        if (error) {
            throw error;
        }
        else {
            console.log('auth pending');
        }
    }));
    const trades = new Map(), gapDurationInMs = parse_duration_1.default(argv['gap-duration'], 'ms') ?? 60e3;
    websocket.on('message', (data) => {
        let message = JSON.parse(data.toString())[0];
        switch (message.ev) {
            case 'status':
                switch (message.status) {
                    case 'auth_success':
                        console.log('success');
                        let total = 0, 
                        // @ts-ignore
                        line = console.draft();
                        lodash_1.default.chunk(symbols, 300).forEach((chunk) => websocket.send(JSON.stringify({
                            action: 'subscribe',
                            params: chunk.map((symbol) => `T.${symbol}`).join(','),
                        }), (error) => {
                            if (error) {
                                throw error;
                            }
                            else {
                                total += chunk.length;
                                line(`subscribed to ${total} channels`);
                            }
                        }));
                        break;
                }
                break;
            case 'T':
                // new trade
                let next = message, 
                // get
                last = trades.get(next.sym) ?? next;
                // set
                trades.set(next.sym, next);
                // percent change since last trade
                let change = (next.p - last.p) / last.p;
                if (
                // check fits gap duration
                Math.abs(next.t - last.t) <= gapDurationInMs &&
                    // check fits gap percent
                    Math.abs(change) > argv['gap-percent']) {
                    console.log(moment_timezone_1.default().format('MM-DD-YY HH:mm:ss').padEnd(22), (change > 0 ? chalk_1.default.green : chalk_1.default.red)(`gap_${change > 0 ? 'up' : 'down'}`).padEnd(10), `${(change * 100).toFixed(2)}%`.padEnd(8), next.sym.padEnd(8), `$${chalk_1.default.gray(next.p.toLocaleString())}`);
                }
                break;
        }
    });
}).argv;
