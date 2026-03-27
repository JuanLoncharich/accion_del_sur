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
pub enum ClaveAlmacen {
    Token(u64),
    HistorialDonacion(u64),
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

    pub fn verificar_token(env: Env, item_id: u64) -> bool {
        env.storage().persistent().has(&ClaveAlmacen::Token(item_id))
    }

    pub fn obtener_token(env: Env, item_id: u64) -> Option<TokenDonacion> {
        env.storage().persistent().get(&ClaveAlmacen::Token(item_id))
    }

    pub fn obtener_historial(env: Env, item_id: u64) -> Vec<TokenDonacion> {
        env.storage().persistent()
            .get(&ClaveAlmacen::HistorialDonacion(item_id))
            .unwrap_or(Vec::new(&env))
    }

    fn calcular_hash_token(env: &Env, item_id: u64, timestamp: u64, cantidad: u64) -> BytesN<32> {
        let mut data = Bytes::new(env);
        for byte in item_id.to_be_bytes() { data.push_back(byte); }
        for byte in timestamp.to_be_bytes() { data.push_back(byte); }
        for byte in cantidad.to_be_bytes() { data.push_back(byte); }
        data.push_back(0x01u8);
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
}
