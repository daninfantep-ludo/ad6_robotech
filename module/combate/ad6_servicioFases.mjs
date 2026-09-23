/*3333333333*
 * Servicio de FASES (orquestador de Combatants de FASE)
 * ============================================================================
 * Este sistema NO tiene "iniciativa": el turno se organiza en tres MACROFASES
 * (soporte -> operaciones -> cinemática), cada una con sus subfases. Un actor
 * puede intervenir en dos macrofases distintas, por lo que puede aparecer DOS
 * veces en el combat tracker.
 *
 * MODELO (acordado):
 *   - Un "Combatant de PRESENCIA" es el que el GM añade arrastrando un token al
 *     combate. Representa "un actor en la liza". NO se muestra en el tracker.
 *     Es el que gobierna la selección de objetivos y el estado "derrotado".
 *   - Un "Combatant de FASE" representa UNA TIRADA FIJADA (slot tirada1/tirada2/
 *     tirada3) de un actor. SÍ se muestra en el tracker. No tiene token.
 *
 * REGLA CLAVE: solo hay Combatants de fase para actores que YA están en el
 * combate (tienen Combatant de presencia). El GM decide quién entra a la liza.
 *
 * FUENTE DE VERDAD: los slots de tirada del actor (tirada1/tirada2/tirada3). Este
 * servicio RECONCILIA el estado de los Combatants de fase con esos slots (crea
 * los que faltan, actualiza los que cambiaron, borra los que ya no proceden). La
 * reconciliación es IDEMPOTENTE y se dispara desde el hook `updateActor`.
 *
 * ORDEN EN EL TRACKER: no hay cabeceras de fase. Se ordenan por el campo
 * `initiative`, que codificamos como:
 *     base(superFase) - orden(subfase)
 *   soporte = 300, operaciones = 200, cinematica = 100 (orden descendente del
 *   core). La superfase manda; dentro, el orden de la subfase.
 *
 * Todo el código y los comentarios están en castellano a propósito.
 */

import { FLAG_COMBATANT_FASE, esCombatantDeFase } from "./ad6_servicioCombate.mjs";
import * as Func from "../../model/funciones.mjs";
import { SLOTS_TIRADA } from "../../model/funciones.mjs";

const ID_FLAG = "ad6-robotech";

// Base de "initiative" por macrofase (manda el orden descendente del core).
const BASE_SUPERFASE = {
   soporte:     300
  ,operaciones: 200
  ,cinematica:  100
  ,ninguna:      50
};

// Orden interno de las subfases dentro de su macrofase (para el desempate).
const ORDEN_SUBFASE = {
   soporteAsistir:        50
  ,soporteObservar:       40
  ,soporteOcultar:        30
  ,operacionesAtacar:     50
  ,operacionesDefender:   40
  ,operacionesRedirigir:  30
  ,cinematicaInteractuar: 50
  ,cinematicaInhibir:     40
};

// Los slots de tirada que pueden generar un Combatant de fase (lista canónica
// compartida: tirada1/tirada2/tirada3).
const SLOTS = SLOTS_TIRADA;

/**
 * Recalcula los Combatants de FASE de un actor a partir de sus tiradas fijadas.
 * Idempotente: si ya coincide, no hace nada.
 *
 * Pasos:
 *   1) Si el actor NO está en el combate (sin Combatant de presencia), no hay
 *      nada que hacer (solo los que están en la liza generan filas de fase).
 *   2) Para cada slot ACTIVO (fase != ""): crear/actualizar su Combatant de fase.
 *   3) Borrar los Combatants de fase de ESE actor cuyo slot ya no esté activo.
 *
 * @param {Actor} actor
 * @param {Combat} [combate]  Combate a usar (por defecto, game.combat).
 * @returns {Promise<number>} nº de cambios aplicados.
 */
