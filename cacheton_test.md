Plan de Pruebas E2E: Migración a SFT y Arquitectura Blockchain-First
Directivas Iniciales y Restricciones para el Agente de Testing:

Estado del Repositorio: Absolutamente todo el código a testear se encuentra sin commitear (en el working tree o staging area). Debes analizar los archivos modificados localmente para inferir la lógica.

Adaptabilidad: No asumas URIs de endpoints, nombres de variables en el payload, ni puertos específicos. Debes escanear los controladores (Node.js/Express u otro framework) en los archivos no commiteados para descubrir las rutas exactas y los esquemas de datos requeridos.

Alcance: Las pruebas deben simular llamadas HTTP reales desde la perspectiva del frontend, disparar la lógica de negocio en el backend, y verificar la persistencia dual e indivisible (Base de Datos Relacional + Soroban Blockchain).

Entregable: Al finalizar la ejecución, debes generar obligatoriamente un archivo llamado reporte_test_sft.md detallando los resultados.

Fase 1: Reconocimiento Dinámico y Configuración
Escaneo de Controladores: Inspecciona los archivos modificados (ej. donationController, donationReceptionController, distributionController, transferController) e identifica las rutas REST exactas para la creación de intenciones, recepción, transferencia y distribución.

Preparación del Entorno: Verifica que la variable de entorno STELLAR_ENABLED=true esté configurada para forzar el flujo productivo.

Identificación de Contratos: Localiza en las variables de entorno o configuración el SOROBAN_CONTRACT_SFT desplegado para las pruebas.

Fase 2: Ejecución de Caminos de Usuario (El Ciclo de Vida SFT)
El agente debe ejecutar el siguiente flujo de forma secuencial, extrayendo los IDs de las respuestas HTTP para usarlos en el siguiente paso.

Intención de Donación (Status Quo)

Acción: Simular un POST para crear una intención de donación (el ítem no ha llegado).

Verificación DB: Confirmar que el registro existe en MySQL.

Verificación Blockchain: Asegurar que NO se haya emitido ninguna transacción ni evento en Soroban (el mint aún no debe ocurrir).

Recepción y Acuñación (Mint)

Acción: Simular el POST/PUT de recepción física en el Centro A (llamada a finalizeInternal).

Verificación DB: Confirmar actualización en MySQL y capturar el blockchain_tx_id o anchored_tx_id devuelto.

Verificación Blockchain: * Validar que el token_id utilizado sea exactamente el SHA256(item_id).

Consultar a Soroban y verificar que el balance SFT del Centro A haya incrementado en la cantidad exacta recibida.

Verificar la existencia del evento {mint}.

Transferencia entre Centros

Acción: Simular la transferencia de un porcentaje de los ítems del Centro A al Centro B.

Verificación DB: Confirmar la existencia de la entidad TokenTransfer con su respectivo blockchain_tx_id.

Verificación Blockchain: Consultar los balances en Soroban de ambos centros. El Centro A debe haber disminuido su balance, y el Centro B debe haberlo incrementado exactamente en la cantidad transferida. Verificar evento {transfer}.

Distribución Final (Burn)

Acción: Simular la entrega al beneficiario final desde el Centro B.

Verificación DB: Confirmar que el inventario del ítem en MySQL se redujo y la tabla de distribuciones se actualizó con el blockchain_tx_id.

Verificación Blockchain: Verificar en Soroban que el balance del Centro B disminuyó y que el total_supply del token_id también se redujo. Verificar evento {burn}.

Fase 3: Pruebas de Resiliencia y "Fail-Fast" (Strict Blockchain)
Esta fase es crítica para garantizar que no haya graceful degradation.

Simulación de Caída de Red/Nodo: Interrumpe intencionalmente la conexión del backend al nodo RPC de Soroban (ej. cambiando temporalmente la URL del RPC a una inválida en el entorno del agente).

Intento de Mutación de Estado: Intenta disparar un evento de recepción física (Mint) o Transferencia.

Verificación de Fallo Estricto:

Assertion HTTP: El endpoint debe retornar un error HTTP 503 (Service Unavailable) o 500.

Assertion DB: Consultar la base de datos MySQL para confirmar que no se guardó absolutamente nada (el rollback de la transacción de DB debió ejecutarse si Soroban falló).