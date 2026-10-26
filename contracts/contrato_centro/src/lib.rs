#![no_std]

//! Contrato de identidad de un centro de recepción.
//!
//! Se despliega una instancia por centro (a partir del mismo WASM). Su dirección (`C...`) es la
//! que acumula los saldos del contrato SFT, de modo que el inventario on-chain de un centro es
//! `balance_of(<dirección del centro>, token_id)`. El contrato guarda además los datos públicos
//! del centro, fijados en el despliegue por el constructor (despliegue e inicialización son una
//! sola operación, así nadie puede inicializarlo antes que el backend).

use soroban_sdk::{contract, contractimpl, contracttype, BytesN, Env, String};

#[contracttype]
#[derive(Clone)]
pub struct InfoCentro {
    pub nombre: String,
    pub lat_e6: i64,
    pub lng_e6: i64,
    pub geo_hash: BytesN<32>,
    pub timestamp_creacion: u64,
}

#[contracttype]
pub enum ClaveCentro {
    Info,
}

#[contract]
pub struct ContratoCentro;

#[contractimpl]
impl ContratoCentro {
    /// `lat_e6`/`lng_e6`: coordenadas multiplicadas por 1e6 (0 si se desconocen).
    /// `geo_hash`: SHA-256 de los datos del centro calculado por el backend.
    pub fn __constructor(env: Env, nombre: String, lat_e6: i64, lng_e6: i64, geo_hash: BytesN<32>) {
        let info = InfoCentro {
            nombre,
            lat_e6,
            lng_e6,
            geo_hash,
            timestamp_creacion: env.ledger().timestamp(),
        };
        env.storage().instance().set(&ClaveCentro::Info, &info);
    }

    pub fn obtener_info(env: Env) -> InfoCentro {
        env.storage().instance().get(&ClaveCentro::Info).unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Ledger, BytesN, Env, String};

    #[test]
    fn test_constructor_guarda_info() {
        let env = Env::default();
        env.ledger().with_mut(|l| { l.timestamp = 1_700_000_000u64; });
        let id = env.register(
            ContratoCentro,
            (
                String::from_str(&env, "Centro Norte"),
                -34570800i64,
                -58437000i64,
                BytesN::from_array(&env, &[7u8; 32]),
            ),
        );
        let contrato = ContratoCentroClient::new(&env, &id);

        let info = contrato.obtener_info();
        assert_eq!(info.nombre, String::from_str(&env, "Centro Norte"));
        assert_eq!(info.lat_e6, -34570800i64);
        assert_eq!(info.timestamp_creacion, 1_700_000_000u64);
    }
}
