// src/payments/transbank.js
'use strict';

let WebpayPlus = null;
let Options = null;
let Environment = null;
let IntegrationCommerceCodes = null;
let IntegrationApiKeys = null;

try {
  const pkg = require('transbank-sdk');
  WebpayPlus = pkg.WebpayPlus;
  Options = pkg.Options;
  Environment = pkg.Environment;
  IntegrationCommerceCodes = pkg.IntegrationCommerceCodes;
  IntegrationApiKeys = pkg.IntegrationApiKeys;
} catch (_) {
  try {
    const pkg = require('@transbank/sdk');
    WebpayPlus = pkg.WebpayPlus;
    Options = pkg.Options;
    Environment = pkg.Environment;
    IntegrationCommerceCodes = pkg.IntegrationCommerceCodes;
    IntegrationApiKeys = pkg.IntegrationApiKeys;
  } catch (err) {
    WebpayPlus = null;
  }
}

// Credenciales oficiales de prueba de Transbank Webpay Plus
const TEST_COMMERCE_CODE = (IntegrationCommerceCodes && IntegrationCommerceCodes.WEBPAY_PLUS) || '597055555532';
const TEST_API_KEY = (IntegrationApiKeys && IntegrationApiKeys.WEBPAY) || '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C';

function getTransactionClient() {
  if (!WebpayPlus) {
    const error = new Error('El paquete SDK de Transbank no esta instalado');
    error.code = 'TRANSBANK_SDK_MISSING';
    throw error;
  }

  const isProduction = process.env.TRANSBANK_ENV === 'production';

  // 1. MODO PRODUCCION: requiere credenciales reales obligatorias
  if (isProduction) {
    const commerceCode = (process.env.TRANSBANK_COMMERCE_CODE || '').trim();
    const apiKey = (process.env.TRANSBANK_API_KEY || '').trim();

    if (!commerceCode || !apiKey) {
      throw new Error('Faltan variables TRANSBANK_COMMERCE_CODE o TRANSBANK_API_KEY para ambiente de produccion');
    }

    if (Options && Environment && Environment.Production) {
      return new WebpayPlus.Transaction(new Options(commerceCode, apiKey, Environment.Production));
    }

    if (typeof WebpayPlus.Transaction.buildForProduction === 'function') {
      return WebpayPlus.Transaction.buildForProduction(commerceCode, apiKey);
    }
  }

  // 2. MODO INTEGRACION / TESTING
  // Metodo preferido en transbank-sdk 3.x/4.x:
  if (typeof WebpayPlus.Transaction.buildForIntegration === 'function') {
    return WebpayPlus.Transaction.buildForIntegration(TEST_COMMERCE_CODE, TEST_API_KEY);
  }

  // Si existe configuracion global de pruebas:
  if (typeof WebpayPlus.configureForTesting === 'function') {
    WebpayPlus.configureForTesting();
    return new WebpayPlus.Transaction();
  }

  // Fallback con constructor Options
  const targetEnv = (Environment && Environment.Integration) ? Environment.Integration : 'https://webpay3gint.transbank.cl';
  if (Options) {
    return new WebpayPlus.Transaction(new Options(TEST_COMMERCE_CODE, TEST_API_KEY, targetEnv));
  }

  return new WebpayPlus.Transaction();
}

// Inicia una transaccion en Webpay Plus
async function createTransaction({ buyOrder, sessionId, amount, returnUrl }) {
  const tx = getTransactionClient();
  const response = await tx.create(buyOrder, sessionId, Math.round(Number(amount)), returnUrl);

  return {
    token: response.token || response.token_ws,
    url: response.url,
    raw: response,
  };
}

// Confirma el pago tras el retorno del usuario desde el formulario Webpay
async function commitTransaction(token) {
  const tx = getTransactionClient();
  const response = await tx.commit(token);
  return { raw: response, response };
}

// Realiza una devolucion o anulacion
async function refundTransaction(token, amount) {
  const tx = getTransactionClient();
  const response = await tx.refund(token, Math.round(Number(amount)));
  return { raw: response, response };
}

module.exports = {
  createTransaction,
  commitTransaction,
  refundTransaction,
};