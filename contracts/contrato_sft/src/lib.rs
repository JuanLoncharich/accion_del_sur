#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short,
    Address, BytesN, Env, String, Vec,
};

// ─── Errores ─────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InsufficientBalance = 1,
    TokenNotFound = 2,
    Unauthorized = 3,
    AlreadyInitialized = 4,
}

// ─── Tipos de datos ───────────────────────────────────────────────────────────

/// Metadata de un tipo de token. Se almacena una vez por token_id.
/// Campos ordenados alfabéticamente (requerido por Soroban para ScvMap).
#[contracttype]
#[derive(Clone)]
pub struct TokenMetadata {
    pub attributes_hash: BytesN<32>,
    pub categoria: String,
    pub item_id: u64,
    pub nombre: String,
}

/// Clave compuesta para el balance (owner, token_id).
/// Se usa como variante del enum Key para evitar claves de dos argumentos.
#[contracttype]
#[derive(Clone)]
pub struct BalanceKey {
    pub owner: Address,
    pub token_id: BytesN<32>,
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum Key {
    Admin,
    Token(BytesN<32>),
    Balance(BalanceKey),
    Supply(BytesN<32>),
    Inventory(Address),
}

// ─── Contrato ─────────────────────────────────────────────────────────────────

#[contract]
pub struct ContratoSft;

#[contractimpl]
impl ContratoSft {

    /// Inicializa el contrato con la dirección del administrador.
    /// Solo puede llamarse una vez.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&Key::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&Key::Admin, &admin);
        Ok(())
    }

    /// Mintea `cantidad` tokens del tipo `token_id` a la dirección `to`.
    /// Si el token ya existe, solo incrementa el balance (SFT acumulable).
    /// Requiere autorización del administrador.
    pub fn mint(
        env: Env,
        to: Address,
        token_id: BytesN<32>,
        metadata: TokenMetadata,
        cantidad: u64,
        firma_hash: BytesN<32>,
    ) -> Result<(), Error> {
        Self::require_admin(&env)?;

        // Guardar metadata solo si es la primera vez para este token_id
        if !env.storage().persistent().has(&Key::Token(token_id.clone())) {
            env.storage().persistent().set(&Key::Token(token_id.clone()), &metadata);
        }

        // Incrementar balance del receptor
        let key = BalanceKey { owner: to.clone(), token_id: token_id.clone() };
        let balance: u64 = env.storage().persistent()
            .get(&Key::Balance(key.clone()))
            .unwrap_or(0);
        env.storage().persistent().set(&Key::Balance(key), &(balance + cantidad));

        // Incrementar supply total
        let supply: u64 = env.storage().persistent()
            .get(&Key::Supply(token_id.clone()))
            .unwrap_or(0);
        env.storage().persistent().set(&Key::Supply(token_id.clone()), &(supply + cantidad));

        // Agregar token al inventario del receptor (si no estaba)
        Self::add_to_inventory(&env, to.clone(), token_id.clone());

        // Evento: topic = (symbol "mint", token_id), data = (to, cantidad, firma_hash)
        env.events().publish(
            (symbol_short!("mint"), token_id),
            (to, cantidad, firma_hash),
        );

        Ok(())
    }

    /// Transfiere `cantidad` tokens del tipo `token_id` de `from` a `to`.
    /// Requiere autorización del administrador.
    pub fn transfer(
        env: Env,
        from: Address,
        to: Address,
        token_id: BytesN<32>,
        cantidad: u64,
        motivo_hash: BytesN<32>,
    ) -> Result<(), Error> {
        Self::require_admin(&env)?;

        // Verificar balance del origen
        let from_key = BalanceKey { owner: from.clone(), token_id: token_id.clone() };
        let from_balance: u64 = env.storage().persistent()
            .get(&Key::Balance(from_key.clone()))
            .unwrap_or(0);

        if from_balance < cantidad {
            return Err(Error::InsufficientBalance);
        }

        // Reducir balance del origen
        env.storage().persistent().set(&Key::Balance(from_key), &(from_balance - cantidad));

        // Incrementar balance del destino
        let to_key = BalanceKey { owner: to.clone(), token_id: token_id.clone() };
        let to_balance: u64 = env.storage().persistent()
            .get(&Key::Balance(to_key.clone()))
            .unwrap_or(0);
        env.storage().persistent().set(&Key::Balance(to_key), &(to_balance + cantidad));

        // Agregar token al inventario del destino
        Self::add_to_inventory(&env, to.clone(), token_id.clone());

        // Evento: topic = (symbol "transfer", token_id), data = (from, to, cantidad, motivo_hash)
        env.events().publish(
            (symbol_short!("transfer"), token_id),
            (from, to, cantidad, motivo_hash),
        );

        Ok(())
    }

