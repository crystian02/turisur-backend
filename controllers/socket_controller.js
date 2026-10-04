// controllers/socket_controller.js
'use strict';

const helper = require('../helpers/helpers');

// Manejo de conexiones y eventos en tiempo real con Socket.IO
module.exports.controller = (app, io, socket_list, car_locations_global) => {
  const MSG_SUCCESS = 'Operacion realizada con exito';

  io.on('connection', (client) => {
    helper.Dlog(`[Socket] Conectado: ${client.id}`);

    // 1. Registro automatico usando el uuid enviado al conectar
    const q = client.handshake?.query || {};
    if (q.uuid || q.driver_id) {
      const identifier = q.driver_id
        ? { type: 'driver_id', value: q.driver_id }
        : { type: 'uuid', value: q.uuid };

      socket_list['us_' + identifier.value] = { socket_id: client.id };
      helper.Dlog(`[Socket] Auto-registro para: ${identifier.value}`);
    }

    // 2. Registro manual del socket por evento
    const registerHandler = (data, evtName) => {
      helper.CheckIdentifierParameterSocket(client, evtName, data, [], () => {
        const identifier = helper.GetIdentifier(data);
        socket_list['us_' + identifier.value] = { socket_id: client.id };
        client.emit(evtName, { status: '1', message: MSG_SUCCESS });
      });
    };

    client.on('UpdateSocket', (data) => registerHandler(data, 'UpdateSocket'));
    client.on('update_socket', (data) => registerHandler(data, 'update_socket'));

    // 3. Cambiar si el bus se muestra o se oculta en el mapa
    client.on('request_visibility_change', (data) => {
      const identifier = helper.GetIdentifier(data);
      if (!identifier) {
        client.emit('request_visibility_change', { status: '0' });
        return;
      }

      const nowMs = Date.now();
      const visible = data.visible === true || data.visible === 'true';

      if (!car_locations_global[identifier.value]) {
        car_locations_global[identifier.value] = {
          [identifier.type]: identifier.value,
          alias: data.alias || 'Bus Turisur',
          visible,
          lat: null,
          long: null,
          degree: 0,
          source: 'phone',
          updated_at_ms: nowMs,
          updated_at: new Date(nowMs).toISOString(),
        };
      } else {
        car_locations_global[identifier.value].visible = visible;
        car_locations_global[identifier.value].updated_at_ms = nowMs;
        car_locations_global[identifier.value].updated_at = new Date(nowMs).toISOString();
      }

      io.emit('car_visibility_changed', {
        status: '1',
        payload: car_locations_global[identifier.value],
      });

      client.emit('request_visibility_change', { status: '1', message: MSG_SUCCESS });
    });

    // 4. Enviar lista de buses activos al cliente que la solicite
    client.on('get_current_state', () => {
      const visibleBuses = Object.values(car_locations_global).filter(
        (bus) => bus && bus.visible
      );

      client.emit('current_state', {
        status: '1',
        payload: visibleBuses,
        count: visibleBuses.length,
      });
    });

    // 5. Recibir ubicacion enviada desde el telefono del chofer y reenviar a todos
    client.on('update_location', (data) => {
      const identifier = data.uuid || data.driver_id;
      if (!identifier || data.lat == null) return;

      if (!car_locations_global[identifier]) {
        car_locations_global[identifier] = {
          uuid: identifier,
          driver_id: identifier,
          alias: data.alias || 'Bus Turisur',
          visible: true,
          source: 'mobile_app',
        };
      }

      const bus = car_locations_global[identifier];
      const nowMs = Date.now();

      bus.lat = Number(data.lat);
      bus.long = Number(data.long || data.lng || 0);
      bus.degree = Number(data.heading || data.degree || 0);
      bus.speed = Number(data.speed || 0);
      bus.updated_at_ms = nowMs;
      bus.updated_at = new Date(nowMs).toISOString();

      // Emitir la nueva posicion a la app de pasajeros y al panel web
      io.emit('car_update_location', {
        status: '1',
        payload: bus,
      });
    });

    // 6. Al desconectarse, quitar de la lista y marcar el bus como no visible
    client.on('disconnect', () => {
      for (const key in socket_list) {
        if (socket_list[key].socket_id === client.id) {
          const id = key.replace('us_', '');
          delete socket_list[key];

          if (car_locations_global[id]) {
            const nowMs = Date.now();
            car_locations_global[id].visible = false;
            car_locations_global[id].updated_at_ms = nowMs;
            car_locations_global[id].updated_at = new Date(nowMs).toISOString();

            io.emit('car_visibility_changed', {
              status: '1',
              payload: car_locations_global[id],
            });
          }
          break;
        }
      }
    });
  });
};