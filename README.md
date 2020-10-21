# 0x-swap-server
Run a minimal swap/quote endpoint for A-B testing different versions of asset-swapper.

## Setup
If you're actively developing on asset-swapper, you will need to `yarn link` it from the repo into this project.
Depending on the scope of your development, you may have to link other packages.
```bash
$ cd $PROTOCOL_REPO_ROOT/packages/asset-swapper && yarn link
$ cd $SWAP_SERVER_ROOT && yarn link '@0x/asset-swapper'
```

You can also edit `src/start.js` to configure the swap-server (it might not always reflect the config on production).

## Running
```bash
NODE_RPC=YOUR_NODE_RPC yarn start [--pool LP_POOL_REGISTRY_ADDRESS] [-R RFQT_CONFIG_FILE]
```

### Options

| option | description |
|--------|-------------|
| `--v0` | Run in v0 (non-Exchange Proxy) mode |
| `--pool` | The address of the liqudity provider registry contract |
