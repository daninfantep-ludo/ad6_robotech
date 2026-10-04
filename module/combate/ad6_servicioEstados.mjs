/**
 * Servicio de ESTADOS de combate (efectos persistentes con reglas propias)
 * ============================================================================
 * Gestiona los estados "Corroído" e "Incendiado" como EFECTOS ACTIVOS del
 * actor (actor.effects), cada uno con sus datos en el flag del efecto:
 *     flags.ad6-robotech.estado = {
 *        tipo:        "corrosivo" | "incendiado",
 *        impacto:     "impacta"  | "traspasa",   // cómo se dispara al impactar
 *        nivel:       1..3,                        // incendiado (corrosivo = 1)
 *        expiraRonda: <número>|null               // corrosivo: ronda de caducidad
 *     }
 *
 * INTERRUPTOR MAESTRO: toda la lógica está gobernada por la constante
 * ACTIVAR_ESTADOS (en config.mjs). Si es false, las funciones de APLICAR no
 * hacen nada (no crean efectos), de modo que en caliente se puede neutralizar
 * el servicio sin tocar nada más. Las funciones de LECTURA siempre devuelven
 * "sin estado" si el interruptor está apagado.
 *
 * Este módulo es el ÚNICO sitio que crea/quita/lee efectos de estado del
 * sistema. El cálculo del combate lo consulta aquí; la interfaz (hoja/token)
 * también. Así la regla vive en un solo punto.
 *
 * Todo el código y los comentarios están en castellano a propósito.
 */

import { ACTIVAR_ESTADOS, Ad6 } from '../config.mjs';

const ID_FLAG = "ad6-robotech";

/**
 * Devuelve la definición (catálogo) de un estado por su clave ("corrosivo" |
 * "incendiado"), o null. Se apoya en Ad6.Estados (config.mjs).
 * @param {string} clave
 */
function _def(clave)
{
  return Ad6?.Estados?.[clave] ?? null;
}

/**
 * Devuelve el efecto ACTIVO de estado del actor para el id de statusEffect
 * indicado (p.ej. "ad6-corrosivo"), o null. Un actor tiene a lo sumo UN efecto
 * por tipo de estado.
 * @param {Actor} actor
 * @param {string} idEfecto   id del statusEffect (p.ej. "ad6-corrosivo").
 * @returns {ActiveEffect|null}
 */
function _efectoDe(actor, idEfecto)
{
  if (!actor || !idEfecto) return null;
  const efectos = actor.effects;
  if (!efectos) return null;
  // effects es una colección; "contains" no siempre existe, así que filtramos
  // con _esEfectoDe (que tolera efectos SIN flag, creados a mano por Foundry).
  const lista = (typeof efectos.filter === "function")
    ? efectos.filter(e => _esEfectoDe(e, idEfecto))
    : [];
  return lista[0] ?? null;
}

/**
 * ¿Un efecto "es" el estado indicado? Considera DOS vías, porque un efecto puede
 * haber sido creado por el SISTEMA (lleva el flag y "statuses") o A MANO por el
 * usuario desde la interfaz de Foundry (aplicando el status al token), que crea
 * un efecto con el status/id pero SIN nuestro flag:
 *   1) Por el "status" registrado (e.statuses incluye el id del statusEffect).
 *   2) Por el id del PROPIO efecto activo: al aplicar un status, Foundry crea el
 *      efecto con el MISMO id que el statusEffect (o "status-<id>"), así que
 *      también lo reconocemos por ahí.
 * @param {ActiveEffect} e
 * @param {string} idEfecto  id del statusEffect (p.ej. "ad6-corrosivo").
 * @returns {boolean}
 */
function _esEfectoDe(e, idEfecto)
{
  if (!e || !idEfecto) return false;
  if (_statusesDe(e).includes(idEfecto)) return true;
  if (e.id === idEfecto) return true;
  if (String(e.id ?? "").endsWith(idEfecto)) return true;
  return false;
}

