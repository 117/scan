#!/bin/sh 
':' //# comment; exec /usr/bin/env node --experimental-top-level-await --no-warnings --experimental-json-modules --experimental-import-meta-resolve "$0" "$@"
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const package_json_1 = __importDefault(require("../package.json"));
const math_js_1 = __importDefault(require("./math.js"));
const yargs_1 = __importDefault(require("yargs"));
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const client_js_1 = require("./polygon/client.js");
const alpaca_1 = require("@master-chief/alpaca");
yargs_1.default(process.argv.slice(2)).command('$0', '...', (argv) => argv
    .version(package_json_1.default.version)
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
}), async (argv) => {
    // build the alpaca client
    const alpaca = new alpaca_1.AlpacaClient({
        credentials: {
            key: argv['alpaca-key'],
            secret: argv['alpaca-secret'],
        },
        rate_limit: true,
    });
    // check if alpaca is authenticated
    if (!(await alpaca.isAuthenticated())) {
        throw new Error('not authenticated with alpaca');
    }
    // build the polygon client
    const polygon = new client_js_1.Client({ key: argv['polygon-key'] });
    // check if polygon is authenticated
    if (!(await polygon.authenticated())) {
        throw new Error('not authenticated with polygon');
    }
    // fetch assets for the day
    let assets = (await alpaca.getAssets({ status: 'active' })).filter((asset) => 
    // do we care about tradeable stocks
    asset.tradable == true &&
        // do we care about anything more than n chars
        asset.symbol.length <= 4 &&
        // do we care about different classes of shares
        asset.symbol.match(/^[A-Z]+$/));
    console.log(`got ${assets.length.toLocaleString()} assets`);
    // subscribe to the channels
    await polygon.websocket
        .subscribe(assets.map((asset) => `T.${asset.symbol}`))
        .then(() => console.log(`subscribed to channels`))
        .catch((error) => console.log(error));
    // create trade cache
    const cache = new Map();
    // listen for events
    polygon.websocket.on('trade', (event) => {
        // get and filter the trades
        let trades = (cache.get(event.sym) ?? [])
            .concat(event)
            .filter((trade) => Date.now() - trade.t <= 60000), change = math_js_1.default.change({
            from: trades[0].p,
            to: trades[trades.length - 1].p,
        });
        // does change exceed threshold
        if (change >= argv.change) {
            let volume = trades.map((trade) => trade.s).reduce((a, b) => a + b);
            // does volume exceed threshold
            if (volume >= argv.volume) {
                // print alert
                console.log(`${moment_timezone_1.default().format('MM-DD-YYYY HH:mm:ss')}\t ${event.sym} ${event.p.toFixed(2)} ${tiny(volume, 0)} gap_up`);
                // wipe the trades
                trades = [].concat(event);
            }
        }
        cache.set(event.sym, trades);
    });
}).argv;
function tiny(value, places) {
    let level = 0;
    while (value >= 1000) {
        ;
        (value /= 1000), level++;
    }
    return value.toFixed(places).concat(['', 'K', 'M', 'B', 'T'][level] ?? 'ERR');
}
