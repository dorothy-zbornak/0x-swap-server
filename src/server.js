'use strict';
const { SwapQuoteConsumer } = require('@0x/asset-swapper');
const { getContractAddressesForChainOrThrow } = require('@0x/contract-addresses');
const BigNumber = require('bignumber.js');
const express = require('express');
const TOKENS = require('./tokens');

class Server {
    constructor(provider, addresses) {
        this._quoteConsumer = new SwapQuoteConsumer(provider, {
            chainId: 1,
            contractAddresses: addresses || getContractAddressesForChainOrThrow(1),
        });
        this._app = express();
        this._app.use(express.json());
    }

    addQuoteEndpoint(endpoint, quoter, opts = {}) {
        this._app.get(endpoint, async (req, res) => {
            const quoterOpts = createQuoterOpts(req.query);
            try {
                const quote = await quoter(quoterOpts);
                const {
                    calldataHexString: callData,
                    toAddress,
                    ethAmount,
                    allowanceTarget,
                } = await this._quoteConsumer.getCalldataOrThrowAsync(
                    quote,
                    !opts.v0
                        ? {
                              useExtensionContract: 'EXCHANGE_PROXY',
                              extensionContractOpts: {
                                  isFromETH: req.query.sellToken === 'ETH',
                                  isToETH: req.query.buyToken === 'ETH',
                              },
                          }
                        : {
                              useExtensionContract: req.query.sellToken === 'ETH' ? 'FORWARDER' : 'NONE',
                          },
                );
                res.json({
                    allowanceTarget,
                    price: getPrice(
                        quoterOpts.buyAmount ? 'buy' : 'sell',
                        quoterOpts.buyToken,
                        quoterOpts.sellToken,
                        quote.bestCaseQuoteInfo,
                    ),
                    to: toAddress,
                    value: ethAmount,
                    data: callData,
                    gas: quote.worstCaseQuoteInfo.gas || 0,
                    gasPrice: quote.gasPrice,
                    orders: cleanSignedOrderFields(quote.orders),
                    sources: convertSourceBreakdownToArray(quote.sourceBreakdown),
                    buyAmount: quote.bestCaseQuoteInfo.makerAssetAmount,
                    sellAmount: quote.bestCaseQuoteInfo.totalTakerAssetAmount,
                    protocolFee: quote.worstCaseQuoteInfo.protocolFeeInWeiAmount,
                    buyTokenAddress: quoterOpts.buyTokenAddress,
                    sellTokenAddress: quoterOpts.sellTokenAddress,
                    maxSellAmount: quoterOpts.buyAmount
                        ? quote.worstCaseQuoteInfo.totalTakerAssetAmount
                        : quote.bestCaseQuoteInfo.totalTakerAssetAmount,
                });
            } catch (err) {
                console.error(err);
                res.status(500);
                res.json({ error: err.toString(), stack: JSON.stringify(err.stack) });
            }
        });
    }

    async listen(port) {
        return new Promise((accept, reject) => {
            this._app.listen(port, err => {
                if (err) {
                    return reject(err);
                }
                accept();
            });
        });
    }
}

function createQuoterOpts(query) {
    let {
        buyToken,
        sellToken,
        buyAmount,
        sellAmount,
        blockNumber,
        sampleDistributionAlpha,
        sampleDistributionBeta,
    } = query;
    if (!buyAmount && !sellAmount) {
        throw new Error('No buy or sell a mount specified');
    }
    return {
        buyToken,
        sellToken,
        blockNumber: parseInt(blockNumber),
        sampleDistributionParameters: {
            alpha: parseFloat(sampleDistributionAlpha),
            beta: parseFloat(sampleDistributionBeta),
        },
        buyTokenAddress: TOKENS[buyToken].address,
        sellTokenAddress: TOKENS[sellToken].address,
        buyAmount: buyAmount !== undefined ? new BigNumber(buyAmount) : undefined,
        sellAmount: sellAmount !== undefined ? new BigNumber(sellAmount) : undefined,
        bridgeSlippage: query.bridgeSlippage !== undefined ? parseFloat(query.bridgeSlippage) : undefined,
        maxFallbackSlippage:
            query.maxFallbackSlippage !== undefined ? parseFloat(query.maxFallbackSlippage) : undefined,
        gasPrice: query.gasPrice !== undefined ? new BigNumber(query.gasPrice) : undefined,
        numSamples: 50,
        runLimit: query.runLimit !== undefined ? parseInt(query.runLimit) : undefined,
        excludedSources: (query.excludedSources || '').split(',').map(s => (s === '0x' ? 'Native' : s)),
    };
}

function getPrice(side, buyToken, sellToken, quoteInfo) {
    const buyDecimals = TOKENS[buyToken].decimals;
    const sellDecimals = TOKENS[sellToken].decimals;
    const price = quoteInfo.makerAssetAmount
        .div(10 ** buyDecimals)
        .div(quoteInfo.totalTakerAssetAmount.div(10 ** sellDecimals));
    return side === 'sell' ? price : price.pow(-1);
}

function convertSourceBreakdownToArray(sourceBreakdown) {
    return Object.entries(sourceBreakdown).reduce((acc, [source, breakdown]) => {
        let obj;
        if (source === 'MultiHop') {
            const intermediateToken = Object.keys(TOKENS).find(
                key => TOKENS[key].address.toLowerCase() === breakdown.intermediateToken.toLowerCase(),
            );
            obj = {
                name: `MultiHop (${breakdown.hops}) via ${intermediateToken || breakdown.intermediateToken}`,
                proportion: new BigNumber(breakdown.proportion).toPrecision(6),
            };
        } else {
            obj = {
                name: source,
                proportion: new BigNumber(breakdown).toPrecision(6),
            };
        }
        return [...acc, obj];
    }, []);
}

function cleanSignedOrderFields(orders) {
    return orders.map(o => ({
        chainId: o.chainId,
        exchangeAddress: o.exchangeAddress,
        makerAddress: o.makerAddress,
        takerAddress: o.takerAddress,
        feeRecipientAddress: o.feeRecipientAddress,
        senderAddress: o.senderAddress,
        makerAssetAmount: o.makerAssetAmount,
        takerAssetAmount: o.takerAssetAmount,
        makerFee: o.makerFee,
        takerFee: o.takerFee,
        expirationTimeSeconds: o.expirationTimeSeconds,
        salt: o.salt,
        makerAssetData: o.makerAssetData,
        takerAssetData: o.takerAssetData,
        makerFeeAssetData: o.makerFeeAssetData,
        takerFeeAssetData: o.takerFeeAssetData,
        signature: o.signature,
    }));
}

module.exports = {
    Server,
};
