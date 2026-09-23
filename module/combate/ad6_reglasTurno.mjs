/**
 * Reglas de TURNO del sistema (salto de asalto controlado + recorrido de presencias)
 * ============================================================================
 * En este sistema NO hay iniciativa y un mismo actor puede tener varios
 * Combatants:
 *   - PRESENCIA: uno por cada actor añadido a la liza (lo crea el GM arrastrando
 *     un token). Es el que tiene token en la escena: es lo que se ILUMINA.
 *   - FASE: uno por cada tirada fijada (slot tirada1/tirada2/tirada3). NO tiene
 *     token; se muestra como fila de presentación en el tracker.
 *
 * Los botones de "turno" del tracker nativo recorren `combat.turns` (la lista
 * ordenada por iniciativa), que MEZCLA presencias y fases. Para el GM, avanzar
 * turno debería significar "iluminar el siguiente TOKEN": por eso los botones de
 * turno deben SALTAR las filas de fase y moverse SOLO entre PRESENCIAS.
 *
 * Además hay dos problemas del comportamiento NATIVO que corregimos aquí:
 *   1) Al pasarse del último turno (o retroceder antes del primero), Foundry
 *      salta al ASALTO siguiente/anterior (llama a nextRound()/previousRound()
 *      por dentro). Nosotros NO queremos eso: el asalto debe avanzar SOLO con el
 *      botón de asalto.
 *   2) Recorre TODAS las filas (incluidas las de fase ocultas), gastando
 *      pulsaciones en filas que no iluminan ningún token.
 *
 * SOLUCIÓN (mínimamente invasiva): sustituimos UNICAMENTE los métodos
 * `Combat.prototype.nextTurn` y `Combat.prototype.previousTurn` para que:
 *   a) salten de PRESENCIA a PRESENCIA (ignorando los Combatants de fase), y
 *   b) hagan WRAP: al llegar al final, vuelvan a la PRIMERA/ÚLTIMA presencia del
 *      MISMO asalto (en vez de avanzar de asalto).
 * NO tocamos `nextRound`/`previousRound`, así que los botones de ASALTO del
 * tracker (que llaman directamente a esos métodos) siguen funcionando igual.
 *
 * ¿POR QUÉ ESTO ES SEGURO / POCO INVASIVO?
 *   - El tracker nativo llama a estas acciones así:
 *         combat[target.dataset.action]?.()
 *     es decir: el botón "nextTurn" ejecuta combat.nextTurn() y el botón
 *     "nextRound" ejecuta combat.nextRound(). Como solo interceptamos `*Turn`,
 *     los botones de asalto quedan intactos.
 *   - Replicamos EXACTAMENTE el resto del comportamiento del core dentro de
 *     nuestro override (cálculo de tiempos, hooks, skipDefeated, update del
 *     documento), de modo que cualquier otro módulo o hook del sistema sigue
 *     recibiendo los mismos eventos `combatTurn`.
 *   - NO disparamos `combatRound` al hacer wrap (el asalto no cambia), así que
 *     el reset de tiradas por asalto (hook combatRound) NO se ejecuta.
 *
 * REVERSIBILIDAD: poniendo ACTIVAR_WRAP_TURNOS a false, `nextTurn`/`previousTurn`
 * vuelven a ser los del core (no se sobreescribe nada).
 *
 * Todo el código y los comentarios están en castellano a propósito.
 */

import { esCombatantDeFase } from "./ad6_servicioCombate.mjs";

// Interruptor maestro: si es false, no se toca nada (comportamiento nativo).
export const ACTIVAR_WRAP_TURNOS = true;

// Nombre de la propiedad donde guardamos la referencia al método ORIGINAL, para
// no perderlo (y poder restaurarlo / llamarlo si hiciera falta).
const CLAVE_ORIGINAL = "__ad6NextTurnOriginales";

/**
 * Debe llamarse UNA vez al inicializar el sistema (init).
 * Sustituye nextTurn/previousTurn del prototipo Combat por versiones que saltan
 * entre PRESENCIAS y hacen WRAP (sin avanzar de asalto).
 */
