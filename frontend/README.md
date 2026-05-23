# Frontend

This is a dependency-free static frontend for the Soroban Genomics Repository contract.

Open `frontend/index.html` in a browser. The app uses a local-storage demo provider that mirrors the contract methods in `contracts/notes/src/lib.rs`:

- `publish_dataset`
- `update_dataset`
- `list_datasets`
- `grant_access`
- `purchase_access`
- `revoke_access`
- `has_access`

The integration boundary is the `provider` object in `frontend/app.js`. Replace that provider with a generated Soroban JavaScript client once a contract ID, RPC URL, and network passphrase are available.