export async function reconciliarCombatDeActor(actor, combate = null)
{
  if (!actor) return 0;

  // PERMISOS: solo el GM escribe los Combatants de FASE. La reconciliación es
  // una operación de "administración del combate": si la ejecutara cada cliente
  // (jugadores incluidos) al recibir el updateActor, los que no son dueños del
  // Combatant fallarían con "lacks permission to update Combatant".
  // El estado del tracker se PROPAGA solo: el GM crea/edita/borra el Combatant y
  // Foundry sincroniza el documento a TODOS los clientes.
  if (!game.user?.isGM) return 0;

  const combat = combate ?? game.combat;
  if (!combat) return 0;

  // 1) ¿Está el actor presente en el combate? (Combatant de presencia).
  const presencia = _combatantDePresencia(combat, actor);
  if (!presencia) return 0;

  // Estado deseado: { slot -> datos de fase } para los slots ACTIVOS.
  const deseados = _estadoDeseado(actor);

  // Combatants de fase ACTUALES de ese actor (indexados por slot).
  const actuales = _combatantsDeFaseDeActor(combat, actor);

  let cambios = 0;

  // 2) Crear/actualizar los deseados.
  for (const slot of SLOTS)
  {
    const datos = deseados[slot];
    if (!datos) continue;

    const existente = actuales[slot];
    if (!existente)
    {
      await _crearCombatantDeFase(combat, actor, slot, datos);
      cambios++;
    }
    else if (_necesitaActualizar(existente, actor, slot, datos))
    {
      await _actualizarCombatantDeFase(existente, actor, slot, datos);
      cambios++;
    }
  }

  // 3) Borrar los actuales que ya no proceden (slot vaciado).
  const aBorrar = [];
  for (const slot of SLOTS)
  {
    if (deseados[slot]) continue;
    if (actuales[slot]) aBorrar.push(actuales[slot].id);
  }
  if (aBorrar.length > 0)
  {
    await combat.deleteEmbeddedDocuments("Combatant", aBorrar);
    cambios += aBorrar.length;
  }

  return cambios;
}

/**
 * Recalcula los Combatants de fase de TODOS los actores del combate dado.
 * Se usa al arrancar y al entrar/salir actores de la liza.
 * @returns {Promise<number>}
 */
export async function reconciliarCombatCompleto(combate = null)
{
  // Solo el GM administra los Combatants de fase (mismo motivo que en
  // reconciliarCombatDeActor: evitar escrituras cruzadas sin permiso).
  if (!game.user?.isGM) return 0;

  const combat = combate ?? game.combat;
  if (!combat) return 0;

  let cambios = 0;
  // Actores presentes en el combate (sin duplicar).
  const actores = [];
  for (const c of combat.combatants)
  {
    if (esCombatantDeFase(c)) continue;
    const a = c.actor;
    if (!a) continue;
    if (!actores.some(x => x.id === a.id)) actores.push(a);
  }

  // Si el combate NO tiene ninguna PRESENCIA, no debe haber filas de fase:
  // borramos TODAS (evita "zombies" de un combate que quedó vacío). Es el caso
  // de terminar/limpiar el combate dejándolo sin combatientes de presencia.
  if (actores.length === 0)
  {
    const todos = combat.combatants.filter(c => esCombatantDeFase(c)).map(c => c.id);
    if (todos.length > 0)
    {
      await combat.deleteEmbeddedDocuments("Combatant", todos);
      cambios += todos.length;
    }
    return cambios;
  }

  for (const a of actores)
  {
    cambios += await reconciliarCombatDeActor(a, combat);
  }

  // Limpieza: Combatants de fase cuyo actor ya NO está presente en el combate.
  const idsPresentes = new Set(actores.map(a => a.id));
  const huerfanos = combat.combatants
    .filter(c => esCombatantDeFase(c) && !idsPresentes.has(c.actorId))
    .map(c => c.id);
  if (huerfanos.length > 0)
  {
    await combat.deleteEmbeddedDocuments("Combatant", huerfanos);
    cambios += huerfanos.length;
  }

  return cambios;
}

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

