#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    Bytes, BytesN, Env, String, Vec,
};

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
#[derive(Clone)]
pub struct ItemEnCentro {
    pub item_id: u64,
    pub cantidad: u64,
    pub timestamp_ingreso: u64,
    pub origen: String,
}

#[contracttype]
#[derive(Clone)]
pub struct Movimiento {
    pub movimiento_id: u64,
    pub item_id: u64,
    pub cantidad: u64,
    pub tipo: String,
    pub contraparte: String,
    pub timestamp: u64,
    pub firma_hash: BytesN<32>,
    pub motivo: String,
}

#[contracttype]
pub enum ClaveCentro {
    Info,
    Inicializado,
    Item(u64),
    Inventario,
    Movimiento(u64),
    HistorialMovimientos,
    ContadorMovimientos,
}

#[contract]
pub struct ContratoCentro;

#[contractimpl]
impl ContratoCentro {
    pub fn inicializar(
        env: Env,
        nombre: String,
        lat_e6: i64,
        lng_e6: i64,
        geo_hash: BytesN<32>,
    ) -> bool {
        let ya_init: bool = env.storage().persistent()
            .get(&ClaveCentro::Inicializado)
            .unwrap_or(false);
        if ya_init {
            return false;
        }

        let info = InfoCentro {
            nombre,
            lat_e6,
            lng_e6,
            geo_hash,
            timestamp_creacion: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&ClaveCentro::Info, &info);
        env.storage().persistent().set(&ClaveCentro::Inicializado, &true);
        env.storage().persistent().set(&ClaveCentro::ContadorMovimientos, &0u64);
        env.storage().persistent().set(&ClaveCentro::Inventario, &Vec::<u64>::new(&env));
        env.storage().persistent().set(&ClaveCentro::HistorialMovimientos, &Vec::<u64>::new(&env));
        true
    }

    pub fn obtener_info(env: Env) -> Option<InfoCentro> {
        env.storage().persistent().get(&ClaveCentro::Info)
    }

    pub fn registrar_ingreso(
        env: Env,
        item_id: u64,
        cantidad: u64,
        origen: String,
        firma_hash: BytesN<32>,
        motivo: String,
    ) -> BytesN<32> {
        let timestamp = env.ledger().timestamp();

        let item = ItemEnCentro {
            item_id,
            cantidad,
            timestamp_ingreso: timestamp,
            origen: origen.clone(),
        };
        env.storage().persistent().set(&ClaveCentro::Item(item_id), &item);

        let mut inventario: Vec<u64> = env.storage().persistent()
            .get(&ClaveCentro::Inventario)
            .unwrap_or(Vec::new(&env));
        let mut ya_existe = false;
        for i in 0..inventario.len() {
            if inventario.get(i).unwrap() == item_id {
                ya_existe = true;
                break;
            }
        }
        if !ya_existe {
            inventario.push_back(item_id);
        }
        env.storage().persistent().set(&ClaveCentro::Inventario, &inventario);

        let mov_id: u64 = env.storage().persistent()
            .get(&ClaveCentro::ContadorMovimientos)
            .unwrap_or(0u64) + 1;
        env.storage().persistent().set(&ClaveCentro::ContadorMovimientos, &mov_id);

        let movimiento = Movimiento {
            movimiento_id: mov_id,
            item_id,
            cantidad,
            tipo: String::from_str(&env, "ingreso"),
            contraparte: origen,
            timestamp,
            firma_hash,
            motivo,
        };
        env.storage().persistent().set(&ClaveCentro::Movimiento(mov_id), &movimiento);

        let mut hist: Vec<u64> = env.storage().persistent()
            .get(&ClaveCentro::HistorialMovimientos)
            .unwrap_or(Vec::new(&env));
        hist.push_back(mov_id);
        env.storage().persistent().set(&ClaveCentro::HistorialMovimientos, &hist);

        Self::calcular_hash_movimiento(&env, mov_id, item_id, cantidad, timestamp)
    }

    pub fn registrar_egreso(
        env: Env,
        item_id: u64,
        cantidad: u64,
        destino: String,
        firma_hash: BytesN<32>,
        motivo: String,
    ) -> BytesN<32> {
        let tiene = env.storage().persistent().has(&ClaveCentro::Item(item_id));
        if !tiene {
            panic!("Item no encontrado en este centro");
        }

        let timestamp = env.ledger().timestamp();

        env.storage().persistent().remove(&ClaveCentro::Item(item_id));

        let mut inventario: Vec<u64> = env.storage().persistent()
            .get(&ClaveCentro::Inventario)
            .unwrap_or(Vec::new(&env));
        let mut nuevo_inv = Vec::new(&env);
        for i in 0..inventario.len() {
            let id = inventario.get(i).unwrap();
            if id != item_id {
                nuevo_inv.push_back(id);
            }
        }
        env.storage().persistent().set(&ClaveCentro::Inventario, &nuevo_inv);

        let mov_id: u64 = env.storage().persistent()
            .get(&ClaveCentro::ContadorMovimientos)
            .unwrap_or(0u64) + 1;
        env.storage().persistent().set(&ClaveCentro::ContadorMovimientos, &mov_id);

        let movimiento = Movimiento {
            movimiento_id: mov_id,
            item_id,
            cantidad,
            tipo: String::from_str(&env, "egreso"),
            contraparte: destino,
            timestamp,
            firma_hash,
            motivo,
        };
        env.storage().persistent().set(&ClaveCentro::Movimiento(mov_id), &movimiento);

        let mut hist: Vec<u64> = env.storage().persistent()
            .get(&ClaveCentro::HistorialMovimientos)
            .unwrap_or(Vec::new(&env));
        hist.push_back(mov_id);
        env.storage().persistent().set(&ClaveCentro::HistorialMovimientos, &hist);

        Self::calcular_hash_movimiento(&env, mov_id, item_id, cantidad, timestamp)
    }