/**
 * Devuelve el array de "statuses" de un efecto, normalizado (puede venir como
 * Set en algunas versiones de Foundry).
 * @param {ActiveEffect} e
 * @returns {string[]}
 */
function _statusesDe(e)
{
  const s = e?.statuses;
  if (s instanceof Set) return Array.from(s);
  if (Array.isArray(s)) return s;
  return [];
}

/**
 * Lee los datos de estado de un efecto (o null).
 * @param {ActiveEffect} e
 */
function _datosDe(e)
{
  return e?.flags?.[ID_FLAG]?.estado ?? null;
}

/**
 * Datos de estado POR DEFECTO para un efecto que NO trae nuestro flag (porque se
 * aplicó el status a mano desde la interfaz de Foundry). Devuelve una forma
 * coherente con los datos que escribiría el servicio, de modo que el resto del
 * código no tenga que distinguir el origen.
 *   - corrosivo  -> { tipo:"corrosivo",  impacto, nivel:1, expiraRonda: ronda+1 }
 *   - incendiado -> { tipo:"incendiado", impacto, nivel:1, expiraRonda:null }
 * @param {"corrosivo"|"incendiado"} clave
 * @param {object} def
 */
function _datosPorDefecto(clave, def)
{
  // Para el CORROSIVO fijamos su caducidad a la ronda actual + 1 (igual que
  // haría aplicarCorrosivo): así un estado aplicado a mano caduca igual que uno
  // aplicado por el sistema. Si no hay combate activo (ronda 0), queda sin
  // caducidad automática (se quita a mano).
  const expiraRonda = (clave === "corrosivo")
    ? ((_rondaActual() > 0) ? _rondaActual() + 1 : null)
    : null;

  return {
     tipo:        clave
    ,impacto:     def?.impacto ?? "impacta"
    ,nivel:       1
    ,expiraRonda
  };
}

// ---------------------------------------------------------------------------
// Lectura pública (la usa el cálculo de combate y la interfaz)
// ---------------------------------------------------------------------------

/**
 * Devuelve los datos del estado "corrosivo" de un actor, o null si no lo tiene
 * (o si el interruptor está apagado).
 *
 * TOLERA efectos creados A MANO: si el efecto no trae nuestro flag (p.ej. porque
 * el usuario aplicó el status desde la interfaz de Foundry), devuelve unos datos
 * por defecto coherentes (tipo corrosivo, sin caducidad conocida).
 * @param {Actor} actor
 * @returns {{tipo:string, impacto:string, nivel:number, expiraRonda:number|null}|null}
 */
export function estadoCorrosivo(actor)
{
  if (!ACTIVAR_ESTADOS) return null;
  const def = _def("corrosivo");
  const e = _efectoDe(actor, def?.id);
  if (!e) return null;
  return _datosDe(e) ?? _datosPorDefecto("corrosivo", def);
}

/**
 * Devuelve el NIVEL de incendio (0..3) de un actor, o 0 si no está incendiado
 * (o si el interruptor está apagado).
 *
 * TOLERA efectos creados A MANO: si el efecto no trae nuestro flag, asume nivel 1
 * (el mínimo) para que el estado aplicado a mano SÍ cuente en la interfaz y el
 * cálculo.
 * @param {Actor} actor
 * @returns {number}
 */
export function nivelIncendio(actor)
{
  if (!ACTIVAR_ESTADOS) return 0;
  const def = _def("incendiado");
  const e = _efectoDe(actor, def?.id);
  if (!e) return 0;
  const datos = _datosDe(e) ?? _datosPorDefecto("incendiado", def);
  return Math.max(0, Math.min(3, Number(datos?.nivel ?? 0)));
}

/**
 * ¿Tiene el actor el estado "corrosivo" activo?
 * @param {Actor} actor
 */
