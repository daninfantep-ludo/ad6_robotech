/**
 * Visual de Conflictos (lógica pura)
 * ============================================================================
 * Centraliza la lógica de "qué actores de tipo CONFLICTO están en el combate
 * de la escena actual y quién puede verlos". NO tiene nada de interfaz: de eso
 * se encarga Ad6_AppVisualConflicto (templates/combate/appVisualConflicto.hbs).
 *
 * REGLA DE NEGOCIO (centralización de conflictos, que a veces son abstractos):
 *   - El GM ve SIEMPRE todos los conflictos presentes en el combate.
 *   - Cualquier otro usuario ve SOLO los conflictos con system.visible === true.
 *
 * "Estar en el combate" = tener un Combatant de PRESENCIA en el combate activo
 * (game.combat). Los Combatants de FASE (tiradas fijadas) NO cuentan como
 * presencia: se ignoran. El criterio es idéntico al que usa el servicio de
 * combate para decidir "quién está en la liza" como objetivo.
 *
 * Todo el código y los comentarios están en castellano a propósito.
 */

import { esCombatantDeFase, _normalizarActorDelMundo } from './ad6_servicioCombate.mjs';

const TIPO_CONFLICTO = "conflicto";

/**
 * Devuelve los ACTORES de tipo "conflicto" presentes en el combate activo
 * (game.combat), normalizados al actor del mundo y SIN duplicar.
 *
 * Reglas:
 *   - Solo cuenta la PRESENCIA: los Combatants de FASE se ignoran.
 *   - Los combatientes DERROTADOS no cuentan (un conflicto fuera de combate no
 *     se muestra).
 *   - Si no hay combate activo, devuelve lista vacía.
 *
 * @returns {Actor[]}
 */
export function conflictosDelCombate()
{
  const combat = game.combat;
  if (!combat) return [];

  const res = [];
  for (const c of combat.combatants)
  {
    // Los Combatants de FASE no son presencia: se ignoran.
    if (esCombatantDeFase(c)) continue;

    // Los combatientes derrotados no cuentan.
    if (c.defeated === true) continue;

    // Normalizamos SIEMPRE al actor del mundo (independiente de tokens).
    const a = _normalizarActorDelMundo(c.actor);
    if (!a) continue;

    // Solo conflictos.
    if (a.type !== TIPO_CONFLICTO) continue;

    // Deduplicamos por uuid (un mismo actor podría aparecer en varias filas).
    if (res.some(x => x.uuid === a.uuid)) continue;

    res.push(a);
  }
  return res;
}

/**
 * Devuelve los conflictos que el USUARIO ACTUAL debe ver:
 *   - GM: TODOS los conflictos del combate.
 *   - Jugador: SOLO los que tienen system.visible === true.
 *
 * @returns {Actor[]}
 */
export function conflictosVisiblesParaUsuario()
{
  const conflictos = conflictosDelCombate();
  if (game.user?.isGM) return conflictos;
  return conflictos.filter(a => a.system?.visible === true);
}

/**
 * Construye los DATOS DE PRESENTACIÓN de un conflicto para la ventana.
 *
 * Reglas (acordadas):
 *   - Retrato + nombre: siempre.
 *   - Reloj + tiempoRestante: SOLO si el conflicto está TEMPORIZADO y su
 *     temporizador está marcado como VISIBLE (system.temporizado &&
 *     system.visibleTemporizador). Es igual para GM y jugadores.
 *
 * Los BOTONES de GM (ojo visible / ojo temporizador) y el doble click del
 * retrato NO dependen de estos datos: la plantilla decide según esGM.
 *
 * @param {Actor} actor
 * @returns {{ uuid:string, id:string, nombre:string, img:string,
 *             mostrarTiempo:boolean, tiempoRestante:number,
 *             visible:boolean, visibleTemporizador:boolean }}
 */
export function datosPresentacionConflicto(actor)
{
  const s = actor?.system ?? {};
  const temporizado = s.temporizado === true;
  const visibleTemporizador = s.visibleTemporizador === true;

  return {
     uuid:                 actor.uuid
    ,id:                   actor.id
    ,nombre:               actor.name
    ,img:                  actor.img
    // Reloj + tiempoRestante solo si está temporizado Y su visibilidad marcada.
    //,mostrarTiempo:        (temporizado && visibleTemporizador)
    ,mostrarTiempo:        (temporizado && (game.user?.isGM || visibleTemporizador))
    ,tiempoRestante:       Number(s.tiempoRestante) || 0
    // Estado para los botones del GM (icono correcto tras cada render).
    ,visible:              s.visible === true
    ,visibleTemporizador:  visibleTemporizador
  };
}

