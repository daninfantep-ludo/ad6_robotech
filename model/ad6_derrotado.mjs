/**
 * ESTADO "DERROTADO" (fuera de combate) — módulo PURO, sin estado ni documentos
 * ============================================================================
 * Regla ÚNICA y centralizada para decidir si un actor está FUERA DE COMBATE.
 * Se expone como función pura (recibe el actor y devuelve boolean) para poder
 * reutilizarla desde cualquier sitio (cálculo, hooks, presentación) sin acoplar
 * nada a un DataModel concreto.
 *
 * CRITERIOS por tipo de actor:
 *   - vehiculo   : su ESTRUCTURA restante es 0 (system.estructura.restante).
 *   - teniente   : TODAS sus heridas VISIBLES están marcadas.
 *   - principal  : TODAS sus heridas VISIBLES están marcadas,
 *                  O BIEN todas las casillas de ESTRÉS están ocupadas
 *                  (distintas de "" ; en la práctica "F" o "D").
 *   - enjambre   : sus UNIDADES son 0 (system.unidades).
 *   - conflicto  : (genérico) NO se considera derrotado automáticamente.
 *   - cualquier otro tipo: false (no se decide aquí).
 *
 * El "derrotado" de Foundry vive en el COMBATIENTE (Combatant.defeated), no en
 * el Actor. Este módulo solo dice SI el actor "debería" estar derrotado; la
 * sincronización con los combatientes la hace el servicio de iniciativa.
 *
 * Todo el código y los comentarios están en castellano a propósito.
 */

/**
 * ¿Está este actor FUERA DE COMBATE según las reglas del sistema?
 *
 * @param {Actor} actor  Actor (del mundo) a evaluar.
 * @returns {boolean}
 */
export function estaDerrotado(actor)
{
  if (!actor) return false;
  const s = actor?.system;
  if (!s) return false;

  switch (actor.type)
  {
    case "vehiculo":
      return _vehiculoDerrotado(s);
    case "teniente":
      return _heridasVisiblesTodasMarcadas(s);
    case "principal":
      return _heridasVisiblesTodasMarcadas(s) || _estresCompleto(s);
    case "enjambre":
      return _enjambreDerrotado(s);
    default:
      // conflicto y cualquier otro tipo: no se decide aquí.
      return false;
  }
}

/**
 * VEHÍCULO: derrotado cuando su estructura restante es 0.
 * OJO: system.estructura es un Ad6_Indicador y sus campos son STRING.
 * @param {object} s  actor.system
 */
function _vehiculoDerrotado(s)
{
  const restante = Number(s?.estructura?.restante) || 0;
  return restante <= 0;
}

/**
 * TENIENTE/PRINCIPAL (heridas): derrotado cuando HAY heridas visibles y TODAS
 * las visibles están marcadas. Si no hay NINGUNA herida visible, NO se considera
 * derrotado por este criterio (evita marcar como muerto a un actor sin heridas
 * visibles configuradas).
 * @param {object} s  actor.system
 */
function _heridasVisiblesTodasMarcadas(s)
{
  const heridas = s?.heridas;
  if (!Array.isArray(heridas)) return false;

  let visibles = 0;
  let marcadas = 0;
  for (const h of heridas)
  {
    if (h?.visible !== true) continue;
    visibles++;
    if (h?.marcado === true) marcadas++;
  }
  return visibles > 0 && marcadas === visibles;
}

/**
 * PRINCIPAL (estrés): derrotado cuando TODAS las casillas de estrés están
 * ocupadas (todas distintas de ""). Si el array está vacío, false.
 * @param {object} s  actor.system
 */
function _estresCompleto(s)
{
  const estres = s?.estres;
  if (!Array.isArray(estres) || estres.length === 0) return false;
  return estres.every(v => v !== "" && v !== null && v !== undefined);
}

/**
 * ENJAMBRE: derrotado cuando sus unidades son 0.
 * @param {object} s  actor.system
 */
function _enjambreDerrotado(s)
{
  return (Number(s?.unidades) || 0) <= 0;
}

/**
 * ¿Es este un tipo de actor gestionado por la regla de "fuera de combate"?
 * (Lo usa el servicio para no hacer nada en actores que no gestionamos.)
 * @param {Actor} actor
 * @returns {boolean}
 */
export function esTipoGestionado(actor)
{
  return ["vehiculo", "teniente", "principal", "enjambre"].includes(actor?.type);
}