    /// Destruye `cantidad` tokens del tipo `token_id` de `from`.
    /// Se usa al distribuir ítems a beneficiarios finales.
    /// Requiere autorización del administrador.
    pub fn burn(
        env: Env,
        from: Address,
        token_id: BytesN<32>,
        cantidad: u64,
        recipient_commitment: BytesN<32>,
        signature_hash: BytesN<32>,
        operator_id: u64,
    ) -> Result<(), Error> {
        Self::require_admin(&env)?;

        let key = BalanceKey { owner: from.clone(), token_id: token_id.clone() };
        let balance: u64 = env.storage().persistent()
            .get(&Key::Balance(key.clone()))
            .unwrap_or(0);

        if balance < cantidad {
            return Err(Error::InsufficientBalance);
        }

        // Reducir balance y supply
        env.storage().persistent().set(&Key::Balance(key), &(balance - cantidad));

        let supply: u64 = env.storage().persistent()
            .get(&Key::Supply(token_id.clone()))
            .unwrap_or(0);
        env.storage().persistent().set(&Key::Supply(token_id.clone()), &(supply - cantidad));

        // Evento: topic = (symbol "burn", token_id), data = (from, cantidad, commitment, sig, operator)
        env.events().publish(
            (symbol_short!("burn"), token_id),
            (from, cantidad, recipient_commitment, signature_hash, operator_id),
        );

        Ok(())
    }

    // ─── Consultas (read-only) ─────────────────────────────────────────────────

    /// Retorna el balance de un centro para un tipo de token.
    pub fn balance_of(env: Env, owner: Address, token_id: BytesN<32>) -> u64 {
        let key = BalanceKey { owner, token_id };
        env.storage().persistent()
            .get(&Key::Balance(key))
            .unwrap_or(0)
    }

    /// Retorna el supply total de un tipo de token.
    pub fn total_supply(env: Env, token_id: BytesN<32>) -> u64 {
        env.storage().persistent()
            .get(&Key::Supply(token_id))
            .unwrap_or(0)
    }

    /// Retorna la metadata de un tipo de token.
    pub fn get_token(env: Env, token_id: BytesN<32>) -> Option<TokenMetadata> {
        env.storage().persistent().get(&Key::Token(token_id))
    }

    /// Retorna los token_ids que tiene un centro con balance > 0 (puede tener balance 0 si transfirió todo).
    pub fn get_inventory(env: Env, center: Address) -> Vec<BytesN<32>> {
        env.storage().persistent()
            .get(&Key::Inventory(center))
            .unwrap_or(Vec::new(&env))
    }

    // ─── Helpers privados ──────────────────────────────────────────────────────

    fn require_admin(env: &Env) -> Result<(), Error> {
        let admin: Address = env.storage().instance()
            .get(&Key::Admin)
            .ok_or(Error::Unauthorized)?;
        admin.require_auth();
        Ok(())
    }

    fn add_to_inventory(env: &Env, owner: Address, token_id: BytesN<32>) {
        let mut inv: Vec<BytesN<32>> = env.storage().persistent()
            .get(&Key::Inventory(owner.clone()))
            .unwrap_or(Vec::new(env));

        let mut already_has = false;
        for i in 0..inv.len() {
            if inv.get(i).unwrap() == token_id {
                already_has = true;
                break;
            }
        }

        if !already_has {
            inv.push_back(token_id);
            env.storage().persistent().set(&Key::Inventory(owner), &inv);
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        BytesN, Env, String,
    };

    fn setup_env() -> Env {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|l| l.timestamp = 1_700_000_000u64);
        env
    }

