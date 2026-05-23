#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup() -> (
    Env,
    GenomicsRepositoryContractClient<'static>,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(GenomicsRepositoryContract, ());
    let client = GenomicsRepositoryContractClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let researcher = Address::generate(&env);

    (env, client, owner, researcher)
}

fn dataset_input(env: &Env, suffix: &str, price: i128) -> DatasetInput {
    let (title, metadata_uri, content_hash) = if suffix == "b" {
        ("Rare disease cohort b", "ipfs://bafygenomicsb", "sha256:b")
    } else {
        ("Rare disease cohort a", "ipfs://bafygenomicsa", "sha256:a")
    };

    DatasetInput {
        title: String::from_str(env, title),
        description: String::from_str(env, "De-identified whole genome metadata cohort"),
        data_type: String::from_str(env, "WGS"),
        metadata_uri: String::from_str(env, metadata_uri),
        content_hash: String::from_str(env, content_hash),
        price,
    }
}

#[test]
fn publish_and_list_dataset() {
    let (env, client, owner, _) = setup();
    let id = client.publish_dataset(&owner, &dataset_input(&env, "a", 250));

    assert_eq!(id, 1);

    let dataset = client.get_dataset(&id);
    assert_eq!(dataset.id, id);
    assert_eq!(dataset.owner, owner);
    assert_eq!(dataset.price, 250);
    assert!(dataset.active);

    let datasets = client.list_datasets();
    assert_eq!(datasets.len(), 1);
    assert_eq!(datasets.get(0).unwrap().id, id);
}

#[test]
fn owner_can_update_dataset_and_toggle_availability() {
    let (env, client, owner, _) = setup();
    let id = client.publish_dataset(&owner, &dataset_input(&env, "a", 250));

    client.update_dataset(&owner, &id, &dataset_input(&env, "b", 500), &false);

    let dataset = client.get_dataset(&id);
    assert_eq!(dataset.price, 500);
    assert!(!dataset.active);
    assert_eq!(dataset.content_hash, String::from_str(&env, "sha256:b"));
}

#[test]
fn non_owner_cannot_update_dataset() {
    let (env, client, owner, researcher) = setup();
    let id = client.publish_dataset(&owner, &dataset_input(&env, "a", 250));

    let result = client.try_update_dataset(&researcher, &id, &dataset_input(&env, "b", 500), &true);

    assert_eq!(result, Err(Ok(GenomicsError::NotDatasetOwner)));
}

#[test]
fn owner_can_grant_and_revoke_access() {
    let (env, client, owner, researcher) = setup();
    let id = client.publish_dataset(&owner, &dataset_input(&env, "a", 250));

    assert!(!client.has_access(&id, &researcher));
    assert!(client.has_access(&id, &owner));

    let grant = client.grant_access(&owner, &id, &researcher);
    assert_eq!(grant.dataset_id, id);
    assert_eq!(grant.grantee, researcher);
    assert_eq!(grant.granted_by, owner);
    assert_eq!(grant.paid_amount, 0);
    assert!(client.has_access(&id, &researcher));

    client.revoke_access(&owner, &id, &researcher);
    assert!(!client.has_access(&id, &researcher));
}

#[test]
fn researcher_can_purchase_access_when_payment_meets_price() {
    let (env, client, owner, researcher) = setup();
    let id = client.publish_dataset(&owner, &dataset_input(&env, "a", 250));

    let low_payment = client.try_purchase_access(&researcher, &id, &249);
    assert_eq!(low_payment, Err(Ok(GenomicsError::InsufficientPayment)));

    let grant = client.purchase_access(&researcher, &id, &250);
    assert_eq!(grant.granted_by, owner);
    assert_eq!(grant.paid_amount, 250);
    assert!(client.has_access(&id, &researcher));
}

#[test]
fn inactive_dataset_cannot_be_purchased() {
    let (env, client, owner, researcher) = setup();
    let id = client.publish_dataset(&owner, &dataset_input(&env, "a", 250));
    client.update_dataset(&owner, &id, &dataset_input(&env, "a", 250), &false);

    let result = client.try_purchase_access(&researcher, &id, &250);

    assert_eq!(result, Err(Ok(GenomicsError::DatasetInactive)));
}
