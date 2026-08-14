# Auditoría comparativa: Acta de constitución vs. código

## Conclusión ejecutiva

El acta no coincide plenamente con el estado actual del código. La plataforma contiene una parte importante de la interfaz y del modelo logístico, pero varios compromisos centrales están incompletos o directamente contradichos por la implementación.

Los desvíos críticos son:

1. El acta exige Firebase, pero el sistema utiliza MySQL con Sequelize.
2. El alta y seguimiento de envíos no funcionan: los endpoints responden deliberadamente `409`.
3. No existe un ABM completo de donantes.
4. El formulario de donantes no captura nombre, teléfono y ciudad; solamente correo electrónico.
5. El inventario no implementa los estados `Recibido`, `Preparado` y `Disponible`.
6. No se encontró infraestructura Docker Compose, Nginx, Certbot ni CI/CD.
7. Existen funcionalidades blockchain, QR, DNI, firma manuscrita y asistente LLM que no pertenecen al alcance del acta.
8. El Dashboard existe, pero no muestra exactamente todas las métricas prometidas y varias series están vacías.

Por lo tanto, no se recomienda aprobar el acta como una descripción fiel del software actual sin corregir el acta o completar el código.

## 1. Comparativa funcional

| Requisito del acta | Estado | Evidencia y observaciones |
|---|---|---|
| Aplicación web en React | Implementado | El frontend usa React, Vite y React Router. |
| Interfaz responsive | Implementado parcialmente | Hay breakpoints `sm`, `md`, `lg` y menú móvil. No se encontraron pruebas formales en Chrome, Firefox y Edge. |
| Dashboard con métricas | Parcial | Existe `frontend/src/pages/Dashboard.jsx`, conectado a `/api/dashboard/summary`. |
| Total de donaciones | Implementado | Se calcula mediante `Donation.count()`. |
| Insumos disponibles | Implementado | Se suma `available_quantity` en `dashboardController.js`. |
| Envíos realizados | Parcial | La métrica cuenta envíos confirmados, pero actualmente no se pueden crear ni confirmar desde la API. |
| Destinos alcanzados | Backend solamente | El backend devuelve `reachedDestinations`, pero el frontend presenta “Categorías Activas” en lugar de esa tarjeta. |
| Métricas en tiempo real | Parcial | Los totales se consultan al abrir el Dashboard, pero no hay WebSockets, suscripciones ni actualización automática. Las series semanales y recientes están vacías. |
| Registro completo de donantes | No implementado | No hay pantalla ni endpoints independientes para administrar donantes. |
| Nombre del donante | No reflejado en la UI | El backend acepta opcionalmente `donor_name`, pero el formulario no lo envía. Se termina usando “Donante anónimo”. |
| Teléfono/email | Parcial | Sólo se captura correo electrónico. No existe un campo independiente para teléfono. |
| Ciudad del donante | No reflejado en la UI | El modelo contiene `city`, pero el formulario no la solicita. El backend usa “Sin especificar”. |
| Tipo de donación | Implementado parcialmente | Se selecciona categoría e insumo, pero el mecanismo de atributos dinámicos está desalineado con el backend actual. |
| Inventario de insumos | Implementado parcialmente | Existe listado, búsqueda, categorías, cantidades y exportación CSV. |
| Estado “Recibido” | No implementado | El modelo `Item` sólo conserva nombre, categoría y cantidad. |
| Estado “Preparado” | No implementado | No existe un campo de estado logístico. |
| Estado “Disponible” | Implícito solamente | Se representa mediante cantidad disponible, no como estado seleccionable. |
| Alta de envíos | No funcional | Todos los endpoints de preparación y finalización apuntan a una función que devuelve `409`. |
| Listado de envíos | Parcial | El backend puede listar registros existentes, pero la pantalla espera propiedades del modelo anterior. |
| Fecha de envío | En el modelo | `Shipment.date` existe, aunque el alta no funciona. |
| Destino | Parcial | Se representa mediante `reception_center_id`; no existe una entidad separada llamada `Destino`. |
| Insumos y cantidades enviadas | En el modelo | Existen `ShipmentDetail.supply_id` y `quantity_sent`. |
| Estado del envío | Insuficiente | Sólo existe el booleano `confirmed`; no hay estados preparado, enviado, en tránsito o entregado. |
| Ver envío | Parcial | Existe un listado desplegable, pero sus campos no coinciden con la respuesta actual del backend. |
| Editar envío | No implementado | No hay endpoint `PUT/PATCH` para envíos. |
| Eliminar envío | No implementado | No hay endpoint `DELETE` para envíos. |
| Insumos prioritarios | No encontrado | No hay panel estático identificado para prioridades actuales. |
| Puntos de recepción | Parcial | Existe administración de centros, pero no el panel estático de apoyo descrito en el acta. |
| Acceso interno restringido | Implementado | Las rutas administrativas usan JWT y `PrivateRoute`. |
| Portal público para donantes excluido | Parcialmente contradicho | Hay rutas públicas de confirmación QR y una ruta pública de trazabilidad, aunque varias funciones están deshabilitadas. |
| Sin pagos | Cumplido | No se encontraron pasarelas de pago ni donaciones monetarias. |
| Sin GPS o integración logística externa | Cumplido parcialmente | No hay rastreo GPS operativo, pero existen coordenadas e integración blockchain externa. |
| Sin aplicación móvil nativa | Cumplido | Es una aplicación web responsive. |