    fn make_contract(env: &Env) -> ContratoSftClient {
        ContratoSftClient::new(env, &env.register(ContratoSft, ()))
    }

    fn make_token_id(env: &Env, item_id: u64) -> BytesN<32> {
        let mut bytes = soroban_sdk::Bytes::new(env);
        for b in item_id.to_be_bytes() {
            bytes.push_back(b);
        }
        env.crypto().sha256(&bytes).into()
    }

    fn make_metadata(env: &Env, item_id: u64) -> TokenMetadata {
        TokenMetadata {
            attributes_hash: BytesN::from_array(env, &[0u8; 32]),
            categoria: String::from_str(env, "Alimentos"),
            item_id,
            nombre: String::from_str(env, "Arroz 1kg"),
        }
    }

    // En Soroban SDK v22, los métodos del cliente generado que retornan Result<(), Error>
    // tienen dos variantes:
    //   - contract.method(...) → () — panics on error
    //   - contract.try_method(...) → Result<Result<T, Error>, soroban_sdk::Error>
    // Para verificar errores usamos try_*.

    #[test]
    fn test_initialize() {
        let env = setup_env();
        let contract = make_contract(&env);
        let admin = Address::generate(&env);

        contract.initialize(&admin);
        // Segunda inicialización falla con AlreadyInitialized
        // try_* retorna Result<Result<T, ConversionError>, Result<Error, InvokeError>>
        // Los errores del contrato van en Err(Ok(Error::...))
        let result = contract.try_initialize(&admin);
        assert!(matches!(result, Err(Ok(Error::AlreadyInitialized))));
    }

    #[test]
    fn test_mint_acumula_balance() {
        let env = setup_env();
        let contract = make_contract(&env);
        let admin = Address::generate(&env);
        let centro = Address::generate(&env);

        contract.initialize(&admin);

        let token_id = make_token_id(&env, 1);
        let metadata = make_metadata(&env, 1);
        let firma = BytesN::from_array(&env, &[1u8; 32]);

        // Primer mint
        contract.mint(&centro, &token_id, &metadata, &50u64, &firma);
        assert_eq!(contract.balance_of(&centro, &token_id), 50u64);
        assert_eq!(contract.total_supply(&token_id), 50u64);

        // Segundo mint del mismo token (otra donación) — se acumula
        contract.mint(&centro, &token_id, &metadata, &30u64, &firma);
        assert_eq!(contract.balance_of(&centro, &token_id), 80u64);
        assert_eq!(contract.total_supply(&token_id), 80u64);
    }

    #[test]
    fn test_transfer_entre_centros() {
        let env = setup_env();
        let contract = make_contract(&env);
        let admin = Address::generate(&env);
        let centro_a = Address::generate(&env);
        let centro_b = Address::generate(&env);

        contract.initialize(&admin);

        let token_id = make_token_id(&env, 1);
        let metadata = make_metadata(&env, 1);
        let firma = BytesN::from_array(&env, &[1u8; 32]);
        let motivo = BytesN::from_array(&env, &[2u8; 32]);

        contract.mint(&centro_a, &token_id, &metadata, &80u64, &firma);
        contract.transfer(&centro_a, &centro_b, &token_id, &20u64, &motivo);

        assert_eq!(contract.balance_of(&centro_a, &token_id), 60u64);
        assert_eq!(contract.balance_of(&centro_b, &token_id), 20u64);
        // Supply no cambia con transfer
        assert_eq!(contract.total_supply(&token_id), 80u64);
    }

