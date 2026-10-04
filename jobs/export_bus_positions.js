// jobs/export_bus_positions.js
const supabase = require('../services/supabase');
const storage = require('../services/gcs');

// Umbrales de activación para exportar
const TRAFFIC_MINUTES_THRESHOLD = 15;
const ROW_THRESHOLD = 500;

async function exportBusPositions() {
  console.log('[ETL] Evaluando export por trafico');

  // 1. Validar si existe tráfico IoT activo
  const traffic = global.iotTrafficState;
  if (!traffic || !traffic.firstSeenAt) {
    console.log('[ETL] No hay trafico IoT activo');
    return;
  }

  const minutesWithTraffic = (Date.now() - traffic.firstSeenAt) / (1000 * 60);

  // 2. Contar registros pendientes de exportación
  const { count, error: countError } = await supabase
    .from('bus_positions')
    .select('*', { count: 'exact', head: true })
    .is('exported_at', null);

  if (countError) {
    console.error('[ETL] Error contando registros:', countError);
    return;
  }

  if (!count || count === 0) {
    console.log('[ETL] Sin datos para exportar');
    return;
  }

  // 3. Evaluar si cumple con el tiempo transcurrido o volumen de filas
  const shouldExport =
    minutesWithTraffic >= TRAFFIC_MINUTES_THRESHOLD ||
    count >= ROW_THRESHOLD;

  if (!shouldExport) {
    console.log(
      `[ETL] Esperando export (trafico=${minutesWithTraffic.toFixed(1)} min, registros=${count})`
    );
    return;
  }

  console.log(
    `[ETL] Exportando por condicion cumplida (trafico=${minutesWithTraffic.toFixed(1)} min, registros=${count})`
  );

  // 4. Obtener posiciones pendientes ordenadas cronológicamente
  const { data, error } = await supabase
    .from('bus_positions')
    .select('*')
    .is('exported_at', null)
    .order('created_at', { ascending: true });

  if (error || !data || data.length === 0) {
    console.error('[ETL] Error leyendo datos:', error);
    return;
  }

  // 5. Particionar por fecha y subir a Google Cloud Storage
  const date = new Date().toISOString().slice(0, 10);
  const filePath = `bus_positions/date=${date}/batch-${Date.now()}.json`;

  const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
  const file = bucket.file(filePath);

  await file.save(JSON.stringify(data), {
    contentType: 'application/json',
  });

  console.log(
    `[ETL] ${data.length} registros exportados a gs://${process.env.GCS_BUCKET_NAME}/${filePath}`
  );

  // 6. Marcar registros procesados en la base de datos
  const ids = data.map((r) => r.id);

  await supabase
    .from('bus_positions')
    .update({ exported_at: new Date().toISOString() })
    .in('id', ids);

  // 7. Reiniciar la marca temporal de tráfico
  global.iotTrafficState.firstSeenAt = Date.now();

  console.log('[ETL] Contador de trafico reiniciado');
}

module.exports = exportBusPositions;