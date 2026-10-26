/**
 * Lectura y actualización de backend/.env para los scripts de Stellar.
 * Solo reemplaza (o agrega al final) las claves indicadas; el resto del archivo queda igual.
 */
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.resolve(__dirname, '../../.env');

function cargar() {
  require('dotenv').config({ path: ENV_PATH });
}

function actualizar(valores) {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`No existe ${ENV_PATH}. Copiá backend/.env.example a backend/.env primero.`);
  }
  let contenido = fs.readFileSync(ENV_PATH, 'utf8');
  for (const [clave, valor] of Object.entries(valores)) {
    const linea = `${clave}=${valor}`;
    const regex = new RegExp(`^${clave}=.*$`, 'm');
    contenido = regex.test(contenido) ? contenido.replace(regex, linea) : `${contenido.replace(/\n?$/, '\n')}${linea}\n`;
    process.env[clave] = String(valor);
  }
  fs.writeFileSync(ENV_PATH, contenido);
}

module.exports = { ENV_PATH, cargar, actualizar };
