#![no_std]

//! Contrato de anclaje de recepciones de donaciones.
//!
//! El backend registra aquí el hash del detalle de cada recepción finalizada y el hash de la
//! firma del operador. Cualquiera puede verificar después que el detalle que muestra la
//! aplicación coincide con lo anclado. Solo el administrador (la cuenta del backend) puede
//! registrar, y un registro no se puede sobrescribir.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    Address, Bytes, BytesN, Env, String, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AlreadyRegistered = 3,
}

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
    Admin,
    Entrega(u64),
    HistorialEntregas,
    ContadorEntregas,
}

#[contract]
pub struct ContratoEntregas;

#[contractimpl]
impl ContratoEntregas {
    /// Define la cuenta administradora. Solo puede llamarse una vez.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&ClaveEntrega::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&ClaveEntrega::Admin, &admin);
        Ok(())
    }

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
    ) -> Result<BytesN<32>, Error> {
        let admin: Address = env.storage().instance()
            .get(&ClaveEntrega::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if env.storage().persistent().has(&ClaveEntrega::Entrega(distribution_id)) {
            return Err(Error::AlreadyRegistered);
        }

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

        Ok(Self::calcular_hash_entrega(
            &env, distribution_id, item_id, quantity,
            &recipient_commitment, &signature_hash, &receipt_hash,
            operator_id, center_lat_e6, center_lng_e6, timestamp,
        ))
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
    use soroban_sdk::{testutils::{Address as _, Ledger}, BytesN, Env, String};

    fn setup(env: &Env) -> ContratoEntregasClient<'_> {
        env.ledger().with_mut(|l| { l.timestamp = 1_700_000_000u64; });
        let contrato = ContratoEntregasClient::new(env, &env.register(ContratoEntregas, ()));
        contrato.initialize(&Address::generate(env));
        contrato
    }

    fn registrar(env: &Env, contrato: &ContratoEntregasClient, id: u64) -> Result<BytesN<32>, Error> {
        let rc = BytesN::from_array(env, &[1u8; 32]);
        let sh = BytesN::from_array(env, &[2u8; 32]);
        let rh = BytesN::from_array(env, &[3u8; 32]);
        contrato
            .try_registrar_entrega_verificada(
                &id, &2u64, &4u64, &rc, &sh, &rh,
                &9u64, &String::from_str(env, "DONATION_RECEPTION"),
                &-34400000i64, &-58380000i64,
            )
            .map(|r| r.unwrap())
            .map_err(|e| e.unwrap())
    }

    #[test]
    fn test_registrar_y_verificar_entrega() {
        let env = Env::default();
        env.mock_all_auths();
        let contrato = setup(&env);

        let hash = registrar(&env, &contrato, 10).unwrap();
        assert_eq!(hash.len(), 32);

        let entrega = contrato.obtener_entrega(&10u64).unwrap();
        assert_eq!(entrega.item_id, 2u64);
        let sh = BytesN::from_array(&env, &[2u8; 32]);
        let rh = BytesN::from_array(&env, &[3u8; 32]);
        assert!(contrato.verificar_hashes(&10u64, &sh, &rh));
        assert!(!contrato.verificar_hashes(&10u64, &rh, &sh));
        assert_eq!(contrato.total_entregas(), 1u64);
    }

    #[test]
    fn test_no_permite_sobrescribir() {
        let env = Env::default();
        env.mock_all_auths();
        let contrato = setup(&env);

        registrar(&env, &contrato, 7).unwrap();
        assert_eq!(registrar(&env, &contrato, 7), Err(Error::AlreadyRegistered));
        assert_eq!(contrato.total_entregas(), 1u64);
    }

    #[test]
    fn test_initialize_una_sola_vez() {
        let env = Env::default();
        let contrato = setup(&env);
        let result = contrato.try_initialize(&Address::generate(&env));
        assert!(matches!(result, Err(Ok(Error::AlreadyInitialized))));
    }

    #[test]
    #[should_panic]
    fn test_registrar_requiere_admin() {
        let env = Env::default();
        let contrato = setup(&env);
        // Sin mock_all_auths: la firma del admin falta y la llamada debe fallar.
        let _ = registrar(&env, &contrato, 1);
    }
}
