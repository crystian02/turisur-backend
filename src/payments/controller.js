'use strict';

const { randomUUID } = require('crypto');
const transbank = require('./transbank');
const supabaseService = require('../../services/supabase');
const supabaseAdmin = supabaseService.supabaseAdmin || supabaseService.supabase || supabaseService;

// Crea una orden de compra pendiente de pago
async function createOrderOnly(payload) {
  const { userId, scheduleId, seats = 1, unitPrice = 0 } = payload || {};

  if (!userId || !scheduleId) {
    return { status: 'error', message: 'userId y scheduleId son obligatorios' };
  }

  const total = seats * unitPrice;

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .insert({
      user_id: userId,
      schedule_id: scheduleId,
      seats,
      unit_price: unitPrice,
      total_amount: total,
      status: 'pending_payment',
    })
    .select()
    .single();

  if (error) {
    console.error('[Pagos] Error al crear orden:', error.message);
    return { status: 'error', message: error.message };
  }

  return { status: 'ok', order };
}

// Inicia la transaccion en Transbank Webpay Plus
async function initPaymentForOrder(payload) {
  const { orderId, userId } = payload || {};
  if (!orderId || !userId) {
    return { status: 'error', message: 'orderId y userId requeridos' };
  }

  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return { status: 'error', message: 'Orden no encontrada' };
  }

  // Fallback seguro para la URL de confirmacion
  const returnUrl = process.env.PAYMENT_RETURN_URL || 'https://turisur-backend.onrender.com/api/payments/confirm';

  // Genera identificadores unicos para Transbank (limite de 26 caracteres)
  const shortId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const buyOrder = `ORD-${shortId}`;
  const sessionId = `SESS-${shortId}`;

  const tx = await transbank.createTransaction({
    buyOrder,
    sessionId,
    amount: Math.round(Number(order.total_amount)),
    returnUrl,
  });

  const { data: payment, error } = await supabaseAdmin
    .from('payments')
    .insert({
      order_id: orderId,
      user_id: userId,
      amount_clp: Math.round(Number(order.total_amount)),
      status: 'pending',
      buy_order: buyOrder,
      session_id: sessionId,
      token: tx.token,
    })
    .select()
    .single();

  if (error) {
    console.error('[Pagos] Error al registrar pago pendiente:', error.message);
    return { status: 'error', message: error.message };
  }

  return {
    status: 'ok',
    paymentId: payment.id,
    url: tx.url,
    token: tx.token,
    order,
  };
}

// Confirma el resultado de la transaccion y genera los pasajes si fue aprobada
async function processPayment({ token, orderId }) {
  const commit = await transbank.commitTransaction(token);
  const info = commit.raw;

  const success = info?.response_code === 0;

  const { data: payment } = await supabaseAdmin
    .from('payments')
    .update({
      status: success ? 'authorized' : 'failed',
      authorization_code: info.authorization_code,
      payment_type_code: info.payment_type_code,
      card_last4: info.card_detail?.card_number,
      response_code: info.response_code,
      transaction_date: new Date(),
    })
    .eq('token', token)
    .select()
    .single();

  if (success && payment) {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', payment.order_id)
      .select()
      .single();

    // Genera pasajes con codigos QR unicos y columna issued_at
    const tickets = Array.from({ length: order.seats }).map((_, i) => ({
      order_id: order.id,
      payment_id: payment.id,
      schedule_id: order.schedule_id,
      user_id: order.user_id,
      qr_code: `QR-${order.id}-${i + 1}-${randomUUID()}`,
      seat_number: `${i + 1}`,
      status: 'issued',
      issued_at: new Date(),
    }));

    await supabaseAdmin.from('tickets').insert(tickets);
  }

  return { status: 'ok', success, raw: info };
}

// Obtiene los pasajes asociados a una orden de compra
async function getTicketsByOrder(orderId) {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select(`
      id,
      qr_code,
      status,
      seat_number,
      issued_at,
      schedules (
        origen,
        destino,
        dia,
        hora_salida,
        precio
      )
    `)
    .eq('order_id', orderId);

  if (error) {
    return { status: 'error', message: error.message };
  }

  return { status: 'ok', tickets: data };
}

// Consulta los detalles de un pago registrado
async function getPayment(paymentId) {
  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (error) return { status: 'error', message: error.message };
  return { status: 'ok', ...data };
}

// Procesa una anulacion o devolucion de dinero con Transbank
async function refundPayment({ paymentId, amount }) {
  if (!paymentId) {
    return { status: 'error', message: 'paymentId requerido' };
  }

  const { data: payment, error } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (error || !payment) {
    return { status: 'error', message: 'Pago no encontrado' };
  }

  const refundAmount = amount || payment.amount_clp;

  try {
    const result = await transbank.refundTransaction(payment.token, refundAmount);

    await supabaseAdmin
      .from('payments')
      .update({ status: 'refunded' })
      .eq('id', paymentId);

    return { status: 'ok', refund: result.raw };
  } catch (err) {
    console.error('[Pagos] Error al procesar devolucion:', err.message);
    return { status: 'error', message: err.message };
  }
}

module.exports = {
  createOrderOnly,
  initPaymentForOrder,
  processPayment,
  getPayment,
  getTicketsByOrder,
  refundPayment,
};