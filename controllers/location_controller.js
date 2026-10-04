// controllers/location_controller.js

/*
  Controlador para consultar la flota activa en tiempo real.
  Lee directamente del estado en memoria RAM para asegurar baja latencia y alta concurrencia.
 */
module.exports.controller = (app, io, socket_list, car_locations_global) => {
  console.log('[GPS] location_controller inicializado (Lectura en memoria RAM)');

  /*
    Endpoint consumido por el backend BFF de Next.js (/api/buses) y la app movil.
    Retorna la lista de vehiculos visibles con sus ultimas coordenadas reportadas.
   */
  
  app.get('/api/all_car_locations', (req, res) => {
    try {
      const payload = Object.values(car_locations_global)
        .filter((bus) => bus && bus.visible)
        .map((bus) => ({
          driver_id: bus.driver_id,
          uuid: bus.uuid,
          alias: bus.alias || bus.driver_id || 'Bus Turisur',
          plate: bus.plate || null,
          lat: bus.lat,
          long: bus.long,
          speed: bus.speed || 0,
          degree: bus.degree || 0,
          visible: true,
          source: bus.source,
          updated_at: bus.updated_at,
          updated_at_ms: bus.updated_at_ms ?? (
            bus.updated_at
              ? new Date(bus.updated_at).getTime()
              : Date.now()
          ),
        }));

      return res.status(200).json({ status: '1', payload });
    } catch (error) {
      console.error('[GPS] Error al obtener ubicaciones de vehiculos:', error.message);
      return res.status(500).json({
        status: '0',
        message: 'Error interno al consultar las ubicaciones activas de la flota',
      });
    }
  });
};