export function estaCorroido(actor)
{
  return estadoCorrosivo(actor) !== null;
}

// ---------------------------------------------------------------------------
// Aplicación pública (la usa el servicio de combate al impactar)
// ---------------------------------------------------------------------------

/**
 * APLICA (o refresca) el estado CORROSIVO a un actor.
 * - Si no lo tiene: crea el efecto con expiraRonda = rondaActual + 1.
 * - Si ya lo tiene: REFRESCA el contador (expiraRonda = rondaActual + 1).
 * Si NO hay combate activo (ronda 0), queda SIN caducidad automática (se quita
 * a mano desde la hoja/token); así no expira nada más empezar un combate futuro.
 * Devuelve true si se escribió algo.
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function aplicarCorrosivo(actor)
{
  if (!ACTIVAR_ESTADOS) return false;
  const def = _def("corrosivo");
  if (!actor || !def) return false;
  if (!_puedeEscribir(actor)) return false;

  const ronda = _rondaActual();
  const datos = {
     tipo:        "corrosivo",
     impacto:     def.impacto,   // "impacta"
     nivel:       1,
     expiraRonda: (ronda > 0) ? (ronda + 1) : null
  };
  return await _crearORefrescar(actor, def, datos);
}

/**
 * APLICA (o incrementa) el estado INCENDIADO a un actor, hasta un máximo de 3.
 * - Si no lo tiene: crea el efecto con nivel 1.
 * - Si ya lo tiene: sube el nivel en 1 (tope 3).
 * Devuelve el nivel resultante (0 = no aplicado).
 * @param {Actor} actor
 * @returns {Promise<number>}
 */
export async function aplicarIncendiado(actor)
{
  if (!ACTIVAR_ESTADOS) return 0;
  const def = _def("incendiado");
  if (!actor || !def) return 0;
  if (!_puedeEscribir(actor)) return 0;

  const actual = nivelIncendio(actor);
  const nivel = Math.min(3, actual + 1);

  const datos = {
     tipo:        "incendiado",
     impacto:     def.impacto,   // "impacta"
     nivel,
     expiraRonda: null           // el incendio no caduca solo; se apaga a mano
  };
  const ok = await _crearORefrescar(actor, def, datos);
  return ok ? nivel : 0;
}

// ---------------------------------------------------------------------------
// Quitar / apagar (interfaz de hoja y de token)
// ---------------------------------------------------------------------------

/**
 * Quita el estado CORROSIVO del actor.
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function quitarCorrosivo(actor)
{
  if (!actor) return false;
  if (!_puedeEscribir(actor)) return false;
  const e = _efectoDe(actor, _def("corrosivo")?.id);
  if (!e) return false;
  await e.delete();
  return true;
}

/**
 * APAGA por completo el estado INCENDIADO (lo quita, sea cual sea su nivel).
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function apagarIncendiado(actor)
{
  if (!actor) return false;
  if (!_puedeEscribir(actor)) return false;
  const e = _efectoDe(actor, _def("incendiado")?.id);
  if (!e) return false;
  await e.delete();
  return true;
}

/**
 * Sube UN nivel de incendio (tope 3). Devuelve el nivel resultante.
 * @param {Actor} actor
 * @returns {Promise<number>}
 */
export async function subirIncendiado(actor)
{
  if (!ACTIVAR_ESTADOS) return 0;
  const def = _def("incendiado");
  if (!actor || !def) return 0;
  if (!_puedeEscribir(actor)) return 0;

  const actual = nivelIncendio(actor);
  if (actual >= 3) return 3;

  const nivel = actual + 1;
  const datos = { tipo: "incendiado", impacto: def.impacto, nivel, expiraRonda: null };
  await _crearORefrescar(actor, def, datos);
  return nivel;
}

/**
 * Baja UN nivel de incendio. Si llega a 0, apaga (quita) el estado.
 * Devuelve el nivel resultante (0 = apagado).
 * @param {Actor} actor
 * @returns {Promise<number>}
 */