/** Datos de los Combatants de fase DESEADOS para un actor (por slot). */
function _estadoDeseado(actor)
{
  const s = actor.system ?? {};
  const res = {};
  for (const slot of SLOTS)
  {
    const t = s[slot];
    // Slot ACTIVO = tiene una subfase fijada.
    if (!t || (t.fase ?? "") === "") continue;
    res[slot] = {
       fase:      t.fase ?? ""
      ,superFase: t.superFase ?? "ninguna"
      // Macrofase de ORIGEN (icono del tracker). Si la tirada no la trae (datos
      // antiguos), cae a la actual: así el icono coincide con la zona.
      ,superFaseOriginal: t.superFaseOriginal || (t.superFase ?? "ninguna")
      // Subfase de ORIGEN (significado real de la acción: tipo). Si la tirada no
      // la trae (datos antiguos), cae a la actual.
      ,faseOriginal: t.faseOriginal || (t.fase ?? "")
      ,exitos:    Number(t.exitos ?? 0)
      ,sinergia:  t.sinergia === true
      ,initiative: _initiativeDe(t.superFase, t.fase)
    };
  }
  return res;
}

/**
 * Valor de "initiative" para ordenar en el tracker: base de macrofase MENOS el
 * orden de subfase (así dentro de una macrofase, mayor orden = más arriba).
 * Que sea distinto por subfase evita empates y da un orden estable.
 */
function _initiativeDe(superFase, subfase)
{
  const base = BASE_SUPERFASE[superFase] ?? BASE_SUPERFASE.ninguna;
  const ord = ORDEN_SUBFASE[subfase] ?? 10;
  return base + ord / 100;   // decimales: base manda, subfase desempata
}

/** El Combatant de PRESENCIA del actor en el combate (o null). */
function _combatantDePresencia(combat, actor)
{
  return combat.combatants.find(c => !esCombatantDeFase(c) && c.actorId === actor.id) ?? null;
}

/** Borra las tiradas fijadas del actor (vaciado de todos los slots de tirada). */
async function _limpiarTiradas(actor)
{
  await Func.limpiarTiradasGuardadas(actor);
}

/**
 * Deja "limpio" el estado de ronda de un actor para empezar un nuevo asalto:
 *   1) Borra sus tiradas fijadas (todos los slots de tirada).
 *   2) Si el actor es un ENJAMBRE, además restaura system.restantes = system.unidades,
 *      de forma que todas las unidades vuelvan a estar disponibles para actuar.
 *
 * Es idempotente: si el actor ya está limpio, no escribe nada. Se usa tanto en el
 * cambio de asalto (para TODOS los actores presentes) como al añadir un actor a
 * la liza (solo para ESE actor), para que siempre partan "limpios".
 *
 * @param {Actor} actor
 * @returns {Promise<boolean>} true si aplicó algún cambio.
 */
export async function limpiarEstadoDeRondaDeActor(actor)
{
  if (!actor) return false;

  // ¿Hay alguna tirada fijada (con subfase) en cualquier slot?
  const hayTirada = SLOTS.some(slot => ((actor.system?.[slot]?.fase ?? "") !== ""));

  // Restauración de enjambre: system.restantes vuelve a system.unidades.
  let restaurarEnjambre = false;
  if (actor.type === "enjambre")
  {
    const unidades = Number(actor.system?.unidades ?? 0);
    const restantes = Number(actor.system?.restantes ?? 0);
    restaurarEnjambre = (restantes !== unidades);
  }

  if (!hayTirada && !restaurarEnjambre) return false;

  await _limpiarTiradas(actor);
  if (restaurarEnjambre)
  {
    await actor.update({ "system.restantes": Number(actor.system?.unidades ?? 0) });
  }
  return true;
}

/** Map slot -> Combatant de FASE de ese actor en el combate. */
function _combatantsDeFaseDeActor(combat, actor)
{
  const res = {};
  for (const c of combat.combatants)
  {
    if (!esCombatantDeFase(c)) continue;
    if (c.actorId !== actor.id) continue;
    const slot = c.flags?.[ID_FLAG]?.[FLAG_COMBATANT_FASE]?.slot;
    if (slot) res[slot] = c;
  }
  return res;
}

/** ¿Hay que actualizar el Combatant de fase existente con los datos nuevos? */
function _necesitaActualizar(combatant, actor, slot, datos)
{
  const f = combatant.flags?.[ID_FLAG]?.[FLAG_COMBATANT_FASE] ?? {};
  if (f.fase !== datos.fase) return true;
  if (f.superFase !== datos.superFase) return true;
  if ((f.superFaseOriginal ?? f.superFase) !== (datos.superFaseOriginal ?? datos.superFase)) return true;
  if ((f.faseOriginal ?? f.fase) !== (datos.faseOriginal ?? datos.fase)) return true;
  if (Number(f.exitos ?? 0) !== datos.exitos) return true;
  if ((f.sinergia === true) !== datos.sinergia) return true;
  if (Number(combatant.initiative) !== datos.initiative) return true;
  if (combatant.name !== _nombreDeFase(actor, slot, datos)) return true;
  return false;
}

