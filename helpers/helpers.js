// helpers/helpers.js
'use strict';

const moment = require('moment-timezone');

// Activa logs detallados solo en desarrollo o si se define DEBUG
const app_debug_mode = process.env.NODE_ENV !== 'production' || process.env.DEBUG === 'true';
const timezone_name = 'America/Santiago';
const msg_server_internal_error = 'Error interno del servidor';

// Imprime en consola solo si el modo debug esta activo
function Dlog(log) {
  if (app_debug_mode) console.log(log);
}

// Retorna la fecha y hora actual en la zona horaria de Chile
function serverDateTime(format) {
  return moment().tz(timezone_name).format(format);
}

// Valida que la peticion HTTP incluya uuid o driver_id y los parametros requeridos
function checkIdentifierParameter(res, jsonObj, requiredParams, callback) {
  const hasUUID = Object.prototype.hasOwnProperty.call(jsonObj, 'uuid');
  const hasDriverID = Object.prototype.hasOwnProperty.call(jsonObj, 'driver_id');

  if (!hasUUID && !hasDriverID) {
    res.status(400).json({
      status: '0',
      message: 'Falta parametro (uuid o driver_id) para identificar el vehiculo.',
    });
    return;
  }

  const otherParams = requiredParams.filter(
    (param) => param !== 'uuid' && param !== 'driver_id'
  );
  const missingParameter = otherParams.filter(
    (key) => !Object.prototype.hasOwnProperty.call(jsonObj, key)
  );

  if (missingParameter.length > 0) {
    res.status(400).json({
      status: '0',
      message:
        'Faltan los siguientes parametros requeridos: (' +
        missingParameter.join(', ') +
        ')',
    });
  } else {
    callback();
  }
}

// Valida que el mensaje de socket incluya uuid o driver_id y los parametros requeridos
function checkIdentifierParameterSocket(
  client,
  eventName,
  jsonObj,
  requiredParams,
  callback
) {
  const hasUUID = Object.prototype.hasOwnProperty.call(jsonObj, 'uuid');
  const hasDriverID = Object.prototype.hasOwnProperty.call(jsonObj, 'driver_id');

  if (!hasUUID && !hasDriverID) {
    client.emit(eventName, {
      status: '0',
      message: 'Falta parametro (uuid o driver_id) para identificar el vehiculo.',
    });
    return;
  }

  const otherParams = requiredParams.filter(
    (param) => param !== 'uuid' && param !== 'driver_id'
  );
  const missingParameter = otherParams.filter(
    (key) => !Object.prototype.hasOwnProperty.call(jsonObj, key)
  );

  if (missingParameter.length > 0) {
    client.emit(eventName, {
      status: '0',
      message:
        'Faltan los siguientes parametros requeridos: (' +
        missingParameter.join(', ') +
        ')',
    });
  } else {
    callback();
  }
}

// Obtiene el identificador principal del vehiculo (prioriza driver_id)
function getIdentifier(jsonObj) {
  if (jsonObj && Object.prototype.hasOwnProperty.call(jsonObj, 'driver_id')) {
    return { type: 'driver_id', value: jsonObj.driver_id };
  } else if (jsonObj && Object.prototype.hasOwnProperty.call(jsonObj, 'uuid')) {
    return { type: 'uuid', value: jsonObj.uuid };
  }
  return null;
}

// Comprueba que el valor sea un numero de coordenada valido
function isValidCoordinate(coord) {
  return coord !== undefined && coord !== null && !isNaN(parseFloat(coord));
}

// Extrae solo los campos necesarios de la ubicacion de un bus
function filterValidCarData(carData) {
  return {
    driver_id: carData.driver_id,
    uuid: carData.uuid,
    lat: carData.lat,
    long: carData.long,
    degree: carData.degree,
    visible: carData.visible,
    email: carData.email,
  };
}

module.exports = {
  // Manejo de errores en peticiones HTTP
  ThrowHtmlError: (err, res) => {
    console.error(`[HTTP Error] ${serverDateTime('YYYY-MM-DD HH:mm:ss')}:`, err.message);
    if (res && !res.headersSent) {
      res.status(500).json({ status: '0', message: msg_server_internal_error });
    }
  },

  // Manejo de errores en eventos de Socket.IO
  ThrowSocketError: (err, client, eventName) => {
    console.error(`[Socket Error] ${serverDateTime('YYYY-MM-DD HH:mm:ss')} en ${eventName}:`, err.message);
    if (client) {
      client.emit(eventName, { status: '0', message: msg_server_internal_error });
    }
  },

  // Validaciones de parametros en el JSON recibido
  CheckParameterValid: (res, jsonObj, checkKeys, callback) => {
    const missingParameter = checkKeys.filter(
      (key) => !Object.prototype.hasOwnProperty.call(jsonObj, key)
    );
    if (missingParameter.length > 0) {
      res.status(400).json({
        status: '0',
        message:
          'Faltan los siguientes parametros: (' +
          missingParameter.join(', ') +
          ')',
      });
    } else {
      callback();
    }
  },

  CheckParameterValidSocket: (client, eventName, jsonObj, checkKeys, callback) => {
    const missingParameter = checkKeys.filter(
      (key) => !Object.prototype.hasOwnProperty.call(jsonObj, key)
    );
    if (missingParameter.length > 0) {
      client.emit(eventName, {
        status: '0',
        message:
          'Faltan los siguientes parametros: (' +
          missingParameter.join(', ') +
          ')',
      });
    } else {
      callback();
    }
  },

  // Identificacion del bus
  CheckIdentifierParameter: checkIdentifierParameter,
  CheckIdentifierParameterSocket: checkIdentifierParameterSocket,
  GetIdentifier: getIdentifier,
  isValidCoordinate: isValidCoordinate,
  filterValidCarData: filterValidCarData,

  // Utilidades de fecha y consola
  Dlog: Dlog,
  serverDateTime: serverDateTime,
  serverYYYYMMDDHHmmss: () => serverDateTime('YYYY-MM-DD HH:mm:ss'),
};

// Captura de errores no controlados para registrarlos en consola
process.on('uncaughtException', (err) => {
  console.error('[Fatal Error] Excepcion no controlada:', err.message);
});