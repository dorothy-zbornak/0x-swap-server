'use strict'
const { ERC20BridgeSource, SwapQuoteConsumer } = require('@0x/asset-swapper');
const { getContractAddressesForChainOrThrow } = require('@0x/contract-addresses');
const BigNumber = require('bignumber.js');
const express = require('express');
const TOKENS = require('./tokens');

class Server {
    constructor(provider, addresses) {
        this._quoteConsumer = new SwapQuoteConsumer(
            provider,
            {
                chainId: 1,
                contractAddresses: addresses || getContractAddressesForChainOrThrow(1),
            },
        );
        this._app = express();
        this._app.use(express.json());
    }

    addQuoteEndpoint(endpoint, quoter, opts = {}) {
        this._app.get(
            endpoint,
            async (req, res) => {
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
                                useExtensionContract: req.query.sellToken === 'ETH'
                                    ? 'FORWARDER' : 'NONE',
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
                        value: adjustQuoteEthValue(quote, ethAmount),
                        data: callData,
                        gas: quote.worstCaseQuoteInfo.gas || 0,
                        gasPrice: quote.gasPrice,
                        orders: cleanSignedOrderFields(quote.orders),
                        sources: createSourceBreakdown(quote),
                        buyAmount: quote.bestCaseQuoteInfo.makerAssetAmount,
                        sellAmount: quote.bestCaseQuoteInfo.totalTakerAssetAmount,
                        protocolFee: getquoteProtocolFee(quote, opts.v0),
                        buyTokenAddress: quoterOpts.buyTokenAddress,
                        sellTokenAddress: quoterOpts.sellTokenAddress,
                        maxSellAmount: quote.worstCaseQuoteInfo.totalTakerAssetAmount,
                    });
                } catch (err) {
                    console.error(err);
                    res.status(500);
                    res.json({ 'error': err.toString(), stack: JSON.stringify(err.stack) });
                }
            },
        );
    }

    async listen(port) {
        return new Promise((accept, reject) => {
            this._app.listen(
                port,
                (err) => {
                    if (err) {
                        return reject(err);
                    }
                    accept();
                },
            );
        });
    }
}

function adjustQuoteEthValue(quote, ethAmount) {
    const FEE_PER_ORDER = quote.gasPrice.times(70e3);
    const payment = ethAmount.minus(FEE_PER_ORDER.times(quote.orders.length));
    return FEE_PER_ORDER.times(
        quote.orders.filter(o => o.fills[0].source === ERC20BridgeSource.Native).length,
    ).plus(payment);
}

function getquoteProtocolFee(quote, v0 = false) {
    if (v0) {
        return quote.worstCaseQuoteInfo.protocolFeeInWeiAmount;
    }
    const feePerOrder = quote.worstCaseQuoteInfo.protocolFeeInWeiAmount.div(quote.orders.length);
    // Only native orders have protocol fees.
    const nativeOrders = quote.orders.filter(o => o.fills[0].source === ERC20BridgeSource.Native);
    return feePerOrder.times(nativeOrders.length);
}

function createQuoterOpts(query) {
    let { buyToken, sellToken, buyAmount, sellAmount } = query;
    if (!buyAmount && !sellAmount) {
        throw new Error('No buy or sell a mount specified');
    }
    return {
        buyToken: getTokenSymbol(buyToken),
        sellToken: getTokenSymbol(sellToken),
        buyTokenAddress: getToken(buyToken).address,
        sellTokenAddress: getToken(sellToken).address,
        buyAmount: buyAmount !== undefined ? new BigNumber(buyAmount) : undefined,
        sellAmount: sellAmount !== undefined ? new BigNumber(sellAmount) : undefined,
        bridgeSlippage: query.bridgeSlippage !== undefined ? parseFloat(query.bridgeSlippage) : undefined,
        maxFallbackSlippage: query.maxFallbackSlippage !== undefined ? parseFloat(query.maxFallbackSlippage) : undefined,
        gasPrice: query.gasPrice !== undefined ? new BigNumber(query.gasPrice) : undefined,
        numSamples: query.numSamples !== undefined ? parseInt(query.numSamples) : undefined,
        runLimit: query.runLimit !== undefined ? parseInt(query.runLimit) : undefined,
        excludedSources: (query.excludedSources || '').split(',').filter(s => s).map(s => s === '0x' ? 'Native' : s),
        includedSources: (query.includedSources || '').split(',').filter(s => s).map(s => s === '0x' ? 'Native' : s),
        takerAddress: query.takerAddress,
    };
}

function getToken(symbolOrAddress) {
    if (symbolOrAddress.startsWith('0x')) {
        return Object.values(TOKENS).filter(t => t.address.toLowerCase() === symbolOrAddress.toLowerCase())[0];
    }
    return TOKENS[symbolOrAddress];
}

function getTokenSymbol(symbolOrAddress) {
    if (symbolOrAddress.startsWith('0x')) {
        return Object.keys(TOKENS).filter((s) => TOKENS[s].address.toLowerCase() === symbolOrAddress.toLowerCase())[0];
    }
    return symbolOrAddress;
}

function getPrice(side, buyToken, sellToken, quoteInfo) {
    const buyDecimals = getToken(buyToken).decimals;
    const sellDecimals = getToken(sellToken).decimals;
    const price = quoteInfo.makerAssetAmount.div(`1e${buyDecimals}`)
        .div(quoteInfo.totalTakerAssetAmount.div(`1e${sellDecimals}`));
    return side === 'sell' ? price : price.pow(-1);
}

function createSourceBreakdown(quote) {
    const breakdown = Object.entries(quote.sourceBreakdown).reduce(
        (acc, [source, percentage]) => {
            return [
                ...acc,
                {
                    name: source === 'Native' ? '0x' : source,
                    proportion: source !== 'MultiHop'
                        ? new BigNumber(percentage.toPrecision(2))
                        : new BigNumber(percentage.proportion.toPrecision(2)),
                },
            ];
        },
        [],
    );
    for (const s of breakdown) {
        if (s.name === 'Uniswap_V2' || s.name === 'SushiSwap') {
            for (const o of quote.orders) {
                if (o.fills[0].source === s.name) {
                    const { tokenAddressPath } = o.fills[0].fillData;
                    s.tokenAddressPath = tokenAddressPath;
                    break;
                }
            }
        }
        break;
    }
    return breakdown;
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
