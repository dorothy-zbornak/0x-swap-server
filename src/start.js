'use strict'
require('colors');
const Web3 = require('web3');
const { SwapQuoter, MarketOperation, OrderPrunerPermittedFeeTypes } = require('@0x/asset-swapper');
const BigNumber = require('bignumber.js');
const process = require('process');
const yargs = require('yargs');
const _ = require('lodash');
const fs = require('fs');

const { getChainConfig } = require('./chain-configs');
const { Server } = require('./server');
const {
    DEFAULT_MARKET_OPTS_BY_CHAIN_ID,
    EMPTY_SECRETS,
    GAS_STATION_URL,
    SRA_API_URL,
    NULL_ADDRESS,
} = require('./constants');
const { NODE_RPC } = process.env;

const ARGV = yargs
    .option('port', { alias: 'p', type: 'number', default: 7001 })
    .option('runLimit', { alias: 'r', type: 'number', default: 2 ** 8 })
    .option('samples', { alias: 's', type: 'number', default: 13 })
    .option('dist', { alias: 'd', type: 'number', default: 1.05 })
    .option('secrets', { alias: 'S', type: 'string' })
    .option('prefix', { alias: 'P', type: 'string', default: 'dev' })
    .argv;

const SECRETS = {
    ...EMPTY_SECRETS,
    ...(ARGV.secrets ? JSON.parse(fs.readFileSync(ARGV.secrets)) : {}),
};

(async() => {
    const chainId = await getChainId();
    const server = new Server(getChainConfig(chainId));
    server.addQuoteEndpoint(`/swap/${ARGV.prefix}/quote`, createQuoter(chainId), { v0: ARGV.v0 });
    await server.listen(ARGV.port);
    console.log(`${'*'.bold} Listening on port ${ARGV.port.toString().bold.green}, network id ${chainId.toString().bold.yellow}...`);
})();

async function getChainId() {
    const w3 = new Web3(createWeb3Provider());
    return parseInt(await w3.eth.net.getId());
}

function createOrderbook(sraApiUrl) {
    // TODO: enable orderbook for OO orders.
    return {
        getOrdersAsync() { return []; },
        getBatchOrdersAsync() { return []; },
        destroyAsync() {},
    };
}

function createWeb3Provider() {
    if (/^ws:\/\//.test(NODE_RPC)) {
        return new Web3.providers.WebsocketProvider(NODE_RPC);
    }
    return new Web3.providers.HttpProvider(NODE_RPC);
}

function createZeroExProvider(NODE_RPC) {
    const w3p = createWeb3Provider(NODE_RPC);
    return {
        sendAsync: (payload, callback) => w3p.send(payload, (err, r) => callback(err || null, r)),
    };
}

function createQuoter(chainId) {
    const chainConfig = getChainConfig(chainId);
    const quoterOpts = {
        chainId: chainConfig.chainId,
        liquidityProviderRegistry: SECRETS.liquidityProviderRegistryByChainId[chainId] || {},
        expiryBufferMs: 60 * 1000,
        ethGasStationUrl: GAS_STATION_URL,
        rfqt: {
            takerApiKeyWhitelist: SECRETS.rfqt.validApiKeys ? SECRETS.rfqt.validApiKeys : [],
            makerAssetOfferings: SECRETS.rfqt.offeringsByChainId[ARGV.chainId] || {},
            infoLogger: () => {},
        },
        tokenAdjacencyGraph: {
            default: chainConfig.intermediateTokens.map(t => chainConfig.tokens[t].address),
        },
        permittedOrderFeeTypes: new Set([OrderPrunerPermittedFeeTypes.NoFees]),
    };

    const swapQuoter = new SwapQuoter(
        createZeroExProvider(process.env.NODE_RPC),
        createOrderbook(),
        quoterOpts,
    );
    return async (opts) => {
        console.log(`dev: ${JSON.stringify(opts)}`);
        const marketOpts = _.merge(
            {},
            chainConfig.marketOpts,
            {
                runLimit: ARGV.runLimit,
                samples: ARGV.samples,
                sampleDistributionBase: ARGV.dist,
            },
            opts,
            {
                ...(opts.takerAddress && opts.apiKey
                    ? {
                        rfqt : {
                            apiKey: opts.apiKey,
                            takerAddress: NULL_ADDRESS,
                            txOrigin: opts.takerAddress,
                            intentOnFilling: true,
                        }
                    } : {}),
            },
        );
        process.env.SAMPLE_BLOCK = opts.block;
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
