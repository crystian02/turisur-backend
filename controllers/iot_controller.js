// controllers/iot_controller.js
const supabase = require('../services/supabase');

// Intervalo minimo de persistencia en base de datos (15 segundos)
const PERSIST_INTERVAL_MS = 15000;
const lastPersistedAt = {};

// Cache en memoria: mapea IMEI para evitar consultas repetitivas a la base de datos
const imeiToBusIdCache = {};

/*
  Obtiene el identificador interno del bus a partir de su IMEI.
 */
async function getBusIdByImei(imei) {
  if (!imei) return null;
  if (imeiToBusIdCache[imei]) return imeiToBusIdCache[imei];

  const { data, error } = await supabase
    .from('buses')
    .select('id, imei, active')
    .eq('imei', imei)
    .maybeSingle();

  if (error) {
    console.error('[GPS:Supabase] Error al consultar bus por IMEI:', error.message);
    return null;
  }
  if (!data) return null;

  imeiToBusIdCache[imei] = data.id;
  return data.id;
}

/*
  Garantiza que el dispositivo este registrado en la flota.
  Si es un hardware nuevo, lo crea automaticamente y lo almacena en cache.
 */
async function ensureBusExists(imei) {
  const existingId = await getBusIdByImei(imei);
  if (existingId) return existingId;

  const { data: created, error } = await supabase
    .from('buses')
    .insert({
      imei,
      alias: 'Bus Turisur',
      active: true,
    })
    .select('id')
    .single();

  if (error) {
    console.error('GPS: Error al registrar bus por IMEI:', error.message);
    return null;
  }

  imeiToBusIdCache[imei] = created.id;
  console.log(`GPS: Unidad registrada exitosamente para IMEI: ${imei}`);
  return created.id;
}

module.exports.controller = (app, io, _, car_locations_global) => {
  console.log('GPS Receptor de coordenadas inicializado (Memoria RAM + persistencia)');

  /*
    Ingesta HTTP de coordenadas enviadas por modulos GPS / microcontroladores.
    Almacena de inmediato en memoria y emite por WebSockets para el mapa en vivo.
   */
  app.post('/api/iot/bus-position', async (req, res) => {
    const { imei, lat, lon, speed = 0, heading = 0 } = req.body;

    // Validacion de coordenadas minimas requeridas
    if (!imei || lat == null || lon == null) {
      return res.status(400).json({ error: true, message: 'Coordenadas incompletas' });
    }

    const nowMs = Date.now();

    // Registro de actividad de transmision
    if (!global.iotTrafficState.firstSeenAt) {
      global.iotTrafficState.firstSeenAt = nowMs;
    }
    global.iotTrafficState.lastSeenAt = nowMs;

    // 1. Ubicacion en tiempo real: actualizacion directa en memoria RAM
    const busData = {
      driver_id: imei,
      uuid: imei,
      lat: Number(lat),
      long: Number(lon),
      speed: Number(speed),
      degree: Number(heading),
      visible: true,
      source: 'iot',
      updated_at: new Date(nowMs).toISOString(),
      updated_at_ms: nowMs,
    };

    car_locations_global[imei] = busData;

    // Emision en vivo hacia el mapa web y la aplicacion mediante WebSockets
    io?.emit('car_update_location', {
      status: '1',
      payload: busData,
    });

    // Respuesta inmediata para liberar la conexion del modulo GPS
    res.status(200).send('OK');

    // 2. Persistencia historica de recorrido (throttling cada 15 segundos por unidad)
    const lastTime = lastPersistedAt[imei] || 0;
    if (nowMs - lastTime < PERSIST_INTERVAL_MS) return;

    lastPersistedAt[imei] = nowMs;

    try {
      const busId = await ensureBusExists(imei);
      if (!busId) return;

      const snapshot = car_locations_global[imei];

      const { error } = await supabase.from('bus_positions').insert({
        bus_id: busId,
        schedule_id: null,
        lat: snapshot.lat,
        long: snapshot.long,
        speed_kmh: snapshot.speed ?? 0,
        heading_deg: snapshot.degree ?? 0,
        created_at: new Date(nowMs).toISOString(),
      });

      if (error) {
        console.error('[GPS:Supabase] Error al guardar posicion historica:', error.message);
      }
    } catch (err) {
      console.error('[GPS:Supabase] Excepcion en persistencia de posicion:', err.message);
    }
  });
};