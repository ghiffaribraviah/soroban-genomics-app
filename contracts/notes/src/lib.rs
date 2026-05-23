#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, String, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Dataset {
    pub id: u64,
    pub owner: Address,
    pub title: String,
    pub description: String,
    pub data_type: String,
    pub metadata_uri: String,
    pub content_hash: String,
    pub price: i128,
    pub active: bool,
    pub created_ledger: u32,
    pub updated_ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccessGrant {
    pub dataset_id: u64,
    pub grantee: Address,
    pub granted_by: Address,
    pub paid_amount: i128,
    pub granted_ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DatasetInput {
    pub title: String,
    pub description: String,
    pub data_type: String,
    pub metadata_uri: String,
    pub content_hash: String,
    pub price: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    NextDatasetId,
    DatasetIds,
    Dataset(u64),
    Access(u64, Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum GenomicsError {
    DatasetNotFound = 1,
    NotDatasetOwner = 2,
    DatasetInactive = 3,
    InvalidPrice = 4,
    InsufficientPayment = 5,
}

const DEFAULT_NEXT_ID: u64 = 1;
#[contractevent(topics = ["dataset", "publish"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DatasetPublished {
    #[topic]
    pub dataset_id: u64,
    #[topic]
    pub owner: Address,
}

#[contractevent(topics = ["dataset", "update"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DatasetUpdated {
    #[topic]
    pub dataset_id: u64,
    #[topic]
    pub owner: Address,
    pub active: bool,
    pub price: i128,
}

#[contractevent(topics = ["access", "grant"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccessGranted {
    #[topic]
    pub dataset_id: u64,
    #[topic]
    pub grantee: Address,
    pub granted_by: Address,
    pub paid_amount: i128,
}

#[contractevent(topics = ["access", "revoke"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccessRevoked {
    #[topic]
    pub dataset_id: u64,
    #[topic]
    pub grantee: Address,
    pub revoked_by: Address,
}

#[contract]
pub struct GenomicsRepositoryContract;

#[contractimpl]
impl GenomicsRepositoryContract {
    pub fn publish_dataset(
        env: Env,
        owner: Address,
        input: DatasetInput,
    ) -> Result<u64, GenomicsError> {
        owner.require_auth();
        validate_price(input.price)?;

        let id = next_dataset_id(&env);
        let ledger = env.ledger().sequence();
        let dataset = Dataset {
            id,
            owner: owner.clone(),
            title: input.title,
            description: input.description,
            data_type: input.data_type,
            metadata_uri: input.metadata_uri,
            content_hash: input.content_hash,
            price: input.price,
            active: true,
            created_ledger: ledger,
            updated_ledger: ledger,
        };

        env.storage()
            .instance()
            .set(&DataKey::Dataset(id), &dataset);
        push_dataset_id(&env, id);
        DatasetPublished {
            dataset_id: id,
            owner,
        }
        .publish(&env);

        Ok(id)
    }

    pub fn get_dataset(env: Env, dataset_id: u64) -> Result<Dataset, GenomicsError> {
        read_dataset(&env, dataset_id)
    }

    pub fn list_datasets(env: Env) -> Vec<Dataset> {
        let ids = dataset_ids(&env);
        let mut datasets = Vec::new(&env);

        for id in ids {
            if let Some(dataset) = env.storage().instance().get(&DataKey::Dataset(id)) {
                datasets.push_back(dataset);
            }
        }

        datasets
    }

    pub fn update_dataset(
        env: Env,
        owner: Address,
        dataset_id: u64,
        input: DatasetInput,
        active: bool,
    ) -> Result<(), GenomicsError> {
        owner.require_auth();
        validate_price(input.price)?;

        let mut dataset = read_dataset(&env, dataset_id)?;
        ensure_owner(&dataset, &owner)?;

        dataset.title = input.title;
        dataset.description = input.description;
        dataset.data_type = input.data_type;
        dataset.metadata_uri = input.metadata_uri;
        dataset.content_hash = input.content_hash;
        dataset.price = input.price;
        dataset.active = active;
        dataset.updated_ledger = env.ledger().sequence();

        env.storage()
            .instance()
            .set(&DataKey::Dataset(dataset_id), &dataset);
        DatasetUpdated {
            dataset_id,
            owner,
            active,
            price: input.price,
        }
        .publish(&env);

        Ok(())
    }

