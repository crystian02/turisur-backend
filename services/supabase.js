// services/supabase.js
'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;

// Validacion de variables minimas
if (!supabaseUrl || !supabaseServiceRole) {
  console.error('[Supabase] Faltan variables de entorno (SUPABASE_URL o SUPABASE_SERVICE_ROLE).');
}

// Cliente con permisos de administrador para operaciones del servidor
const supabaseAdmin = createClient(
  supabaseUrl || '',
  supabaseServiceRole || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Cliente publico (por si se requiere consultar con politicas RLS)
const supabasePublic = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
);

// Exportacion compatible con require directo o con llaves { }
module.exports = supabaseAdmin;
module.exports.supabase = supabaseAdmin;
module.exports.supabaseAdmin = supabaseAdmin;
module.exports.supabasePublic = supabasePublic;