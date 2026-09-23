/**
 * Servicio de Asistencia
 * ----------------------------------------------------------------------------
 * Encapsula TODA la lógica de las tiradas de la fase "Asistir":
 *   - Mantener el "Pool de Asistencia" de cada actor que asistió con éxito.
 *   - Consultar los pools activos de la partida.
 *   - Destruir un pool (manual por el GM, automático al agotarse, o al cambiar
 *     de ronda).
 *   - Tomar 1 o todos los éxitos de un pool y sumarlos a la última tirada de
 *     chat del actor que los toma (actualizando el flag del mensaje y su
 *     contenido renderizado).
 *   - Resolver "qué actor pulsa" los botones de la ventana compartida.
 *
 * ALMACENAMIENTO Y SINCRONIZACIÓN (patrón heredado de la versión antigua):
 *   El pool NO vive en ningún documento. Vive en un estado global por cliente
 *   (game.ad6_assistPools), que cada usuario puede modificar sin problemas de
 *   PERMISOS (no se actualiza ningún actor ajeno). La sincronización entre
 *   clientes se hace con "mensajes-aviso" de chat con flags: cuando alguien
 *   toma o elimina éxitos, emite un ChatMessage con un flag que el resto de
 *   clientes escucha para actualizar su propia copia.
 *
 * No tiene nada de interfaz: de eso se encarga Ad6_AppAsistencia.
 *
 * Todo el código y los comentarios están en castellano a propósito.
 */

import { Ad6_AppAsistencia } from './ad6_appAsistencia.mjs';

const ID_FLAG = "ad6-robotech";        // namespace de flags del sistema
const CLAVE_TIRADA = "tirada";         // clave del flag de tirada en los mensajes

// Claves de los "mensajes-aviso" de sincronización (van en flags del mensaje).
const AVISO_POOL = "asistenciaPool";  // { actorUuid, pool|null }
// pool = { actorUuid, nombre, img, inicial, restantes }  |  null => eliminado

// ---------------------------------------------------------------------------
// Estado global por cliente
// ---------------------------------------------------------------------------

/**
 * Estructura: game.ad6_assistPools = {
 *    [actorUuid]: { actorUuid, nombre, img, inicial, restantes }
 * }
 * Se mantiene viva en memoria mientras dure la sesión; se reconstruye al
 * arrancar leyendo el historial de chat (ver _sembrarDesdeMensajes).
 */
function pools()
{
  if (!game.ad6_assistPools) game.ad6_assistPools = {};
  return game.ad6_assistPools;
}