## 2. Registro de donantes

El acta promete registrar nombre, teléfono o email, ciudad y tipo de donación. El formulario real sólo conserva y envía el correo electrónico del donante.

El backend posee un modelo `Donor` con los campos `name`, `contact`, `city` y `registered_by`. Sin embargo, al registrar una donación completa los datos ausentes con valores automáticos:

```js
name: req.body.donor_name || 'Donante anónimo'
city: req.body.city || 'Sin especificar'
```

No existen rutas equivalentes a:

```text
GET    /api/donors
POST   /api/donors
PUT    /api/donors/:id
DELETE /api/donors/:id
```

Por tanto, el módulo de registro de donantes y el ABM completo de donantes deben marcarse como no implementados.

## 3. Inventario

El inventario permite listar insumos, consultar un insumo, modificar nombre, categoría o cantidad, eliminarlo, buscar, filtrar, exportar CSV y consultar stock por categoría.

No obstante, el modelo `Item` sólo define:

```text
name
available_quantity
category_id
```

No existe un estado logístico como:

```text
RECIBIDO | PREPARADO | DISPONIBLE
```

La pantalla presenta estados blockchain (`Pendiente`, `Minteado`, `Error`) en lugar de estados logísticos. Por ello, la expresión del acta “mantener un control de inventario con estados básicos de preparación” no está reflejada.

## 4. Envíos y distribuciones

Este es el principal incumplimiento funcional. La pantalla `NuevaDistribucion.jsx` intenta ejecutar:

1. `/distributions/prepare`
2. `/distributions/:id/identify-manual`
3. `/distributions/:id/sign`
4. `/distributions/:id/finalize`

Todos esos controladores están asignados a una función que devuelve:

```js
res.status(409).json({
  error: 'El nuevo modelo utiliza envíos con detalles; este flujo legado no está disponible'
});
```

El modelo nuevo de envíos está razonablemente planteado:

- `Shipment`: fecha, destino, usuario registrador y confirmación.
- `ShipmentDetail`: insumo y cantidad enviada.
- Al confirmar, descuenta stock mediante una transacción SQL.

Sin embargo, no existe un endpoint funcional que construya el envío y sus detalles.

En consecuencia:

- El hito “Registro Histórico de Envíos Funcional” no puede considerarse cumplido.
- El Dashboard mostrará cero envíos confirmados salvo que los datos se inserten externamente.
- Las acciones crear, editar y eliminar envíos prometidas en el acta no están disponibles.