    pub fn tiene_item(env: Env, item_id: u64) -> bool {
        env.storage().persistent().has(&ClaveCentro::Item(item_id))
    }

    pub fn obtener_item(env: Env, item_id: u64) -> Option<ItemEnCentro> {
        env.storage().persistent().get(&ClaveCentro::Item(item_id))
    }

    pub fn obtener_inventario(env: Env) -> Vec<u64> {
        env.storage().persistent()
            .get(&ClaveCentro::Inventario)
            .unwrap_or(Vec::new(&env))
    }

    pub fn obtener_movimientos(env: Env) -> Vec<u64> {
        env.storage().persistent()
            .get(&ClaveCentro::HistorialMovimientos)
            .unwrap_or(Vec::new(&env))
    }

    pub fn obtener_movimiento(env: Env, movimiento_id: u64) -> Option<Movimiento> {
        env.storage().persistent().get(&ClaveCentro::Movimiento(movimiento_id))
    }

    pub fn total_movimientos(env: Env) -> u64 {
        env.storage().persistent()
            .get(&ClaveCentro::ContadorMovimientos)
            .unwrap_or(0u64)
    }

    fn calcular_hash_movimiento(env: &Env, mov_id: u64, item_id: u64, cantidad: u64, timestamp: u64) -> BytesN<32> {
        let mut data = Bytes::new(env);
        for byte in mov_id.to_be_bytes() { data.push_back(byte); }
        for byte in item_id.to_be_bytes() { data.push_back(byte); }
        for byte in cantidad.to_be_bytes() { data.push_back(byte); }
        for byte in timestamp.to_be_bytes() { data.push_back(byte); }
        data.push_back(0x04u8);
        env.crypto().sha256(&data).into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Ledger, BytesN, Env, String};

    #[test]
    fn test_inicializar_centro() {
        let env = Env::default();
        env.ledger().with_mut(|l| { l.timestamp = 1_700_000_000u64; });
        let contrato = ContratoCentroClient::new(&env, &env.register(ContratoCentro, ()));

        let ok = contrato.inicializar(
            &String::from_str(&env, "Centro Norte"),
            &-34570800i64, &-58437000i64,
            &BytesN::from_array(&env, &[7u8; 32]),
        );
        assert!(ok);

        // No se puede inicializar dos veces
        let ok2 = contrato.inicializar(
            &String::from_str(&env, "Otro"),
            &0i64, &0i64,
            &BytesN::from_array(&env, &[0u8; 32]),
        );
        assert!(!ok2);

        let info = contrato.obtener_info().unwrap();
        assert_eq!(info.lat_e6, -34570800i64);
    }

    #[test]
    fn test_ingreso_egreso() {
        let env = Env::default();
        env.ledger().with_mut(|l| { l.timestamp = 1_700_000_000u64; });
        let contrato = ContratoCentroClient::new(&env, &env.register(ContratoCentro, ()));

        contrato.inicializar(
            &String::from_str(&env, "Centro Test"),
            &0i64, &0i64,
            &BytesN::from_array(&env, &[0u8; 32]),
        );

        let firma = BytesN::from_array(&env, &[5u8; 32]);

        // Ingreso
        let h1 = contrato.registrar_ingreso(
            &1u64, &10u64,
            &String::from_str(&env, "donacion"),
            &firma,
            &String::from_str(&env, "Recepcion inicial"),
        );
        assert_eq!(h1.len(), 32);
        assert!(contrato.tiene_item(&1u64));

        let inv = contrato.obtener_inventario();
        assert_eq!(inv.len(), 1);

        // Egreso
        let h2 = contrato.registrar_egreso(
            &1u64, &10u64,
            &String::from_str(&env, "CENTRO_B_CONTRACT_ID"),
            &firma,
            &String::from_str(&env, "Transferencia a Centro B"),
        );
        assert_eq!(h2.len(), 32);
        assert!(!contrato.tiene_item(&1u64));

        let inv2 = contrato.obtener_inventario();
        assert_eq!(inv2.len(), 0);
        assert_eq!(contrato.total_movimientos(), 2u64);
    }
}
