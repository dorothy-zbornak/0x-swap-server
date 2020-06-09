'use strict'
const { getContractAddressesForChainOrThrow } = require('@0x/contract-addresses');

// Override addresses here.
module.exports = {
    addresses: {
        ...getContractAddressesForChainOrThrow(1),
    },
};
