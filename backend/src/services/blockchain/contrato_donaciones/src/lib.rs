#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    Bytes, BytesN, Env, Map, String, Symbol, Vec,
};

#[contracttype]
#[derive(Clone)]
pub struct TokenDonacion {
    pub item_id: u64,
    pub categoria: String,
    pub nombre: String,
    pub timestamp: u64,
    pub cantidad_inicial: u64,
    pub center_lat_e6: i64,
    pub center_lng_e6: i64,
    pub center_geo_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone)]
pub struct RegistroDistribucion {
    pub item_id: u64,
    pub receptor_hash: BytesN<32>,
    pub cantidad: u64,
    pub timestamp: u64,
    pub distribucion_id: u64,
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
pub enum ClaveAlmacen {
    Token(u64),
    HistorialDonacion(u64),
    HistorialDistribucion(u64),
    ContadorDistribucion,
    EntregaVerificada(u64),
    HistorialEntregaVerificada,
}

#[contract]
pub struct ContratoDonaciones;

#[contractimpl]
impl ContratoDonaciones {
    pub fn mint_token_donacion(
        env: Env,
        item_id: u64,
        metadata: Map<Symbol, String>,
        cantidad: u64,
        center_lat_e6: i64,
        center_lng_e6: i64,
        center_geo_hash: BytesN<32>,
    ) -> BytesN<32> {
        let categoria = metadata.get(Symbol::new(&env, "categoria"))
            .unwrap_or(String::from_str(&env, "sin_categoria"));
        let nombre = metadata.get(Symbol::new(&env, "nombre"))
            .unwrap_or(String::from_str(&env, "sin_nombre"));

        let timestamp = env.ledger().timestamp();

        let token = TokenDonacion {
            item_id,
            categoria,
            nombre,
            timestamp,
            cantidad_inicial: cantidad,
            center_lat_e6,
            center_lng_e6,
            center_geo_hash,
        };

        env.storage().persistent().set(&ClaveAlmacen::Token(item_id), &token);

        let mut historial: Vec<TokenDonacion> = env.storage().persistent()
            .get(&ClaveAlmacen::HistorialDonacion(item_id))
            .unwrap_or(Vec::new(&env));
        historial.push_back(token.clone());
        env.storage().persistent().set(&ClaveAlmacen::HistorialDonacion(item_id), &historial);

        Self::calcular_hash_token(&env, item_id, timestamp, cantidad)
    }

    pub fn registrar_distribucion(
        env: Env,
        item_id: u64,
        receptor_hash: BytesN<32>,
        cantidad: u64,
    ) -> BytesN<32> {
        let dist_id: u64 = env.storage().persistent()
            .get(&ClaveAlmacen::ContadorDistribucion)
            .unwrap_or(0u64) + 1;
        env.storage().persistent().set(&ClaveAlmacen::ContadorDistribucion, &dist_id);

        let timestamp = env.ledger().timestamp();

        let registro = RegistroDistribucion {
            item_id,
            receptor_hash: receptor_hash.clone(),
            cantidad,
            timestamp,
            distribucion_id: dist_id,
        };

        let mut historial: Vec<RegistroDistribucion> = env.storage().persistent()
            .get(&ClaveAlmacen::HistorialDistribucion(item_id))
            .unwrap_or(Vec::new(&env));
        historial.push_back(registro);
        env.storage().persistent().set(&ClaveAlmacen::HistorialDistribucion(item_id), &historial);

        Self::calcular_hash_distribucion(&env, item_id, &receptor_hash, cantidad, timestamp)
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

        env.storage().persistent().set(&ClaveAlmacen::EntregaVerificada(distribution_id), &entrega);

        let mut historial: Vec<u64> = env.storage().persistent()
            .get(&ClaveAlmacen::HistorialEntregaVerificada)
            .unwrap_or(Vec::new(&env));
        historial.push_back(distribution_id);
        env.storage().persistent().set(&ClaveAlmacen::HistorialEntregaVerificada, &historial);

        Self::calcular_hash_entrega(
            &env,
            distribution_id,
            item_id,
            quantity,
            &recipient_commitment,
            &signature_hash,
            &receipt_hash,
            operator_id,
            center_lat_e6,
            center_lng_e6,
            timestamp,
        )
    }

    pub fn obtener_entrega(env: Env, distribution_id: u64) -> Option<EntregaVerificada> {
        env.storage().persistent().get(&ClaveAlmacen::EntregaVerificada(distribution_id))
    }