## 5. Dashboard

El Dashboard calcula total de donaciones, cantidad total disponible, envíos confirmados, destinos alcanzados, categorías y stock por categoría.

Sin embargo, la respuesta incluye:

```js
weeklyDonations: [],
recentDonations: [],
recentDistributions: [],
```

La interfaz muestra cuatro tarjetas: Total Donaciones, Ítems en Stock, Distribuciones y Categorías Activas. No muestra “Destinos alcanzados”, aunque el backend lo calcula.

La frase “métricas en tiempo real” debería ajustarse a “métricas actualizadas al consultar el panel”, porque no existe actualización push ni refresco periódico.

## 6. Backend y ABM

La API REST en JavaScript está implementada con Express 5.

| Entidad | Alta | Consulta | Modificación | Baja | Resultado |
|---|---:|---:|---:|---:|---|
| Donante | Sólo indirecta | Sólo dentro de donaciones | No | No | No cumple |
| Insumo | Sólo indirecta | Sí | Sí | Sí | Parcial |
| Envío | No funcional | Sí | No | No | No cumple |
| Categoría | Sí | Sí | Sí | Sí | Cumple |
| Centro/destino | Sí | Sí | Sí | Sí | Cumple |
| Usuario | Sí | Sí | Sí | Sí | Cumple |

El manejo de errores y las validaciones están implementados parcialmente mediante `express-validator`, restricciones de Sequelize y un middleware general. No todas las rutas validan adecuadamente todos sus campos.

## 7. Base de datos

El acta establece Firebase Realtime Database o Firestore. El código utiliza:

- Sequelize.
- `mysql2`.
- Dialecto MySQL.
- Variables `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`.

No hay dependencias, configuración ni referencias a Firebase o Firestore. Esta es una contradicción directa.

Debe corregirse el acta para declarar “MySQL con Sequelize” o migrarse el sistema completo a Firebase. Por el estado actual del proyecto, corregir el acta es la opción coherente.

El modelo contempla Donante, Insumo, Categoría y Envío. “Destino” no es una entidad independiente: se representa mediante `Center` o `CentroRecepcion`.

## 8. Infraestructura y despliegue

El acta exige máquina virtual Ubuntu, Docker Compose, contenedores, Nginx y certificado SSL mediante Certbot.

No se encontraron:

- `Dockerfile`.
- `docker-compose.yml` o `compose.yml`.
- Configuración de Nginx.
- Configuración o scripts de Certbot.
- Manifiestos de despliegue equivalentes.

También hay una inconsistencia local:

- El backend usa por defecto el puerto `3001`.
- Vite redirige `/api` y `/uploads` al puerto `3002`.
- El `.env.example` declara `PORT=3001`.

Debe unificarse la configuración de puertos.

## 9. Git, ramas y CI/CD

El repositorio contiene las ramas `main`, `proyecto` y una rama remota relacionada con blockchain. `main` y `proyecto` actualmente apuntan al mismo commit.

No se encontraron workflows de GitHub Actions, Jenkinsfile, pipeline de GitLab u otra configuración CI/CD. Tampoco puede verificarse localmente el uso sistemático de pull requests.

Evaluación:

- Repositorio en GitHub: aparentemente cumplido.
- Ramas diferenciadas: parcialmente cumplido.
- Pull requests: no verificable con la copia local.
- Servidor CI/CD y despliegue continuo: no encontrado.

## 10. Seguridad y datos personales

La autenticación básica está implementada con JWT, contraseñas cifradas mediante bcrypt, roles `VOLUNTARIO` y `ADMINISTRADOR` y middleware de autorización.

Observaciones:

- El JWT se almacena en `localStorage`, más expuesto frente a XSS que una cookie `HttpOnly`.
- El sistema depende de una configuración segura de `JWT_SECRET`.
- No se observaron recuperación de contraseña, revocación de sesiones ni políticas fuertes de complejidad.
- La interfaz heredada solicita DNI y firma manuscrita del receptor.
- También se almacenan nombre, contacto, ciudad y correo de donantes.

El DNI y especialmente la firma manuscrita elevan el nivel de sensibilidad. Si estos campos se mantienen, la declaración de que no se almacenan datos personales sensibles de alto riesgo debe revisarse y acompañarse con políticas de tratamiento, retención y acceso.

## 11. Funcionalidades no contempladas en el acta

El repositorio contiene funcionalidades adicionales:

- Blockchain Stellar/Soroban.
- Tokenización o “minteo” de inventario.
- Trazabilidad pública blockchain.
- Historial de transacciones.
- Transferencias entre centros.
- QR público para recepción.
- Firma manuscrita.
- Registro de DNI del receptor.
- Auditoría de integridad.
- Asistente LLM.
- Envíos de correo.
- Carga de imágenes.
- Exportación CSV.

Algunas están deshabilitadas o incompletas, pero siguen visibles en rutas, navegación, dependencias o código fuente.

Esto contradice el nuevo propósito que elimina el foco en trazabilidad blockchain. Aunque la ruta principal muestra la nueva landing, todavía existe una ruta pública `/trazabilidad`, además de referencias blockchain en inventario y distribuciones.

## 12. Redacción técnica recomendada

Si se desea que el acta describa honestamente el software actual, se recomienda reemplazar su sección técnica por:

> **Frontend:** Aplicación web desarrollada en React y Vite, con una interfaz responsive basada en Tailwind CSS. Contempla panel de métricas, registro de donaciones, consulta y administración de inventario, gestión de centros y administración de usuarios.
>
> **Backend:** API REST desarrollada en JavaScript con Node.js y Express. Utiliza Sequelize como ORM y MySQL como base de datos relacional. Incluye autenticación mediante JWT, cifrado de contraseñas con bcrypt, validaciones básicas y manejo centralizado de errores.
>
> **Modelo de datos:** Entidades principales: Usuario, Donante, Donación, Insumo, Categoría, Centro de Recepción, Envío y Detalle de Envío.
>
> **Infraestructura:** Pendiente de definición e implementación. El repositorio actual no incluye Docker Compose, Nginx, Certbot ni un pipeline CI/CD.
>
> **Seguridad:** Acceso restringido mediante usuario y contraseña, roles de voluntario y administrador y protección JWT de las operaciones internas.

No debería afirmarse todavía:

- ABM completo de donantes y envíos.
- Estados logísticos del inventario.
- Registro funcional de envíos.
- Firebase.
- Docker Compose.
- Nginx y Certbot.
- CI/CD continuo.
- Compatibilidad comprobada en Chrome, Firefox y Edge.
- Métricas completas “en tiempo real”.
- Ausencia de datos personales de riesgo mientras permanezcan DNI y firma.

## Dictamen final

El acta refleja correctamente la intención general del proyecto, pero no describe fielmente su implementación actual.

- Núcleo general y frontend: parcialmente alineados.
- Inventario: parcialmente alineado.
- Donantes: incompleto.
- Envíos: modelados, pero no operativos.
- Dashboard: parcial.
- Base de datos: contradicción total.
- Infraestructura y CI/CD: no encontrados.
- Seguridad básica: mayormente implementada.
- Alcance adicional: considerable y no documentado.

La prioridad debe ser decidir si se ajustará el código al acta o el acta al código. Actualmente, la documentación promete más funcionalidad logística e infraestructura de la que el repositorio ofrece, mientras que el repositorio conserva más complejidad blockchain y datos personales de la que el acta reconoce.

---

**Nota metodológica:** esta auditoría se realizó mediante inspección estática del repositorio y su configuración. No incluyó pruebas completas con una base de datos poblada ni verificación de infraestructura externa no versionada.
