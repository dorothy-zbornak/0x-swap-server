'use strict'
require('colors');
const Web3 = require('web3');
const { SwapQuoter, MarketOperation, OrderPrunerPermittedFeeTypes } = require('@0x/asset-swapper');
const { Orderbook } = require('@0x/orderbook');
const BigNumber = require('bignumber.js');
const process = require('process');
const yargs = require('yargs');
const _ = require('lodash');
const fs = require('fs');

const TOKENS = require('./tokens');
const { Server } = require('./server');
const { addresses } = require('./addresses');
const {
    DEFAULT_MARKET_OPTS,
    GAS_STATION_URL,
    INTERMEDIATE_TOKENS,
    SRA_API_URL,
} = require('./constants');

const ARGV = yargs
    .option('port', { alias: 'p', type: 'number', default: 7001 })
    .option('pool', { alias: 'l', type: 'string' })
    .option('runLimit', { alias: 'r', type: 'number', default: 2 ** 8 })
    .option('samples', { alias: 's', type: 'number', default: 13 })
    .option('dist', { alias: 'd', type: 'number', default: 1.05 })
    .option('rfqt-config', { alias: 'R', type: 'string' })
    .argv;

const RFQT_OPTS = ARGV.rfqtConfig ? JSON.parse(fs.readFileSync(ARGV.rfqtConfig)) : {};
const SWAP_QUOTER_OPTS = {
    chainId: 1,
    liquidityProviderRegistryAddress: ARGV.pool,
    expiryBufferMs: 60 * 1000,
    // contractAddresses: addresses,
    ethGasStationUrl: GAS_STATION_URL,
    rfqt: {
        takerApiKeyWhitelist: RFQT_OPTS.apiKey ? [RFQT_OPTS.apiKey] : [],
        makerAssetOfferings: RFQT_OPTS.offerings || [],
        infoLogger: () => {},
    },
    tokenAdjacencyGraph: {
        default: INTERMEDIATE_TOKENS.map(t => TOKENS[t].address),
    },
    permittedOrderFEeTypes: new Set([OrderPrunerPermittedFeeTypes.NoFees]),
};

(async() => {
    const provider = createZeroExProvider(process.env.NODE_RPC);
    const orderbook = createOrderbook(SRA_API_URL);
    const server = new Server(provider, addresses);
    server.addQuoteEndpoint('/swap/dev/quote', createQuoter(provider, orderbook), { v0: ARGV.v0 });
    await server.listen(ARGV.port);
    console.log(`${'*'.bold} Listening on port ${ARGV.port.toString().bold.green}...`);
})();

function createOrderbook(sraApiUrl) {
    return Orderbook.getOrderbookForPollingProvider({
        httpEndpoint: sraApiUrl,
        pollingIntervalMs: 10000,
        perPage: 1000,
    });
}

function createZeroExProvider(rpcHost) {
    let provider;
    if (/^ws:\/\//.test(rpcHost)) {
        provider = new Web3.providers.WebsocketProvider(rpcHost);
    } else if (/^https?:\/\//.test(rpcHost)) {
        provider = new Web3.providers.HttpProvider(rpcHost);
    }
    return {
        sendAsync: (payload, callback) => provider.send(payload, (err, r) => callback(err || null, r)),
    };
}

function createQuoter(provider, orderbook) {
    const swapQuoter = new SwapQuoter(
        provider,
        orderbook,
        SWAP_QUOTER_OPTS,
    );
    return async (opts) => {
        console.log(`dev: ${JSON.stringify(opts)}`);
        const marketOpts = _.merge(
            {},
            DEFAULT_MARKET_OPTS,
            {
                runLimit: ARGV.runLimit,
                samples: ARGV.samples,
                sampleDistributionBase: ARGV.dist,
            },
            opts,
            {
                rfqt: {
                    apiKey: RFQT_OPTS.apiKey,
                    takerAddress: addresses.exchangeProxyFlashWallet,
                    intentOnFilling: !!opts.takerAddress,
                },
            },
        );
        if (opts.buyAmount) {
            return swapQuoter.getSwapQuoteAsync(
                opts.buyTokenAddress,
                opts.sellTokenAddress,
                opts.buyAmount,
                MarketOperation.Buy,
                marketOpts,
            );
        }
        return swapQuoter.getSwapQuoteAsync(
            opts.buyTokenAddress,
            opts.sellTokenAddress,
            opts.sellAmount,
            MarketOperation.Sell,
            marketOpts,
        );
    };
}
