/**
 * Servicio de INICIATIVA / ESTADO DE COMBATE (fuera de combate)
 * ============================================================================
 * Punto ÚNICO y CENTRALIZADO que mantiene sincronizado el estado "DERROTADO"
 * del COMBATIENTE (Combatant.defeated) Y LA SUPERPOSICIÓN VISUAL del token
 * (efecto de estado DEFEATED con overlay:true) con las reglas del sistema,
 * definidas en el módulo puro model/ad6_derrotado.mjs.
 *
 * ¿POR QUÉ ESTE SERVICIO?
 *   En Foundry, "derrotado" NO vive en el Actor: vive en el COMBATIENTE
 *   (Combatant.defeated), que es lo que marca el tracker. Además, la capa visual
 *   del token (la calavera y la etiqueta "+ muerto") NO depende de "defeated",
 *   sino de un EFECTO DE ESTADO (statusEffect DEFEATED con overlay:true) sobre
 *   el actor. El botón de la calavera del CombatTracker nativo hace LAS DOS
 *   cosas (ver CombatTracker#_onToggleDefeatedStatus). Este servicio replica
 *   ambas cuando cambia algo en el Actor.
 *   La fuente de verdad de las reglas es el Actor (su system).
 *   Este servicio es el pegamento entre ambos: cuando algo cambia en el Actor
 *   que puede dejarlo fuera de combate, recalcula y actualiza el/los
 *   combatiente(s) que lo representan.
 *
 * GATILLO: se apoya en el HOOK NATIVO `updateActor`, que Foundry emite en TODO
 *   cambio de datos de un Actor (venga de una hoja, de una macro o del propio
 *   servicio de combate al aplicar daño). Así NO hay que diseminar llamadas por
 *   todas las hojas: basta con escribir en el actor como siempre.
 *
 * SINCRONIZACIÓN: el cambio de `defeated` en el combatiente SÍ dispara
 *   `updateCombatant`, pero NO re-lanza `updateActor`; por eso no hay bucle.
 *   Aun así, solo escribimos cuando el valor CAMBIA de verdad.
 *
 * Todo el código y los comentarios están en castellano a propósito.
 */

import { estaDerrotado, esTipoGestionado } from "../../model/ad6_derrotado.mjs";
import { esCombatantDeFase } from "./ad6_servicioCombate.mjs";

/**
 * Recalcula y sincroniza el estado "derrotado" de TODOS los combatientes que
 * representan al actor dado.
 *
 * @param {Actor} actor
 * @returns {Promise<number>} nº de combatientes cuyo estado cambió.
 */
export async function sincronizarDerrotadoDeActor(actor)
{
  if (!actor || !esTipoGestionado(actor)) return 0;

  const debeEstarDerrotado = estaDerrotado(actor);
  let cambios = 0;

  // 1) Sincronizamos el OVERLAY visual del token UNA sola vez por actor (el
  //    efecto vive en el actor, no en el combatiente). Replica el botón de la
  //    calavera del CombatTracker: activa/desactiva el statusEffect DEFEATED con
  //    overlay:true. Es idempotente (ver _sincronizarOverlayDerrotado).
  if (await _sincronizarOverlayDerrotado(actor, debeEstarDerrotado)) cambios++;

  // 2) Sincronizamos el flag "defeated" de CADA combatiente que represente al
  //    actor. Un mismo actor puede estar en VARIOS combates (raro, pero posible)
  //    y, si no hay tokens vinculados, en varios combatientes del mismo combate.
  for (const combate of (game.combats ?? []))
  {
    for (const combatiente of combate.combatants)
    {
      // Los Combatants de FASE (tiradas fijadas) son presentación pura y NO
      // llevan el estado "derrotado": este solo vive en el Combatant de
      // PRESENCIA (todo ocurre simultáneamente en el juego).
      if (esCombatantDeFase(combatiente)) continue;

      if (!_combatienteEsDeActor(combatiente, actor)) continue;

      // Solo escribimos si CAMBIA de verdad (evita updates innecesarios y ruido).
      if (combatiente.defeated === debeEstarDerrotado) continue;
      if (!_puedeEscribirCombatiente(combatiente)) continue;

      await combatiente.update({ defeated: debeEstarDerrotado });
      cambios++;
    }
  }

  return cambios;
}

