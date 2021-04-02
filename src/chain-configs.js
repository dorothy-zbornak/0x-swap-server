'use strict'
const { getContractAddressesForChainOrThrow } = require('@0x/contract-addresses');

module.exports = {
    '1': {
        addresses: getContractAddressesForChainOrThrow(1),
        gasTokenSymbol: 'ETH',
        wrappedGasTokenSymbol: 'WETH',
        tokens: require('./tokens-by-chain')['1'],
        intermediateTokens: ['WETH','DAI','USDC','USDT','WBTC'],
    },
    '56': {
        addresses: getContractAddressesForChainOrThrow(56),
        gasTokenSymbol: 'BNB',
        wrappedGasTokenSymbol: 'WBNB',
        tokens: require('./tokens-by-chain')['56'],
        intermediateTokens: ['WBNB','DAI','USDC','USDT','BTC'],
    }
}
