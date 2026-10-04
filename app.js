'use strict';

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');

const app = express();

// Configuracion de vistas
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middlewares base de Express
app.use(logger('dev'));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Configuracion de CORS para la app movil y panel web
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Registro simple de peticiones entrantes
app.use((req, res, next) => {
  console.log(`[APP] ${req.method} ${req.url}`);
  next();
});

// Comprobacion de estado del servidor
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', server: 'online' });
});

// Endpoint directo para consulta de ubicaciones de flota
// Garantiza que payload SIEMPRE sea un Array [] para no romper Flutter
app.get('/api/all_car_locations', (req, res, next) => {
  try {
    const locationController = require('./controllers/location_controller');

    if (typeof locationController.getAllCarLocations === 'function') {
      return locationController.getAllCarLocations(req, res);
    }

    if (typeof locationController === 'function') {
      return locationController(req, res);
    }
  } catch (err) {
    console.error('[all_car_locations] Error al invocar controlador:', err.message);
  }

  const carLocations = global.car_locations_global || global.car_locations;
  let payload = [];

  if (carLocations instanceof Map) {
    payload = Array.from(carLocations.values());
  } else if (Array.isArray(carLocations)) {
    payload = carLocations;
  } else if (carLocations && typeof carLocations === 'object') {
    payload = Object.values(carLocations);
  }

  return res.json({
    ok: true,
    status: '1',
    payload: payload,
  });
});

// Montaje de rutas de pago Transbank
try {
  const paymentsRouter = require('./src/payments/routes');
  app.use('/api', paymentsRouter);
  console.log('[APP] Rutas de pagos cargadas en /api');
} catch (err) {
  console.error('[APP] Error al cargar rutas de pagos:', err.message);
}

// Ruta principal para verificacion en navegador
app.get('/', (_, res) => {
  res.render('index', { title: 'Turisur Backend API' });
});

// Metodo para registrar el 404 y el manejador de errores
app.setupNotFoundHandler = () => {
  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
    }
    res.status(404).render('error', {
      message: 'Pagina no encontrada',
      error: { status: 404 },
    });
  });

  app.use((err, req, res, _next) => {
    console.error('[APP Error]:', err.message);

    if (req.path.startsWith('/api')) {
      return res.status(err.status || 500).json({
        ok: false,
        error: err.message || 'Error interno del servidor',
      });
    }

    res.status(err.status || 500).render('error', {
      message: err.message || 'Error del servidor',
      error: process.env.NODE_ENV === 'production' ? { status: err.status || 500 } : err,
    });
  });
};

module.exports = app;