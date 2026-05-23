# Soroban Genomics Repository

## App Description

Soroban Genomics Repository is a Web3 marketplace and repository for genomic dataset metadata on Stellar Soroban.

The app lets dataset owners publish discoverable genomic dataset listings, manage access rights, and record marketplace-style access purchases on-chain. Raw genomic files are intended to stay off-chain in encrypted or controlled storage, while the smart contract stores dataset metadata, content hashes, storage URIs, pricing, ownership, and access receipts.

## Features

- `publish_dataset()` - Publish a genomic dataset listing with owner authorization
- `get_dataset()` - Retrieve one dataset record by dataset ID
- `list_datasets()` - Retrieve all published dataset records
- `update_dataset()` - Update dataset metadata, price, content hash, URI, and active status
- `grant_access()` - Grant dataset access to a researcher wallet address
- `purchase_access()` - Record a marketplace-style dataset access purchase
- `revoke_access()` - Revoke dataset access from a researcher wallet address
- `has_access()` - Check whether a wallet address has access to a dataset
- `get_access_grant()` - Retrieve the access grant record for a dataset and wallet address

## ID Smartcontract Smartnet

