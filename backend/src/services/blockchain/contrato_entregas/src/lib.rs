#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    Bytes, BytesN, Env, String, Vec,
};

#[contracttype]
#[derive(Clone)]
pub struct EntregaVerificada {
    pub distribution_id: u64,
    pub item_id: u64,
    pub quantity: u64,
    pub recipient_commitment: BytesN<32>,
    pub signature_hash: BytesN<32>,
    pub receipt_hash: BytesN<32>,
    pub operator_id: u64,
    pub assurance_level: String,
    pub center_lat_e6: i64,
    pub center_lng_e6: i64,
    pub timestamp: u64,
}

#[contracttype]
pub enum ClaveEntrega {
    Entrega(u64),
    HistorialEntregas,
    ContadorEntregas,
}

#[contract]
pub struct ContratoEntregas;

#[contractimpl]
impl ContratoEntregas {
    pub fn registrar_entrega_verificada(
        env: Env,
        distribution_id: u64,
        item_id: u64,
        quantity: u64,
        recipient_commitment: BytesN<32>,
        signature_hash: BytesN<32>,
        receipt_hash: BytesN<32>,
        operator_id: u64,
        assurance_level: String,
        center_lat_e6: i64,
        center_lng_e6: i64,
    ) -> BytesN<32> {
        let timestamp = env.ledger().timestamp();

        let entrega = EntregaVerificada {
            distribution_id,
            item_id,
            quantity,
            recipient_commitment: recipient_commitment.clone(),
            signature_hash: signature_hash.clone(),
            receipt_hash: receipt_hash.clone(),
            operator_id,
            assurance_level,
            center_lat_e6,
            center_lng_e6,
            timestamp,
        };

        env.storage().persistent().set(&ClaveEntrega::Entrega(distribution_id), &entrega);

        let mut historial: Vec<u64> = env.storage().persistent()
            .get(&ClaveEntrega::HistorialEntregas)
            .unwrap_or(Vec::new(&env));
        historial.push_back(distribution_id);
        env.storage().persistent().set(&ClaveEntrega::HistorialEntregas, &historial);

        let contador: u64 = env.storage().persistent()
            .get(&ClaveEntrega::ContadorEntregas)
            .unwrap_or(0u64) + 1;
        env.storage().persistent().set(&ClaveEntrega::ContadorEntregas, &contador);

        Self::calcular_hash_entrega(
            &env, distribution_id, item_id, quantity,
            &recipient_commitment, &signature_hash, &receipt_hash,
            operator_id, center_lat_e6, center_lng_e6, timestamp,
        )
    }

    pub fn obtener_entrega(env: Env, distribution_id: u64) -> Option<EntregaVerificada> {
        env.storage().persistent().get(&ClaveEntrega::Entrega(distribution_id))
    }

    pub fn verificar_hashes(
        env: Env,
        distribution_id: u64,
        signature_hash: BytesN<32>,
        receipt_hash: BytesN<32>,
    ) -> bool {
        let entrega: Option<EntregaVerificada> = env.storage().persistent()
            .get(&ClaveEntrega::Entrega(distribution_id));

        match entrega {
            None => false,
            Some(e) => e.signature_hash == signature_hash && e.receipt_hash == receipt_hash,
        }
    }

    pub fn total_entregas(env: Env) -> u64 {
        env.storage().persistent()
            .get(&ClaveEntrega::ContadorEntregas)
            .unwrap_or(0u64)
    }

    fn calcular_hash_entrega(
        env: &Env,
        distribution_id: u64,
        item_id: u64,
        quantity: u64,
        recipient_commitment: &BytesN<32>,
        signature_hash: &BytesN<32>,
        receipt_hash: &BytesN<32>,
        operator_id: u64,
        center_lat_e6: i64,
        center_lng_e6: i64,
        timestamp: u64,
    ) -> BytesN<32> {
        let mut data = Bytes::new(env);
        for byte in distribution_id.to_be_bytes() { data.push_back(byte); }
        for byte in item_id.to_be_bytes() { data.push_back(byte); }
        for byte in quantity.to_be_bytes() { data.push_back(byte); }
        for i in 0..32u32 { data.push_back(recipient_commitment.get(i).unwrap()); }
        for i in 0..32u32 { data.push_back(signature_hash.get(i).unwrap()); }
        for i in 0..32u32 { data.push_back(receipt_hash.get(i).unwrap()); }
        for byte in operator_id.to_be_bytes() { data.push_back(byte); }
        for byte in center_lat_e6.to_be_bytes() { data.push_back(byte); }
        for byte in center_lng_e6.to_be_bytes() { data.push_back(byte); }
        for byte in timestamp.to_be_bytes() { data.push_back(byte); }
        data.push_back(0x03u8);
        env.crypto().sha256(&data).into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Ledger, BytesN, Env, String};

    #[test]
    fn test_registrar_y_verificar_entrega() {
        let env = Env::default();
        env.ledger().with_mut(|l| { l.timestamp = 1_700_000_000u64; });
        let contrato = ContratoEntregasClient::new(&env, &env.register(ContratoEntregas, ()));

        let rc = BytesN::from_array(&env, &[1u8; 32]);
        let sh = BytesN::from_array(&env, &[2u8; 32]);
        let rh = BytesN::from_array(&env, &[3u8; 32]);

        let hash = contrato.registrar_entrega_verificada(
            &10u64, &2u64, &4u64, &rc, &sh, &rh,
            &9u64, &String::from_str(&env, "MANUAL_VERIFIED"),
            &-34400000i64, &-58380000i64,
        );

        assert_eq!(hash.len(), 32);

        let entrega = contrato.obtener_entrega(&10u64).unwrap();
        assert_eq!(entrega.item_id, 2u64);
        assert!(contrato.verificar_hashes(&10u64, &sh, &rh));
        assert_eq!(contrato.total_entregas(), 1u64);
    }
}