/**
 * Nombre a mostrar en el tracker:
 *   - Sin sinergia: "Actor — Subfase" (la MACROFASE NO se repite en texto: ya
 *     la representa el icono a la derecha de la fila).
 *   - Con sinergia: SOLO el nombre del actor (nada más), porque la sinergia ya
 *     implica que actúa en toda la fase y se marca con su icono.
 *   - Si la acción se ha ACELERADO (Push): SOLO el nombre del actor. La subfase
 *     que muestra "fase" ya sería la de la macrofase destino, y ese texto no
 *     representa el significado real de la acción; por eso se omite.
 */
function _nombreDeFase(actor, slot, datos)
{
  if (datos.sinergia === true) return actor.name;
  // ACELERADA: la subfase actual ya no es la de origen -> no mostrar subfase.
  const acelerada = (datos.faseOriginal || datos.fase) !== datos.fase;
  if (acelerada) return actor.name;
  const subfase = game.i18n.localize("Ad6.FaseAccion." + datos.fase) || datos.fase;
  // El texto del JSON de idioma viene como "[Macrofase] Subfase": quitamos el
  // prefijo entre corchetes (que ya lo representa el icono) y recortamos.
  const limpio = String(subfase).replace(/^\s*\[[^\]]*\]\s*/, "").trim();
  return `${actor.name} — ${limpio}`;
}

/** Datos que van en el flag del Combatant de fase. */
function _flagsDeFase(slot, datos)
{
  return {
    [ID_FLAG]: {
      [FLAG_COMBATANT_FASE]: {
         slot:      slot
        ,fase:      datos.fase
        ,superFase: datos.superFase
        ,superFaseOriginal: datos.superFaseOriginal ?? datos.superFase
        ,faseOriginal: datos.faseOriginal ?? datos.fase
        ,exitos:    datos.exitos
        ,sinergia:  datos.sinergia
      }
    }
  };
}

/** Crea el Combatant de fase del slot indicado. */
async function _crearCombatantDeFase(combat, actor, slot, datos)
{
  await combat.createEmbeddedDocuments("Combatant", [{
     actorId:    actor.id
    ,name:       _nombreDeFase(actor, slot, datos)
    ,img:        actor.img
    ,initiative: datos.initiative
    ,hidden:     false
    ,flags:      _flagsDeFase(slot, datos)
  }]);
}

/** Actualiza el Combatant de fase existente con los datos nuevos. */
async function _actualizarCombatantDeFase(combatant, actor, slot, datos)
{
  await combatant.update({
     name:       _nombreDeFase(actor, slot, datos)
    ,img:        actor.img
    ,initiative: datos.initiative
    ,flags:      _flagsDeFase(slot, datos)
  });
}

/**
 * Debe llamarse UNA vez al inicializar el sistema (init/ready). Engancha la
 * reconciliación al ciclo de vida del combate.
 */
