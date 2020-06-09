# 0x-swap-server
Run a minimal swap/quote endpoint for A-B testing different versions of asset-swapper.

## Setup
You need to `yarn link` `asset-swapper` from your monorepo folder into this project.
```bash
$ cd $YOUR_MONOREPO_ROOT/packages/asset-swapper
$ yarn link
$ cd $SWAP_SERVER_ROOT
$ yarn link '@0x/asset-swapper'
```

\* *You might also need to do the same for `@0x/utils`.*

You can also edit `src/start.js` to configure the swap-server (it might not always reflect the config on production).

## Running
```bash
NODE_RPC=YOUR_NODE_HTTP_RPC yarn start [--v0] [--pool LP_POOL_REGISTRY_ADDRESS]
```

### Options

| option | description |
|--------|-------------|
| `--v0` | Run in v0 (non-Exchange Proxy) mode |
| `--pool` | The address of the liqudity provider registry contract |
