# Acción del Sur — Resumen ejecutivo

## Qué es

Acción del Sur es un sistema web para organizar la ayuda que se recibe y se distribuye durante
emergencias climáticas. Reemplaza planillas y mensajes sueltos por un único lugar donde el equipo
registra qué llega, dónde está y adónde se envía.

Es una iniciativa de [CGIC](https://cgic-argentina.org/) y fue presentada en EmprendeU.

## Qué problema resuelve

En una emergencia llegan muchas donaciones, de muchas personas, a varios centros a la vez. Es
difícil saber qué hay, qué falta y si lo donado llegó a destino. Y quienes donan quieren
confianza: saber que su ayuda se usó como corresponde.

## Qué hace

- **Registra donaciones**: quién donó, qué y cuánto. En las recepciones con QR, el donante recibe
  un link donde puede ver qué se aceptó de su donación y qué no, y por qué.
- **Ordena el inventario** por categoría y por centro, con un estado simple para cada insumo:
  recibido, preparado o disponible para enviar.
- **Coordina los movimientos**: transferencias entre centros y envíos a los puntos donde se
  entrega la ayuda. El sistema no deja enviar lo que no hay.
- **Muestra qué hace falta**: el panel de apoyo indica los insumos con menos stock y los centros
  que están recibiendo.
- **Da transparencia verificable**: cada movimiento queda registrado en una blockchain pública
  (Stellar). Ese registro no se puede borrar ni modificar, así que cualquiera puede comprobar que
  el inventario que informa la organización es real.

## ¿Qué significa "trazabilidad en blockchain"?

Pensalo como un libro de actas público, sellado y copiado en miles de computadoras. Cada vez que
entra, se mueve o sale un insumo, el sistema escribe una línea en ese libro. Nadie, ni siquiera
la propia organización, puede arrancar una hoja ni cambiar lo escrito. Desde la aplicación se
puede abrir cada insumo, ver su historia completa y confirmar que coincide con el libro.

Si la conexión con la blockchain falla, el sistema sigue funcionando normalmente y la registra
después. La operación diaria nunca se frena por ese motivo.

## Para quién es

- **Voluntarios y voluntarias**: registran donaciones, preparan el inventario y arman envíos.
- **Coordinación (administradores)**: además gestionan usuarios, centros y categorías.
- **Donantes y público**: pueden seguir su donación y verificar la transparencia sin tener cuenta.

## Estado actual (octubre 2026)

| | |
|---|---|
| Funcionalidad | Completa para el flujo donación → inventario → transferencia → envío, con trazabilidad. |
| Pruebas | Prueba automática de punta a punta (43 verificaciones) superada, incluida la blockchain. |
| Instalación | Funcionando en el servidor del equipo: `http://10.147.19.102:5020` (red interna ZeroTier). |
| Blockchain | Red de pruebas de Stellar (*testnet*). Es gratuita, pero no es la red definitiva. |
| Uso real | Todavía no. Tiene datos de demostración. |

## Qué falta para usarlo en una emergencia real

1. **Publicarlo con dominio y HTTPS** para poder acceder desde cualquier lugar de forma segura.
2. **Crear los usuarios reales** y cambiar las contraseñas de demostración.
3. **Pasar a la red principal de Stellar** (*mainnet*). Tiene un costo muy bajo por operación,
   pero hay que mantener fondos en la cuenta de la organización.
4. **Probarlo con un centro piloto** y ajustar según la experiencia de quienes lo usen.

El detalle técnico está en [estado-y-pendientes.md](estado-y-pendientes.md).