export function inicializarServicioFases()
{
  // GATILLO PRINCIPAL: cualquier cambio en un Actor. Detectamos si cambió alguno
  // de los slots de tirada (system.tirada1/tirada2/tirada3) y, de ser así,
  // reconciliamos SUS Combatants de fase. Punto único: no hay que diseminar
  // llamadas por las hojas.
  Hooks.on("updateActor", (actor, cambios, opciones, userId) => {
    // El hook entrega el diff EXPANDIDO: las tiradas cuelgan de cambios.system.
    const sys = cambios?.system;
    if (!sys || !SLOTS.some(slot => slot in sys)) return;
    reconciliarCombatDeActor(actor);
  });

  // Al crear un Combatant de PRESENCIA (el GM añade un actor a la liza),
  // DEJAMOS LIMPIO el actor recién añadido (borramos sus tiradas y, si es un
  // enjambre, restauramos sus unidades) y después reconciliamos sus Combatants
  // de fase. Así todo actor que entra en el combate parte siempre "limpio",
  // aunque antes hubiera estado fuera tirando dados.
  Hooks.on("createCombatant", async (combatant) => {
    if (!game.user?.isGM) return;               // solo el GM administra el combate
    if (esCombatantDeFase(combatant)) return;   // ignoramos los propios de fase
    const actor = combatant.actor;
    if (!actor) return;
    // Solo si el actor puede escribirse desde este cliente (el GM siempre puede).
    if (!actor.isOwner && !game.user.isGM) return;
    await limpiarEstadoDeRondaDeActor(actor);
    await reconciliarCombatDeActor(actor, combatant.parent);
  });

  // Al borrar un Combatant de PRESENCIA, borramos sus Combatants de fase.
  Hooks.on("deleteCombatant", (combatant) => {
    if (!game.user?.isGM) return;               // solo el GM administra el combate
    if (esCombatantDeFase(combatant)) return;
    const combat = combatant.parent;
    if (!combat) return;
    const huerfanos = combat.combatants
      .filter(c => esCombatantDeFase(c) && c.actorId === combatant.actorId)
      .map(c => c.id);
    if (huerfanos.length > 0) combat.deleteEmbeddedDocuments("Combatant", huerfanos);
  });

  // Al ARRANCAR (ready): reconciliamos todo el combate activo por si quedó
  // desincronizado entre sesiones.
  Hooks.on("ready", () => {
    reconciliarCombatCompleto();
  });

  // Cuando cambia el COMBATE (p.ej. se activa/desactiva, se le añaden o quitan
  // combatientes), reconciliamos completo: así una partida que se queda SIN
  // presencia limpia sus filas de fase (evita "zombies"). Un único cliente: el GM.
  Hooks.on("updateCombat", (combat) => {
    if (!game.user?.isGM) return;
    reconciliarCombatCompleto(combat);
  });

  // Si se borra un combate, aprovechamos para reconciliar el que quede (por si
  // el nuevo combate heredara filas de fase huérfanas de algún modo).
  Hooks.on("deleteCombat", () => {
    if (!game.user?.isGM) return;
    reconciliarCombatCompleto();
  });

  // CAMBIO DE ASALTO (siguiente o anterior): se RESETEA el turno, así que hay
  // que LIMPIAR el estado de ronda de cada actor PRESENTE (los Combatants de
  // presencia): se borran sus tiradas fijadas y, si el actor es un ENJAMBRE,
  // se restauran sus unidades (system.restantes = system.unidades). Los
  // Combatants de fase se limpian solos por la reconciliación que dispara el
  // subsiguiente updateActor (slots de tirada a vacío).
  Hooks.on("combatRound", (combat, updateData, updateOptions) => {
    // Solo actuamos si la ronda ha cambiado de verdad (updateData.round presente).
    if (updateData?.round === undefined) return;

    // Un único cliente ejecuta la limpieza masiva: preferimos el GM (puede
    // editar cualquier actor). Si no hay GM conectado, no hacemos nada (caso
    // raro; el GM es quien suele avanzar el asalto).
    if (!game.user?.isGM) return;

    limpiarEstadoDeRondaDePresencia(combat);
  });
}

/**
 * Limpia el estado de ronda de TODOS los actores con Combatant de PRESENCIA en
 * el combate dado: borra las tiradas fijadas (todos los slots) y, si el
 * actor es un ENJAMBRE, restaura sus unidades (system.restantes = system.unidades).
 * Se usa al cambiar de asalto para resetear el turno. Es idempotente.
 *
 * @param {Combat} combat
 * @returns {Promise<number>} nº de actores limpiados.
 */
export async function limpiarEstadoDeRondaDePresencia(combat)
{
  if (!combat) return 0;

  let limpiados = 0;
  const vistos = new Set();
  for (const c of combat.combatants)
  {
    if (esCombatantDeFase(c)) continue;   // solo presencia
    const actor = c.actor;
    if (!actor) continue;
    if (vistos.has(actor.id)) continue;
    vistos.add(actor.id);

    // Solo cuenta como "limpiado" si de verdad había algo que limpiar.
    if (await limpiarEstadoDeRondaDeActor(actor)) limpiados++;
  }
  return limpiados;
}
