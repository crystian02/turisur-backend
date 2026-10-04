'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('./controller');

// Crear orden de compra
router.post('/orders', async (req, res) => {
  try {
    const result = await ctrl.createOrderOnly(req.body || {});
    if (result.status === 'error') {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[POST /orders] Error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Iniciar pago en Webpay Plus
router.post('/payments', async (req, res) => {
  try {
    const result = await ctrl.initPaymentForOrder(req.body || {});
    if (result.status === 'error') {
      return res.status(400).json(result);
    }

    return res.status(200).json({
      status: 'ok',
      paymentId: result.paymentId,
      url: result.url,
      token: result.token,
      order: result.order,
    });
  } catch (err) {
    console.error('[POST /payments] Error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Confirmacion de pago y retorno a la aplicacion movil
async function handleConfirm(req, res) {
  try {
    const token =
      req.body?.token_ws ||
      req.query?.token_ws;

    const tbkAbortToken =
      req.body?.TBK_TOKEN ||
      req.query?.TBK_TOKEN;

    const orderId =
      req.body?.TBK_ORDEN_COMPRA ||
      req.body?.orderId ||
      req.query?.TBK_ORDEN_COMPRA ||
      req.query?.orderId ||
      null;

    const appScheme = process.env.APP_SCHEME || 'turisur';

    // Si el usuario cancelo la transaccion en el formulario de Webpay
    if (!token && tbkAbortToken) {
      const abortData = Buffer.from(JSON.stringify({
        buy_order: orderId,
        token: tbkAbortToken,
        status: 'aborted',
      })).toString('base64');

      const redirectAbort = `${appScheme}://payment_result?status=rejected&data=${encodeURIComponent(abortData)}`;
      return res.send(`
        <!doctype html>
        <html>
          <head><meta charset="utf-8" /></head>
          <body>
            <script>window.location="${redirectAbort}";</script>
            <noscript>Transaccion cancelada. Puedes regresar a la aplicacion.</noscript>
          </body>
        </html>
      `);
    }

    if (!token) {
      return res.status(400).send('Falta token_ws de confirmacion');
    }

    // Confirmar pago con Transbank y emitir pasajes
    const result = await ctrl.processPayment({ token, orderId });
    const status = result.success ? 'approved' : 'rejected';

    const data = Buffer.from(JSON.stringify({
      buy_order: orderId,
      token,
      authorization_code: result.raw?.authorization_code || '',
      card_last4: result.raw?.card_detail?.card_number || '',
      transaction_date: result.raw?.transaction_date || '',
    })).toString('base64');

    const redirectToApp =
      `${appScheme}://payment_result` +
      `?status=${encodeURIComponent(status)}` +
      `&data=${encodeURIComponent(data)}`;

    return res.send(`
      <!doctype html>
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <script>window.location="${redirectToApp}";</script>
          <noscript>Pago procesado. Puedes regresar a la aplicacion.</noscript>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('[POST /payments/confirm] Error:', err.message);
    return res.status(500).send('Error al procesar la confirmacion del pago');
  }
}

router.post('/payments/confirm', handleConfirm);
router.get('/payments/confirm', handleConfirm);

// Obtener estado de un pago
router.get('/payments/:id', async (req, res) => {
  try {
    const result = await ctrl.getPayment(req.params.id);
    if (result.status === 'error') {
      return res.status(404).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[GET /payments/:id] Error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Obtener pasajes comprados en una orden
router.get('/orders/:id/tickets', async (req, res) => {
  try {
    const result = await ctrl.getTicketsByOrder(req.params.id);
    if (result.status === 'error') {
      return res.status(404).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[GET /orders/:id/tickets] Error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Devolucion de pago
router.post('/payments/refund', async (req, res) => {
  try {
    const result = await ctrl.refundPayment(req.body || {});
    if (result.status === 'error') {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('[POST /payments/refund] Error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;