export function inicializarReglasTurno()
{
  if (!ACTIVAR_WRAP_TURNOS) return;

  // La clase real del documento Combat (puede venir de un módulo/sistema).
  const ClaseCombat = CONFIG?.Combat?.documentClass;
  if (!ClaseCombat?.prototype) return;

  // Si ya lo habíamos parcheado, no repetir (idempotente).
  if (ClaseCombat.prototype[CLAVE_ORIGINAL]) return;

  // Guardamos los originales por si algún día queremos restaurarlos.
  ClaseCombat.prototype[CLAVE_ORIGINAL] = {
     nextTurn:     ClaseCombat.prototype.nextTurn
    ,previousTurn: ClaseCombat.prototype.previousTurn
  };

  // --- AVANZAR TURNO: salta a la siguiente PRESENCIA y, al llegar al final de
  //     las presencias, vuelve a la primera del MISMO asalto (en vez de saltar
  //     al asalto siguiente). ---
  ClaseCombat.prototype.nextTurn = async function ad6NextTurn()
  {
    // Sin asalto iniciado: comportamiento nativo (arranca el asalto 1).
    if (this.round === 0) return this.nextRound();

    const turn = this.turn ?? -1;

    // Siguiente PRESENCIA válida, respetando "skipDefeated".
    let siguiente = _siguientePresencia(this, turn, +1);

    // >>> WRAP: si no hay más presencias por delante, VOLVEMOS A LA PRIMERA del
    //     mismo asalto (NO al asalto siguiente).
    if (siguiente === null) siguiente = _siguientePresencia(this, -1, +1);

    // Si no hay ninguna presencia (lista sin presencias), no movemos nada:
    // dejamos el estado como está (no avanzamos asalto).
    if (siguiente === null) return this;

    const avanceTiempo = this.getTimeDelta(this.round, this.turn, this.round, siguiente);

    // Replicamos hooks y update del core (misma forma del objeto de datos).
    const updateData = { round: this.round, turn: siguiente };
    const updateOptions = { direction: 1, worldTime: { delta: avanceTiempo } };
    Hooks.callAll("combatTurn", this, updateData, updateOptions);
    await this.update(updateData, updateOptions);
    return this;
  };

  // --- RETROCEDER TURNO: simétrico. Salta a la PRESENCIA anterior y, al
  //     retroceder antes de la primera, salta a la ÚLTIMA del mismo asalto. ---
  ClaseCombat.prototype.previousTurn = async function ad6PreviousTurn()
  {
    if (this.round === 0) return this;

    const turn = this.turn ?? this.turns.length;

    // Presencia ANTERIOR válida, respetando "skipDefeated".
    let anterior = _presenciaAntes(this, turn);

    // >>> WRAP: si no hay presencias por detrás, saltamos a la ÚLTIMA del mismo
    //     asalto (NO al asalto anterior).
    if (anterior === null) anterior = _presenciaAntes(this, this.turns.length);

    // Si no hay ninguna presencia, no movemos nada.
    if (anterior === null) return this;

    const avanceTiempo = this.getTimeDelta(this.round, this.turn, this.round, anterior);
    const updateData = { round: this.round, turn: anterior };
    const updateOptions = { direction: -1, worldTime: { delta: avanceTiempo } };
    Hooks.callAll("combatTurn", this, updateData, updateOptions);
    await this.update(updateData, updateOptions);
    return this;
  };
}

/**
 * Busca la siguiente PRESENCIA a partir de un índice, en la dirección dada.
 *
 * @param {Combat} combat
 * @param {number} desde           Índice de partida EXCLUSIVO (no se evalúa).
 *        Con `desde = -1` empieza a mirar desde el índice 0 hacia delante; con
 *        `desde = turns.length` empieza a mirar desde el último hacia atrás.
 * @param {1|-1} direccion        +1 hacia delante, -1 hacia atrás.
 * @returns {number|null}         Índice de la presencia encontrada, o null.
 */
function _siguientePresencia(combat, desde, direccion)
{
  const turns = combat.turns;
  const saltarDerrotados = combat.settings?.skipDefeated === true;

  if (direccion > 0)
  {
    for (let i = desde + 1; i < turns.length; i++)
    {
      const c = turns[i];
      if (esCombatantDeFase(c)) continue;              // ignorar filas de fase
      if (saltarDerrotados && c.isDefeated) continue;  // respetar skipDefeated
      return i;
    }
    return null;
  }

  for (let i = desde - 1; i >= 0; i--)
  {
    const c = turns[i];
    if (esCombatantDeFase(c)) continue;
    if (saltarDerrotados && c.isDefeated) continue;
    return i;
  }
  return null;
}

/**
 * Última PRESENCIA válida ANTES del índice dado (exclusivo). Atajo de
 * _siguientePresencia con dirección -1.
 * @param {Combat} combat
 * @param {number} desde  Índice EXCLUSIVO desde el que buscar hacia atrás.
 * @returns {number|null}
 */
function _presenciaAntes(combat, desde)
{
  return _siguientePresencia(combat, desde, -1);
}