/**
 * Activa o desactiva la SUPERPOSICIÓN visual de "derrotado" en el actor, igual
 * que el botón de la calavera del CombatTracker:
 *   combatant.actor.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED,
 *                                      { overlay: true, active: isDefeated })
 *
 * IMPORTANTE: NO comprobamos "si ya está puesto" leyendo actor.effects, porque
 * ese chequeo es poco fiable (los statuses de un efecto pueden representarse
 * como Set, el efecto puede vivir en el actor sintético del token, etc.) y era
 * justo lo que impedía QUITAR la calavera. En su lugar confiamos en que
 * toggleStatusEffect es IDEMPOTENTE por diseño (ver Actor#toggleStatusEffect del
 * core):
 *   - ya existe + active:true  -> no hace nada,
 *   - ya existe + active:false -> lo BORRA,
 *   - no existe + active:false -> no hace nada,
 *   - no existe + active:true  -> lo CREA.
 * Así, pidiendo SIEMPRE el estado deseado con `active`, converge tanto al poner
 * como al quitar.
 *
 * El efecto se guarda en el actor, así que se llama UNA vez por actor (no por
 * combatiente).
 *
 * @param {Actor} actor
 * @param {boolean} activo
 * @returns {Promise<boolean>} true si la llamada se hizo (por si el llamador
 *                             quiere contar algún cambio).
 */
async function _sincronizarOverlayDerrotado(actor, activo)
{
  if (!actor) return false;

  // El id del efecto de estado "derrotado" depende del sistema/mods; el core lo
  // expone en CONFIG.specialStatusEffects.DEFEATED. Si no existe, no hacemos nada.
  const defeatedId = CONFIG?.specialStatusEffects?.DEFEATED;
  if (!defeatedId) return false;

  // Permisos: necesitamos poder editar el actor para tocar sus efectos.
  if (!actor.isOwner && !game.user?.isGM) return false;

  // Idempotente: dejamos el estado exactamente como "activo" indica.
  await actor.toggleStatusEffect(defeatedId, { overlay: true, active: activo });
  return true;
}

/**
 * Recalcula y sincroniza el estado "derrotado" de TODOS los actores gestionados
 * en TODOS los combates. Se usa, por ejemplo, al arrancar (ready) para poner al
 * día escenas ya preparadas y tras cambios de combate.
 *
 * @returns {Promise<number>} nº de combatientes cuyo estado cambió.
 */
export async function sincronizarTodos()
{
  let cambios = 0;
  for (const actor of (game.actors ?? []))
  {
    cambios += await sincronizarDerrotadoDeActor(actor);
  }
  return cambios;
}

/**
 * ¿El combatiente representa al actor indicado?
 * Se compara por actorId (independiente de tokens: unlinked comparte actorId) y,
 * por seguridad, por uuid del actor normalizado al del mundo.
 * @param {Combatant} combatiente
 * @param {Actor} actor
 */
function _combatienteEsDeActor(combatiente, actor)
{
  if (!combatiente || !actor) return false;
  // Caso normal: mismo actorId (cubre tokens vinculados y no vinculados).
  if (combatiente.actorId && combatiente.actorId === actor.id) return true;
  // Respaldo por uuid del actor del mundo.
  const uuidActor = combatiente.actor?.uuid ?? "";
  return uuidActor === actor.uuid;
}

/**
 * ¿Puede ESTE cliente escribir en ese combatiente? (duelo de permisos).
 * El GM siempre puede; un jugador solo si es dueño del combatiente/actor.
 */
function _puedeEscribirCombatiente(combatiente)
{
  if (game.user?.isGM) return true;
  return combatiente?.isOwner === true;
}

/**
 * Debe llamarse UNA vez al inicializar el sistema (init).
 */
export function inicializarServicioIniciativa()
{
  // GATILLO PRINCIPAL: cualquier cambio en un Actor. Foundry emite este hook en
  // TODO update (hoja, macro, servicio de daño, etc.). Es el punto único donde
  // decidimos si hay que marcar/desmarcar "derrotado". Como corre en un handler
  // async, no bloquea el update.
  Hooks.on("updateActor", (actor, cambios, opciones, userId) => {
    // El cambio de "defeated" ocurre en el Combatant, no aquí: no hay reentrada.
    sincronizarDerrotadoDeActor(actor);
  });

  // Al ARRANCAR (ready): sincronizamos todas las escenas ya preparadas, por si
  // el estado quedó obsoleto entre sesiones.
  Hooks.on("ready", () => {
    sincronizarTodos();
  });

  // Al crear/borrar combatientes o combates, re-evaluamos para reflejar el
  // estado correcto en cuanto un actor entra en la iniciativa (o al reordenar).
  Hooks.on("createCombatant", (combatiente) => {
    // Los Combatants de fase (tiradas fijadas) no llevan "derrotado": se ignoran.
    if (esCombatantDeFase(combatiente)) return;
    const actor = combatiente?.actor;
    if (actor) sincronizarDerrotadoDeActor(actor);
  });

  // Al cambiar de ronda/asalto, re-evaluamos todo (por si algo quedó obsoleto).
  Hooks.on("combatRound", () => {
    sincronizarTodos();
  });
}