    #[test]
    fn test_transfer_balance_insuficiente() {
        let env = setup_env();
        let contract = make_contract(&env);
        let admin = Address::generate(&env);
        let centro_a = Address::generate(&env);
        let centro_b = Address::generate(&env);

        contract.initialize(&admin);

        let token_id = make_token_id(&env, 1);
        let metadata = make_metadata(&env, 1);
        let firma = BytesN::from_array(&env, &[1u8; 32]);
        let motivo = BytesN::from_array(&env, &[2u8; 32]);

        contract.mint(&centro_a, &token_id, &metadata, &10u64, &firma);

        let result = contract.try_transfer(&centro_a, &centro_b, &token_id, &20u64, &motivo);
        assert!(matches!(result, Err(Ok(Error::InsufficientBalance))));
    }

    #[test]
    fn test_burn_reduce_supply() {
        let env = setup_env();
        let contract = make_contract(&env);
        let admin = Address::generate(&env);
        let centro = Address::generate(&env);

        contract.initialize(&admin);

        let token_id = make_token_id(&env, 1);
        let metadata = make_metadata(&env, 1);
        let firma = BytesN::from_array(&env, &[1u8; 32]);
        let commitment = BytesN::from_array(&env, &[3u8; 32]);
        let sig_hash = BytesN::from_array(&env, &[4u8; 32]);

        contract.mint(&centro, &token_id, &metadata, &50u64, &firma);
        contract.burn(&centro, &token_id, &10u64, &commitment, &sig_hash, &1u64);

        assert_eq!(contract.balance_of(&centro, &token_id), 40u64);
        assert_eq!(contract.total_supply(&token_id), 40u64);
    }

    #[test]
    fn test_burn_balance_insuficiente() {
        let env = setup_env();
        let contract = make_contract(&env);
        let admin = Address::generate(&env);
        let centro = Address::generate(&env);

        contract.initialize(&admin);

        let token_id = make_token_id(&env, 1);
        let metadata = make_metadata(&env, 1);
        let firma = BytesN::from_array(&env, &[1u8; 32]);
        let commitment = BytesN::from_array(&env, &[3u8; 32]);
        let sig_hash = BytesN::from_array(&env, &[4u8; 32]);

        contract.mint(&centro, &token_id, &metadata, &5u64, &firma);

        let result = contract.try_burn(&centro, &token_id, &10u64, &commitment, &sig_hash, &1u64);
        assert!(matches!(result, Err(Ok(Error::InsufficientBalance))));
    }

    #[test]
    fn test_inventario_multiples_tokens() {
        let env = setup_env();
        let contract = make_contract(&env);
        let admin = Address::generate(&env);
        let centro = Address::generate(&env);

        contract.initialize(&admin);

        let token1 = make_token_id(&env, 1);
        let token2 = make_token_id(&env, 2);
        let meta1 = make_metadata(&env, 1);
        let meta2 = make_metadata(&env, 2);
        let firma = BytesN::from_array(&env, &[1u8; 32]);

        contract.mint(&centro, &token1, &meta1, &10u64, &firma);
        contract.mint(&centro, &token2, &meta2, &20u64, &firma);
        // Mint repetido del mismo token no duplica en inventario
        contract.mint(&centro, &token1, &meta1, &5u64, &firma);

        let inv = contract.get_inventory(&centro);
        assert_eq!(inv.len(), 2);
    }

    #[test]
    fn test_tokens_distintos_independientes() {
        let env = setup_env();
        let contract = make_contract(&env);
        let admin = Address::generate(&env);
        let centro = Address::generate(&env);

        contract.initialize(&admin);

        let token1 = make_token_id(&env, 1);
        let token2 = make_token_id(&env, 2);
        let meta1 = make_metadata(&env, 1);
        let meta2 = make_metadata(&env, 2);
        let firma = BytesN::from_array(&env, &[1u8; 32]);

        contract.mint(&centro, &token1, &meta1, &100u64, &firma);
        contract.mint(&centro, &token2, &meta2, &50u64, &firma);

        assert_eq!(contract.balance_of(&centro, &token1), 100u64);
        assert_eq!(contract.balance_of(&centro, &token2), 50u64);
        assert_eq!(contract.total_supply(&token1), 100u64);
        assert_eq!(contract.total_supply(&token2), 50u64);
    }
}