/** Emite un aviso al usuario (por si algún día cambiamos de sistema de avisos). */
function avisar(texto, tipo = "warn")
{
  if (tipo === "error") ui.notifications.error(texto);
  else ui.notifications.warn(texto);
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Crea o acumula el pool de asistencia del actor tras una tirada de Asistir.
 * @param {Actor} actor    Actor que tiró (el que asistió).
 * @param {number} exitos  Éxitos obtenidos en esa tirada (siempre > 0).
 */
export async function registrarAsistencia(actor, exitos)
{
  if (!actor || !(exitos > 0)) return;
  anotarPool(actor, Number(exitos));
  // Avisamos al resto de clientes para que creen/actualicen su copia del pool.
  await _emitirAvisoPool(actor.uuid);
}

/** Crea/acumula un pool a partir de datos mínimos del actor. */
function anotarPool(actor, exitos)
{
  const store = pools();
  const previo = store[actor.uuid];
  const inicialPrevio   = previo ? Number(previo.inicial   ?? 0) : 0;
  const restantePrevio  = previo ? Number(previo.restantes ?? 0) : 0;

  store[actor.uuid] = {
     actorUuid: actor.uuid
    ,nombre:    actor.name
    ,img:       actor.img
    ,inicial:   inicialPrevio  + Number(exitos)
    ,restantes: restantePrevio + Number(exitos)
  };
}

/**
 * Acumula éxitos a un pool existente a partir del uuid del actor (lo usan los
 * clientes al sembrar desde el historial de chat).
 */
function acumularPool(actorUuid, exitos, extras = {})
{
  const store = pools();
  const previo = store[actorUuid];
  const inicialPrevio   = previo ? Number(previo.inicial   ?? 0) : 0;
  const restantePrevio  = previo ? Number(previo.restantes ?? 0) : 0;

  store[actorUuid] = {
     actorUuid: actorUuid
    ,nombre:    extras.nombre ?? previo?.nombre ?? "Desconocido"
    ,img:       extras.img    ?? previo?.img    ?? ""
    ,inicial:   inicialPrevio  + Number(exitos)
    ,restantes: restantePrevio + Number(exitos)
  };
}

/** Devuelve la lista de pools activos, con datos listos para pintar. */
export function obtenerPoolsActivos()
{
  const store = pools();
  const res = [];
  for (const actorUuid of Object.keys(store))
  {
    const p = store[actorUuid];
    if (!p) continue;
    res.push({
       actorUuid: actorUuid
      ,nombre:    p.nombre    ?? "Desconocido"
      ,img:       p.img       ?? ""
      ,inicial:   Number(p.inicial   ?? 0)
      ,restantes: Number(p.restantes ?? 0)
    });
  }
  return res;
}

/**
 * Destruye el pool del actor indicado por su uuid.
 * @param {string}  actorUuid
 * @param {boolean} avisarATodos  Si true, emite el mensaje-aviso para que el
 *                                resto de clientes también lo eliminen.
 */
export async function destruirPool(actorUuid, avisarATodos = true)
{
  delete pools()[actorUuid];

  if (avisarATodos)
  {
    await _emitirAvisoPool(actorUuid); // el pool ya no existe => aviso de borrado
  }
}

/**
 * Toma éxitos de un pool y los suma a la última tirada de chat del actor que
 * los toma.
 *
 * @param {Actor} actorQuePulsa  Actor que pulsa el botón (recibe los éxitos).
 * @param {string} actorUuidPool Uuid del pool del que se toman los éxitos.
 * @param {number} cantidad      Éxitos a tomar (1, o todos).
 * @returns {Promise<boolean>}   true si se aplicó correctamente.
 */
export async function tomarExitos(actorQuePulsa, actorUuidPool, cantidad)
{
  if (!actorQuePulsa)
  {
    avisar(game.i18n.localize("Ad6.Asistencia.avisos.sinActor"));
    return false;
  }

  const pool = pools()[actorUuidPool];
  if (!pool)
  {
    avisar(game.i18n.localize("Ad6.Asistencia.avisos.poolInexistente"));
    return false;
  }

  // Leemos "restantes" en el momento del click (no del render) para minimizar
  // condiciones de carrera entre varios jugadores.
  const restantes = Number(pool.restantes ?? 0);
  if (restantes <= 0)
  {
    avisar(game.i18n.localize("Ad6.Asistencia.avisos.sinExitos"));
    return false;
  }

  const n = Math.min(Number(cantidad) || 0, restantes);
  if (n <= 0) return false;

  // 1) Sumar los éxitos a la última tirada del actor que pulsa. Si esto falla
  //    (no hay tirada, ya está fijada o no hay permiso) NO consumimos del pool.
  const aplicado = await sumarExitosAlUltimoMensaje(actorQuePulsa, n);
  if (!aplicado) return false;

  // 2) Restar del pool y sincronizar con el resto de clientes.
  const nuevosRestantes = restantes - n;
  if (nuevosRestantes <= 0)
  {
    // Destruye el pool en todos los clientes (aviso de eliminación).
    await destruirPool(actorUuidPool, true);
  }
  else
  {
    pool.restantes = nuevosRestantes;
    // Avisamos a todos con el snapshot actualizado del pool.
    await _emitirAvisoPool(actorUuidPool);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Sincronización por mensajes-aviso
// ---------------------------------------------------------------------------

/**
 * Emite un "mensaje-aviso" de chat con un flag que el resto de clientes
 * escuchan para sincronizar los pools. Lleva un "snapshot" del pool (o null si
 * el pool se eliminó). El aviso no tiene contenido visible y se oculta del log
 * con el hook renderChatMessageHTML (ver abajo).
 */
async function _emitirAvisoPool(actorUuid)
{
  const pool = pools()[actorUuid] ?? null;

  await ChatMessage.create({
     content: ""
    ,speaker: { alias: "Asistencia" }
    ,whisper: [] // sin destinatarios: llega a todos pero no se "susurra" a nadie
    ,flags: {
      "ad6-robotech": {
        [AVISO_POOL]: {
           actorUuid: actorUuid
          ,pool: pool ? { ...pool } : null
        }
      }
    }
  });
}

/** Aplica al estado local un aviso recibido por chat de otro cliente. */
function _procesarAviso(mensaje)
{
  const flags = mensaje?.flags?.[ID_FLAG];
  if (!flags?.[AVISO_POOL]) return false;

  const { actorUuid, pool } = flags[AVISO_POOL];
  if (!actorUuid) return false;

  const store = pools();
  if (pool)
  {
    // Upsert: reemplazamos por el snapshot recibido.
    store[actorUuid] = { ...pool };
  }
  else
  {
    delete store[actorUuid];
  }
  return true;
}

/** ¿Es un mensaje-aviso de asistencia (oculto en el log)? */
function esMensajeAviso(mensaje)
{
  return !!mensaje?.flags?.[ID_FLAG]?.[AVISO_POOL];
}

// ---------------------------------------------------------------------------
// Mensajes de chat
// ---------------------------------------------------------------------------

/** Busca el último mensaje de tirada de un actor (por el flag de tirada). */
export function ultimoMensajeTirada(actor)
{
  if (!game.messages || !actor) return null;
  const candidatos = game.messages.contents.filter(m =>
    m.flags?.[ID_FLAG]?.[CLAVE_TIRADA] &&
    (m.flags[ID_FLAG][CLAVE_TIRADA].actorUuid === actor.uuid ||
     m.flags[ID_FLAG][CLAVE_TIRADA].actorId   === actor.id)
  );
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return candidatos[0];
}

/** ¿La última tirada de este actor ya está fijada? */
export function esUltimaTiradaFijada(actor)
{
  const msg = ultimoMensajeTirada(actor);
  return !!msg?.flags?.[ID_FLAG]?.[CLAVE_TIRADA]?.fijado;
}

/**
 * Suma n éxitos a la última tirada del actor, actualizando:
 *   - el flag del mensaje (exitos += n, asistenciaRecibida += n)
 *   - el contenido renderizado del mensaje (para que se vea el nuevo número)
 * Devuelve true si se pudo aplicar.
 */
export async function sumarExitosAlUltimoMensaje(actor, n)
{
  const msg = ultimoMensajeTirada(actor);
  if (!msg)
  {
    avisar(game.i18n.localize("Ad6.Asistencia.avisos.sinTirada"));
    return false;
  }

  const datosTirada = msg.flags[ID_FLAG][CLAVE_TIRADA];
  if (datosTirada.fijado)
  {
    avisar(game.i18n.localize("Ad6.Asistencia.avisos.tiradaFijada"));
    return false;
  }

  // El jugador sólo puede editar mensajes de los que es autor; el GM, todos.
  if (!msg.canUserModify(game.user, "update"))
  {
    avisar(game.i18n.localize("Ad6.Asistencia.avisos.sinPermisoMensaje"));
    return false;
  }

  const exitosNuevos = Number(datosTirada.exitos ?? 0) + n;
  const recibidoNuevo = Number(datosTirada.asistenciaRecibida ?? 0) + n;

  // Datos para re-renderizar el contenido del mensaje con el nuevo total.
  // Conservamos "sinergia" para que el icono no desaparezca al refrescar.
  const datosChat = {
     tipo:   game.i18n.localize("Ad6.TipoTirada." + (datosTirada.tipo ?? "normal"))
    ,fase:   game.i18n.localize("Ad6.FaseAccion." + (datosTirada.fase ?? "ninguna"))
    ,error:  ""
    ,dados:  datosTirada.dados ?? []
    ,exitos: exitosNuevos
    ,sinergia: datosTirada.sinergia === true
  };

  const nuevoContenido = await foundry.applications.handlebars.renderTemplate(
    "systems/ad6_robotech/templates/chat/msgTirada.hbs", datosChat);

  await msg.update({
     content: nuevoContenido
    ,[`flags.${ID_FLAG}.${CLAVE_TIRADA}.exitos`]: exitosNuevos
    ,[`flags.${ID_FLAG}.${CLAVE_TIRADA}.asistenciaRecibida`]: recibidoNuevo
  });

  return true;
}

/**
 * Marca como "fijada" la última tirada de un actor. Una tirada fijada ya no
 * admite más asistencia (regla de diseño).
 */
export async function marcarTiradaFijada(actor)
{
  const msg = ultimoMensajeTirada(actor);
  if (!msg) return;
  if (!msg.canUserModify(game.user, "update")) return; // nada que hacer
  if (msg.flags?.[ID_FLAG]?.[CLAVE_TIRADA]?.fijado) return;
  await msg.update({ [`flags.${ID_FLAG}.${CLAVE_TIRADA}.fijado`]: true });
}

// ---------------------------------------------------------------------------
// Resolución del "actor que pulsa"
// ---------------------------------------------------------------------------

// Últimas hojas AD6 enfocadas por usuario (lo escriben las propias hojas).
const _ultimoActorPorUsuario = new Map();

/** Lo llama la hoja base en su _onRender para anotar la hoja enfocada. */
export function anotarHojaEnfocada(actor)
{
  if (!game.user || !actor) return;
  _ultimoActorPorUsuario.set(game.user.id, actor);
}

/** Devuelve la última hoja enfocada por el usuario actual (o null). */
function actorDeHojaEnfocada()
{
  const a = _ultimoActorPorUsuario.get(game.user?.id);
  if (a && !game.actors.get(a.id)) return null;
  return a ?? null;
}

/** Todos los actores que el usuario actual puede "representar". */
export function actoresDelUsuario()
{
  const res = [];
  if (game.user.character) res.push(game.user.character);
  for (const a of game.actors)
  {
    if (res.some(x => x.id === a.id)) continue;
    if (a.isOwner) res.push(a);
  }
  return res;
}

/**
 * Resuelve, por prioridad, el actor que debe recibir los éxitos:
 *   1) Hoja AD6 con foco del usuario (cubre al GM con muchas fichas).
 *   2) game.user.character (personaje asignado al jugador).
 *   3) Si hay varios candidatos, el primero (la app ofrece selector igualmente).
 */
export function resolverActorQuePulsa()
{
  const candidatos = actoresDelUsuario();

  const enfocado = actorDeHojaEnfocada();
  if (enfocado && enfocado.isOwner) return { actor: enfocado, multiple: candidatos.length > 1 };

  if (game.user.character) return { actor: game.user.character, multiple: candidatos.length > 1 };

  return { actor: candidatos[0] ?? null, multiple: candidatos.length > 1 };
}

// ---------------------------------------------------------------------------
// Siembra del estado al arrancar
// ---------------------------------------------------------------------------

/**
 * Reconstruye los pools leyendo el historial de chat. La fuente de verdad es:
 *   - mensajes de tirada (flag tirada) con fase "soporteAsistir" y exitos > 0
 *     -> suman al pool del actor.
 *   - mensajes-aviso de consumo/eliminación -> ajustan/borran el pool.
 * Se recorren en orden cronológico para que el resultado sea el estado final.
 */
function _sembrarDesdeMensajes()
{
  if (!game.messages) return;

  const mensajes = [...game.messages.contents].sort(
    (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  for (const m of mensajes)
  {
    const flags = m.flags?.[ID_FLAG];
    if (!flags) continue;

    // Tirada de Asistir => crea/acumula pool. OJO: el pool sólo existe para
    // tiradas YA FIJADAS (se generó al fijar), no para tiradas que aún no se
    // han asignado a un slot de la ronda.
    const t = flags[CLAVE_TIRADA];
    if (t && t.fase === "soporteAsistir" && t.fijado === true)
    {
      // Los "exitos" del flag pueden haberse incrementado al recibir asistencia
      // en esa misma tirada (los guardamos también en asistenciaRecibida). Para
      // el pool sólo cuentan los éxitos ORIGINALES de la tirada de Asistir.
      const originales = Number(t.exitos ?? 0) - Number(t.asistenciaRecibida ?? 0);
      if (originales > 0)
      {
        const actor = game.actors.get(t.actorId);
        acumularPool(t.actorUuid ?? actor?.uuid, originales, {
           nombre: actor?.name
          ,img:    actor?.img
        });
      }
      continue;
    }

    // Aviso de consumo / eliminación => ajusta el estado.
    _procesarAviso(m);
  }
}

// ---------------------------------------------------------------------------
// Hooks y ciclo de vida
// ---------------------------------------------------------------------------

/**
 * Debe llamarse una sola vez al inicializar el sistema (en "init"/"ready").
 */
export function inicializarServicioAsistencia()
{
  // Sincronización: cada vez que llega un mensaje-aviso (de cualquier cliente),
  // aplicamos el cambio a nuestra copia local y refrescamos la ventana.
  Hooks.on("createChatMessage", (mensaje) => {
    if (_procesarAviso(mensaje)) _revisarVentana();
  });

  // Oculta del log los mensajes-aviso (no deben verse en el chat).
  Hooks.on("renderChatMessageHTML", (mensaje, html) => {
    if (esMensajeAviso(mensaje) && html?.classList) html.classList.add("ad6-asistencia-aviso");
  });

  // Si se borra un actor, quitamos su pool (no reflejar un pool huérfano).
  Hooks.on("deleteActor", (actor) => {
    if (pools()[actor.uuid])
    {
      delete pools()[actor.uuid];
      _revisarVentana();
    }
  });

  // Cambio de ronda/asalto: limpiamos todos los pools automáticamente.
  Hooks.on("combatRound", () => {
    _limpiarTodos();
  });

  // Al terminar de cargar todo, sembramos desde el historial y revisamos.
  Hooks.once("ready", () => {
    _sembrarDesdeMensajes();
    _revisarVentana();
  });
}

/** Vacía todos los pools (cambio de ronda). */
function _limpiarTodos()
{
  game.ad6_assistPools = {};
  _revisarVentana();
}

/** Abre/actualiza o cierra la ventana según haya pools activos o no. */
function _revisarVentana()
{
  const hayPools = obtenerPoolsActivos().length > 0;
  if (hayPools) Ad6_AppAsistencia.abrirORefrescar();
  else Ad6_AppAsistencia.cerrarSiVacio();
}
