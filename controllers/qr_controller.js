// controllers/qr_controller.js
'use strict';

const { supabaseAdmin } = require('../services/supabase');

// Valida y canjea pasajes escaneados con codigos QR desde buses o la app
module.exports.controller = (app) => {
  console.log('[QR] qr_controller inicializado');

  // Recibe la lectura QR, comprueba el bus, verifica el pago y marca el pasaje como usado
  app.post('/api/iot/qr-scan', async (req, res) => {
    const { qr, imei, lat, lng } = req.body;

    if (!qr || !imei) {
      return res.status(400).json({ ok: false, reason: 'BAD_DATA' });
    }

    try {
      // 1. Verificar si el bus esta registrado en la base de datos
      const { data: bus, error: busError } = await supabaseAdmin
        .from('buses')
        .select('id')
        .eq('imei', imei)
        .single();

      if (busError || !bus) {
        await logValidation({
          ticketId: null,
          busId: null,
          busImei: imei,
          qr,
          status: 'REJECTED',
          reason: 'BUS_NOT_REGISTERED',
          lat,
          lng,
        });

        return res.status(200).json({ ok: false, reason: 'BUS_NOT_REGISTERED' });
      }

      // 2. Buscar datos del pasaje y estado de la transaccion
      const { data: ticket, error: ticketError } = await supabaseAdmin
        .from('tickets')
        .select(`
          id,
          status,
          payment_id,
          schedule_id,
          payments ( status )
        `)
        .eq('qr_code', qr)
        .single();

      if (ticketError || !ticket) {
        await logValidation({
          ticketId: null,
          busId: bus.id,
          busImei: imei,
          qr,
          status: 'REJECTED',
          reason: 'QR_INVALID',
          lat,
          lng,
        });

        return res.status(200).json({ ok: false, reason: 'QR_INVALID' });
      }

      // 3. Revisar que el pasaje no haya sido utilizado antes
      if (ticket.status !== 'issued') {
        await logValidation({
          ticketId: ticket.id,
          busId: bus.id,
          busImei: imei,
          qr,
          status: 'REJECTED',
          reason: 'ALREADY_USED',
          lat,
          lng,
        });

        return res.status(200).json({ ok: false, reason: 'ALREADY_USED' });
      }

      // 4. Confirmar que el pago este aprobado
      const paymentStatus = ticket.payments?.status?.toLowerCase();
      const validStatuses = ['approved', 'authorized'];

      if (!ticket.payments || !validStatuses.includes(paymentStatus)) {
        await logValidation({
          ticketId: ticket.id,
          busId: bus.id,
          busImei: imei,
          qr,
          status: 'REJECTED',
          reason: 'PAYMENT_NOT_APPROVED',
          lat,
          lng,
        });

        return res.status(200).json({ ok: false, reason: 'PAYMENT_NOT_APPROVED' });
      }

      // 5. Guardar el registro del pasaje validado con exito
      const { error: insertError } = await supabaseAdmin
        .from('ticket_validations')
        .insert({
          ticket_id: ticket.id,
          bus_id: bus.id,
          bus_imei: imei,
          validation_status: 'APPROVED',
          lat: lat ?? 0,
          lng: lng ?? 0,
          raw_qr: qr,
        });

      if (insertError) throw insertError;

      // 6. Marcar el pasaje como usado y asociarlo al bus
      const { error: updateError } = await supabaseAdmin
        .from('tickets')
        .update({
          status: 'used',
          bus_id: bus.id,
        })
        .eq('id', ticket.id);

      if (updateError) throw updateError;

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[QR] Error al validar pasaje:', error.message);
      return res.status(500).json({ ok: false, reason: 'SERVER_ERROR' });
    }
  });
};

// Guarda los intentos rechazados en el historial sin cortar la ejecucion
async function logValidation({ ticketId, busId, busImei, qr, status, reason, lat, lng }) {
  const { error } = await supabaseAdmin.from('ticket_validations').insert({
    ticket_id: ticketId,
    bus_id: busId,
    bus_imei: busImei,
    validation_status: status,
    reason,
    lat: lat ?? 0,
    lng: lng ?? 0,
    raw_qr: qr,
  });

  if (error) {
    console.error('[QR] Error al guardar en historial:', error.message);
  }
}