    pub fn verificar_hashes(
        env: Env,
        distribution_id: u64,
        signature_hash: BytesN<32>,
        receipt_hash: BytesN<32>,
    ) -> bool {
        let entrega: Option<EntregaVerificada> = env.storage().persistent()
            .get(&ClaveAlmacen::EntregaVerificada(distribution_id));

        match entrega {
            None => false,
            Some(e) => e.signature_hash == signature_hash && e.receipt_hash == receipt_hash,
        }
    }

    pub fn verificar_token(env: Env, item_id: u64) -> bool {
        env.storage().persistent().has(&ClaveAlmacen::Token(item_id))
    }

    pub fn obtener_historial_distribuciones(env: Env, item_id: u64) -> Vec<RegistroDistribucion> {
        env.storage().persistent()
            .get(&ClaveAlmacen::HistorialDistribucion(item_id))
            .unwrap_or(Vec::new(&env))
    }

    pub fn obtener_token(env: Env, item_id: u64) -> Option<TokenDonacion> {
        env.storage().persistent().get(&ClaveAlmacen::Token(item_id))
    }

    pub fn total_distribuciones(env: Env) -> u64 {
        env.storage().persistent()
            .get(&ClaveAlmacen::ContadorDistribucion)
            .unwrap_or(0u64)
    }

    fn calcular_hash_token(env: &Env, item_id: u64, timestamp: u64, cantidad: u64) -> BytesN<32> {
        let mut data = Bytes::new(env);
        for byte in item_id.to_be_bytes() { data.push_back(byte); }
        for byte in timestamp.to_be_bytes() { data.push_back(byte); }
        for byte in cantidad.to_be_bytes() { data.push_back(byte); }
        data.push_back(0x01u8);
        env.crypto().sha256(&data).into()
    }

    fn calcular_hash_distribucion(
        env: &Env,
        item_id: u64,
        receptor_hash: &BytesN<32>,
        cantidad: u64,
        timestamp: u64,
    ) -> BytesN<32> {
        let mut data = Bytes::new(env);
        for byte in item_id.to_be_bytes() { data.push_back(byte); }
        for byte in cantidad.to_be_bytes() { data.push_back(byte); }
        for byte in timestamp.to_be_bytes() { data.push_back(byte); }
        for i in 0..32u32 { data.push_back(receptor_hash.get(i).unwrap()); }
        data.push_back(0x02u8);
        env.crypto().sha256(&data).into()
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
    use soroban_sdk::{testutils::Ledger, BytesN, Env, Map, String, Symbol};

    fn env_con_timestamp() -> Env {
        let env = Env::default();
        env.ledger().with_mut(|l| { l.timestamp = 1_700_000_000u64; });
        env
    }

    #[test]
    fn test_mint_y_verificar_token() {
        let env = env_con_timestamp();
        let contrato = ContratoDonacionesClient::new(&env, &env.register(ContratoDonaciones, ()));

        let mut metadata = Map::new(&env);
        metadata.set(Symbol::new(&env, "categoria"), String::from_str(&env, "Prendas"));
        metadata.set(Symbol::new(&env, "nombre"), String::from_str(&env, "Remera"));

        let hash = contrato.mint_token_donacion(&1u64, &metadata, &5u64, &-34400000i64, &-58380000i64, &BytesN::from_array(&env, &[7u8; 32]));

        assert_eq!(hash.len(), 32);
        assert!(contrato.verificar_token(&1u64));

        let token = contrato.obtener_token(&1u64).unwrap();
        assert_eq!(token.item_id, 1u64);
        assert_eq!(token.center_lat_e6, -34400000i64);
    }

    #[test]
    fn test_registro_entrega_verificada_y_hashes() {
        let env = env_con_timestamp();
        let contrato = ContratoDonacionesClient::new(&env, &env.register(ContratoDonaciones, ()));

        let recipient_commitment = BytesN::from_array(&env, &[1u8; 32]);
        let signature_hash = BytesN::from_array(&env, &[2u8; 32]);
        let receipt_hash = BytesN::from_array(&env, &[3u8; 32]);

        let result = contrato.registrar_entrega_verificada(
            &10u64,
            &2u64,
            &4u64,
            &recipient_commitment,
            &signature_hash,
            &receipt_hash,
            &9u64,
            &String::from_str(&env, "MANUAL_VERIFIED"),
            &-34400000i64,
            &-58380000i64,
        );

        assert_eq!(result.len(), 32);

        let entrega = contrato.obtener_entrega(&10u64).unwrap();
        assert_eq!(entrega.item_id, 2u64);
        assert!(contrato.verificar_hashes(&10u64, &signature_hash, &receipt_hash));
    }
}