    pub fn grant_access(
        env: Env,
        owner: Address,
        dataset_id: u64,
        grantee: Address,
    ) -> Result<AccessGrant, GenomicsError> {
        owner.require_auth();
        let dataset = read_dataset(&env, dataset_id)?;
        ensure_owner(&dataset, &owner)?;

        let grant = write_access_grant(&env, dataset_id, grantee, owner, 0);
        AccessGranted {
            dataset_id,
            grantee: grant.grantee.clone(),
            granted_by: grant.granted_by.clone(),
            paid_amount: grant.paid_amount,
        }
        .publish(&env);

        Ok(grant)
    }

    pub fn purchase_access(
        env: Env,
        buyer: Address,
        dataset_id: u64,
        paid_amount: i128,
    ) -> Result<AccessGrant, GenomicsError> {
        buyer.require_auth();
        let dataset = read_dataset(&env, dataset_id)?;

        if !dataset.active {
            return Err(GenomicsError::DatasetInactive);
        }

        if paid_amount < dataset.price {
            return Err(GenomicsError::InsufficientPayment);
        }

        let grant = write_access_grant(
            &env,
            dataset_id,
            buyer.clone(),
            dataset.owner.clone(),
            paid_amount,
        );
        AccessGranted {
            dataset_id,
            grantee: buyer,
            granted_by: grant.granted_by.clone(),
            paid_amount: grant.paid_amount,
        }
        .publish(&env);

        Ok(grant)
    }

    pub fn revoke_access(
        env: Env,
        owner: Address,
        dataset_id: u64,
        grantee: Address,
    ) -> Result<(), GenomicsError> {
        owner.require_auth();
        let dataset = read_dataset(&env, dataset_id)?;
        ensure_owner(&dataset, &owner)?;

        env.storage()
            .instance()
            .remove(&DataKey::Access(dataset_id, grantee.clone()));
        AccessRevoked {
            dataset_id,
            grantee,
            revoked_by: owner,
        }
        .publish(&env);

        Ok(())
    }

    pub fn has_access(env: Env, dataset_id: u64, user: Address) -> Result<bool, GenomicsError> {
        let dataset = read_dataset(&env, dataset_id)?;

        if dataset.owner == user {
            return Ok(true);
        }

        Ok(env
            .storage()
            .instance()
            .has(&DataKey::Access(dataset_id, user)))
    }

    pub fn get_access_grant(
        env: Env,
        dataset_id: u64,
        grantee: Address,
    ) -> Result<AccessGrant, GenomicsError> {
        env.storage()
            .instance()
            .get(&DataKey::Access(dataset_id, grantee))
            .ok_or(GenomicsError::DatasetNotFound)
    }
}

fn read_dataset(env: &Env, dataset_id: u64) -> Result<Dataset, GenomicsError> {
    env.storage()
        .instance()
        .get(&DataKey::Dataset(dataset_id))
        .ok_or(GenomicsError::DatasetNotFound)
}

fn ensure_owner(dataset: &Dataset, owner: &Address) -> Result<(), GenomicsError> {
    if &dataset.owner != owner {
        return Err(GenomicsError::NotDatasetOwner);
    }

    Ok(())
}

fn validate_price(price: i128) -> Result<(), GenomicsError> {
    if price < 0 {
        return Err(GenomicsError::InvalidPrice);
    }

    Ok(())
}

fn next_dataset_id(env: &Env) -> u64 {
    let id = env
        .storage()
        .instance()
        .get(&DataKey::NextDatasetId)
        .unwrap_or(DEFAULT_NEXT_ID);
    env.storage()
        .instance()
        .set(&DataKey::NextDatasetId, &(id + 1));

    id
}

fn dataset_ids(env: &Env) -> Vec<u64> {
    env.storage()
        .instance()
        .get(&DataKey::DatasetIds)
        .unwrap_or(Vec::new(env))
}

fn push_dataset_id(env: &Env, dataset_id: u64) {
    let mut ids = dataset_ids(env);
    ids.push_back(dataset_id);
    env.storage().instance().set(&DataKey::DatasetIds, &ids);
}

fn write_access_grant(
    env: &Env,
    dataset_id: u64,
    grantee: Address,
    granted_by: Address,
    paid_amount: i128,
) -> AccessGrant {
    let grant = AccessGrant {
        dataset_id,
        grantee: grantee.clone(),
        granted_by,
        paid_amount,
        granted_ledger: env.ledger().sequence(),
    };

    env.storage()
        .instance()
        .set(&DataKey::Access(dataset_id, grantee), &grant);

    grant
}

mod test;
