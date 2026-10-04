// controllers/ticket_controller.js
'use strict';

const supabaseService = require('../services/supabase');
const supabaseAdmin = supabaseService.supabaseAdmin || supabaseService.supabase || supabaseService;

module.exports.controller = (app, io, _, car_locations_global) => {
  console.log('[TICKET] ticket_controller cargado');

  app.post('/api/validate_ticket', async (req, res) => {
    try {
      const { qr, lat, lng } = req.body || {};

      if (!qr) {
        return res.json({ ok: false, reason: 'QR_INVALID' });
      }

      // 1) Buscar ticket por QR
      const { data: ticket, error } = await supabaseAdmin
        .from('tickets')
        .select(`
          id,
          qr_code,
          status,
          user_id,
          schedule_id,
          payments!inner(status)
        `)
        .eq('qr_code', qr)
        .maybeSingle();

      if (error || !ticket) {
        return res.json({ ok: false, reason: 'QR_INVALID' });
      }

      // 2) Verificar pago aprobado (acepta 'authorized' y 'approved')
      const paymentStatus = ticket.payments?.status?.toLowerCase();
      const validStatuses = ['authorized', 'approved'];

      if (!ticket.payments || !validStatuses.includes(paymentStatus)) {
        return res.json({ ok: false, reason: 'PAYMENT_NOT_APPROVED' });
      }

      // 3) Verificar que no haya sido usado
      if (ticket.status === 'used' || ticket.status === 'voided') {
        return res.json({ ok: false, reason: 'ALREADY_USED' });
      }

      // 4) Marcar ticket como usado
      const { error: updateError } = await supabaseAdmin
        .from('tickets')
        .update({ status: 'used' })
        .eq('id', ticket.id);

      if (updateError) {
        console.error('[validate_ticket] update', updateError);
        return res.json({ ok: false, reason: 'SERVER_ERROR' });
      }

      // 5) Registrar validacion
      await supabaseAdmin.from('ticket_validations').insert({
        ticket_id: ticket.id,
        bus_imei: null,
        validation_status: 'ok',
        lat: lat ?? null,
        lng: lng ?? null,
        raw_qr: qr,
      });

      return res.json({ ok: true, ticket_id: ticket.id });
    } catch (err) {
      console.error('[POST /validate_ticket]', err);
      return res.json({ ok: false, reason: 'SERVER_ERROR' });
    }
  });
};