export async function bajarIncendiado(actor)
{
  if (!ACTIVAR_ESTADOS) return 0;
  const def = _def("incendiado");
  if (!actor || !def) return 0;
  if (!_puedeEscribir(actor)) return 0;

  const actual = nivelIncendio(actor);
  if (actual <= 0) return 0;

  const nivel = actual - 1;
  if (nivel <= 0)
  {
    await apagarIncendiado(actor);
    return 0;
  }

  const datos = { tipo: "incendiado", impacto: def.impacto, nivel, expiraRonda: null };
  await _crearORefrescar(actor, def, datos);
  return nivel;
}

// ---------------------------------------------------------------------------
// Caducidad (la llama el hook combatRound)
// ---------------------------------------------------------------------------

/**
 * Caduca los estados que correspondan al ARRANCAR la ronda indicada:
 *   - CORROSIVO: se quita si expiraRonda <= ronda.
 *   - INCENDIADO: NO caduca solo (se apaga a mano).
 * Recorre TODOS los actores del mundo. Devuelve nº de efectos eliminados.
 * @param {number} ronda
 * @returns {Promise<number>}
 */
export async function caducarEstadosEnRonda(ronda)
{
  if (!ACTIVAR_ESTADOS) return 0;
  let borrados = 0;
  const idCorrosivo = _def("corrosivo")?.id;

  for (const actor of (game.actors ?? []))
  {
    if (!_puedeEscribir(actor)) continue;
    const e = _efectoDe(actor, idCorrosivo);
    if (!e) continue;
    const datos = _datosDe(e);
    const expira = Number(datos?.expiraRonda ?? 0) || 0;
    if (expira > 0 && ronda >= expira)
    {
      await e.delete();
      borrados++;
    }
  }
  return borrados;
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

/**
 * Crea el efecto del estado o, si ya existe, ACTUALIZA sus datos (flags + nombre).
 * @param {Actor} actor
 * @param {object} def        definición del estado (config).
 * @param {object} datos      flags.ad6-robotech.estado a escribir.
 * @returns {Promise<boolean>}
 */
async function _crearORefrescar(actor, def, datos)
{
  const existente = _efectoDe(actor, def.id);

  // Imagen del efecto SIEMPRE definida (nunca undefined/null): si el catálogo no
  // trajera ruta, caemos al SVG por defecto de Foundry. Un "img" indefinido haría
  // que Foundry intente cargar una textura inexistente y falle.
  const img = def.img ?? "icons/svg/aura.svg";

  // Si ya existe, actualizamos los datos (flag + nombre + img). Escribir el "img"
  // aquí garantiza que el efecto sea siempre pintable.
  if (existente)
  {
    await existente.update({
       [`flags.${ID_FLAG}.estado`]: datos,
       name: _nombreEstado(def, datos),
       img
    });
    return true;
  }

  // Si NO existe, lo creamos con la API CANÓNICA de Foundry:
  //   actor.toggleStatusEffect(id, { active: true })
  // Esta API construye el efecto con ActiveEffect.fromStatusEffect(), que es
  // EXACTAMENTE lo que hace Foundry al aplicar un status desde su interfaz. Es
  // lo que garantiza que el efecto quede emparejado con la entrada de
  // CONFIG.statusEffects y que Foundry PINTE su icono en el token. Construir el
  // ActiveEffect a mano (createEmbeddedDocuments) puede dejar el "statuses" o el
  // "img" en una forma que el pintado del token no reconoce.
  await actor.toggleStatusEffect(def.id, { active: true });

  // El efecto recién creado llevará el nombre/img del statusEffect; le grabamos
  // NUESTROS datos (flag de estado + nombre por nivel) para que la hoja y el
  // cálculo lo reconozcan. Si por lo que sea no aparece, no es crítico: el
  // efecto existe y se pinta igual.
  const creado = _efectoDe(actor, def.id);
  if (creado)
  {
    await creado.update({
       [`flags.${ID_FLAG}.estado`]: datos,
       name: _nombreEstado(def, datos),
       img
    });
  }
  return true;
}

/**
 * Nombre legible del efecto (localizado), según tipo y nivel.
 * @param {object} def
 * @param {object} datos
 */
function _nombreEstado(def, datos)
{
  if (datos?.tipo === "incendiado")
  {
    return game.i18n.format("Ad6.Estados.incendiadoNombre", { nivel: datos.nivel });
  }
  return game.i18n.localize("Ad6.Estados.corrosivoNombre");
}

/**
 * ¿Puede ESTE cliente escribir en el actor? (dueño o GM).
 * @param {Actor} actor
 */
function _puedeEscribir(actor)
{
  return actor?.isOwner === true || game.user?.isGM === true;
}

/**
 * Número de RONDA (asalto) actual de combate, o 0 si no hay combate activo.
 * @returns {number}
 */
function _rondaActual()
{
  return Number(game?.combat?.round ?? 0) || 0;
}

// ---------------------------------------------------------------------------
// Arranque del servicio
// ---------------------------------------------------------------------------

/**
 * Debe llamarse UNA vez al inicializar el sistema (init).
 * Registra los hooks que mantienen los estados al día.
 */
export function inicializarServicioEstados()
{
  if (!ACTIVAR_ESTADOS) return;

  // CADUCIDAD: al ARRANCAR una ronda nueva (asalto), caducamos el CORROSIVO que
  // toque. El INCENDIADO no caduca solo (se apaga a mano). El hook entrega el
  // combate ya actualizado, así que combat.round es la ronda que arranca.
  Hooks.on("combatRound", (combat) =>
  {
    const ronda = Number(combat?.round ?? 0) || 0;
    if (ronda <= 0) return;
    caducarEstadosEnRonda(ronda);
  });

  // RED DE SEGURIDAD: por si algún flujo cambia la RONDA sin disparar el hook
  // "combatRound" (p.ej. una edición manual del asalto en el tracker, o un
  // módulo que toque el combate). Escuchamos "updateCombat" y, SOLO cuando la
  // ronda cambia de verdad, volvemos a caducar. Evita depender de un único hook.
  Hooks.on("updateCombat", (combat, cambios) =>
  {
    if (cambios?.round === undefined) return;      // la ronda no ha cambiado
    const ronda = Number(combat?.round ?? 0) || 0;
    if (ronda <= 0) return;
    caducarEstadosEnRonda(ronda);
  });

  // AL ARRANCAR (ready): caducamos estados "colgados" de rondas anteriores, por
  // si la sesión se cerró a medias. Usamos la ronda actual del combate activo.
  // Además REPARAMOS los efectos de estado ya guardados que pudieran tener el
  // "img" o el "statuses" mal (p.ej. efectos creados durante una versión anterior
  // con el icono roto): los normalizamos para que Foundry pueda pintarlos sin
  // fallar (un "img" indefinido provoca "Texture loading failed").
  Hooks.on("ready", () =>
  {
    const ronda = Number(game?.combat?.round ?? 0) || 0;
    if (ronda > 0) caducarEstadosEnRonda(ronda);
    _repararEfectosDeEstadoExistentes();
  });

  // NORMALIZACIÓN de efectos creados "a mano" desde la interfaz de Foundry
  // (aplicar un status al token, etc.). En esos casos Foundry crea el
  // ActiveEffect con su status pero SIN nuestro flag, con lo que la hoja y el
  // CÁLCULO no lo verían. Aquí, si el efecto es de uno de NUESTROS estados y le
  // falta el flag, el img o el status, lo "materializamos" para que quede igual
  // que si lo hubiera creado el servicio. Así "aplicar en el token" == "aplicar
  // en la hoja".
  //
  // OJO: SOLO en createActiveEffect (no en updateActiveEffect) para no reescribir
  // el efecto en cada cambio (evita bucles y parpadeos del icono).
  Hooks.on("createActiveEffect", (efecto) => { _normalizarEfectoAMano(efecto); });
}

/**
 * ¿A qué CLAVE de estado (del catálogo) corresponde un efecto, por su status/id?
 * Devuelve "corrosivo" | "incendiado" | null.
 * @param {ActiveEffect} e
 */
function _claveDeEfecto(e)
{
  for (const clave of Object.keys(Ad6?.Estados ?? {}))
  {
    const def = _def(clave);
    if (def?.id && _esEfectoDe(e, def.id)) return clave;
  }
  return null;
}

/**
 * MATERIALIZA (si procede) un efecto de estado creado/actualizado a mano:
 * si es uno de NUESTROS estados y le falta el flag ad6-robotech.estado (o su img
 * no es la del catálogo), escribe esos datos para que el efecto quede idéntico a
 * uno creado por el servicio. Idempotente y sin recursión: solo escribe cuando
 * falta algo.
 *
 * @param {ActiveEffect} efecto
 */
async function _normalizarEfectoAMano(efecto)
{
  try
  {
    if (!efecto) return;
    const clave = _claveDeEfecto(efecto);
    if (!clave) return;

    const def = _def(clave);
    const actor = efecto.parent;
    // Solo escribimos si este cliente puede editar el actor (dueño o GM).
    if (!_puedeEscribir(actor)) return;

    const datosActuales = _datosDe(efecto);
    const imgActual = efecto.img;
    // Ruta de imagen deseada: SIEMPRE definida (nunca undefined/null).
    const imgDeseada = def.img ?? imgActual ?? "icons/svg/aura.svg";

    // ¿Hay algo que normalizar? (falta el flag, el img no es el del catálogo, o
    // NO lleva registrado su status —lo que impide que se pinte el icono—)
    const faltaFlag   = !datosActuales;
    const faltaImg    = (imgActual !== imgDeseada);
    const faltaStatus = !_statusesDe(efecto).includes(def.id);

    if (!faltaFlag && !faltaImg && !faltaStatus) return;

    const datos = datosActuales ?? _datosPorDefecto(clave, def);

    const update = { name: _nombreEstado(def, datos) };
    if (faltaFlag) update[`flags.${ID_FLAG}.estado`] = datos;
    if (faltaImg) update.img = imgDeseada;
    // Nos aseguramos de que el efecto tenga registrado su status (para que
    // Foundry pinte el icono del token).
    if (faltaStatus) update.statuses = [def.id];

    await efecto.update(update);
  }
  catch (e)
  {
    console.error("[AD6][Estados] Error normalizando efecto de estado:", e);
  }
}

/**
 * REPARA al arrancar (ready) los efectos de estado YA GUARDADOS en los actores:
 * recorre todos los actores del mundo y, para cada efecto que sea de NUESTROS
 * estados, aplica la misma normalización (flag/img/statuses). Sirve para curar
 * efectos creados antes con datos a medias (p.ej. img indefinido) que de otro
 * modo seguirían rompiendo el pintado del icono ("Texture loading failed").
 *
 * Es seguro y no rompe nada: si no hay nada que reparar, no hace ninguna
 * escritura (la normalización es idempotente).
 */
function _repararEfectosDeEstadoExistentes()
{
  try
  {
    for (const actor of (game.actors ?? []))
    {
      if (!_puedeEscribir(actor)) continue;
      for (const efecto of (actor.effects ?? []))
      {
        // Solo nos interesan los efectos de NUESTROS estados.
        if (_claveDeEfecto(efecto)) _normalizarEfectoAMano(efecto);
      }
    }
  }
  catch (e)
  {
    console.error("[AD6][Estados] Error reparando efectos de estado:", e);
  }
}
