// services/gcs.js
'use strict';

const { Storage } = require('@google-cloud/storage');

const projectId = process.env.GCP_PROJECT_ID;
const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;

// Validacion de variables requeridas para Google Cloud Storage
if (!projectId || !serviceAccountJson) {
  console.warn('[GCS] Variables de GCP incompletas. El servicio de exportacion estara inactivo.');
}

// Parseo de las credenciales de la cuenta de servicio (Render las almacena como string)
let credentials = null;

if (serviceAccountJson) {
  try {
    credentials = JSON.parse(serviceAccountJson);
  } catch (err) {
    console.error('[GCS] Error al parsear credenciales de GCP:', err.message);
  }
}

// Inicializacion del cliente de almacenamiento
const storageOptions = {};
if (projectId) storageOptions.projectId = projectId;
if (credentials) storageOptions.credentials = credentials;

const storage = new Storage(storageOptions);

console.log('[GCS] Cliente inicializado para bucket:', process.env.GCS_BUCKET_NAME || '(no definido)');

module.exports = storage;