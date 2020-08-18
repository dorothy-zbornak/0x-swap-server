'use strict'
const _ = require('lodash');
const { getContractAddressesForChainOrThrow } = require('@0x/contract-addresses');

// Override addresses here.
module.exports = {
    addresses: _.merge(
        getContractAddressesForChainOrThrow(1),
        {},
    ),
};
