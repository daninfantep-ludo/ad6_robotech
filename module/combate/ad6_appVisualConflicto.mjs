/**
 * Ventana de VISUAL DE CONFLICTOS (Ad6_AppVisualConflicto)
 * ============================================================================
 * ApplicationV2 que muestra los actores de tipo "conflicto" presentes en el
 * combate de la escena actual. Es una ventana COMPARTIDA: cada cliente tiene
 * UNA sola instancia (no una por conflicto), que se refresca cuando cambia el
 * combate o cualquiera de sus conflictos.
 *
 * Toda la lógica de negocio (qué conflictos se ven, quién puede verlos y los
 * datos de presentación) vive en ad6_visualConflicto.mjs; aquí solo la interfaz.
 *
 * REGLAS (acordadas):
 *   - GM ve SIEMPRE todos los conflictos del combate.
 *   - Jugador ve SOLO los conflictos con system.visible === true.
 *   - Retrato + nombre: siempre.
 *   - Reloj + tiempoRestante: SOLO si el conflicto está TEMPORIZADO y su
 *     temporizador está marcado como VISIBLE (igual para GM y jugadores).
 *   - GM: doble click en el retrato ABRE la hoja del conflicto; los botones de
 *     ojo (visible / temporizador visible) alternan esos flags.
 *
 * El código y los comentarios están en castellano a propósito.
 */

import {
   conflictosVisiblesParaUsuario
  ,datosPresentacionConflicto
} from './ad6_visualConflicto.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class Ad6_AppVisualConflicto extends HandlebarsApplicationMixin(ApplicationV2)
{
  static DEFAULT_OPTIONS = {
     // ID FIJO = SINGLETON a nivel de Foundry: aunque se construyeran dos
     // instancias por error (p. ej. una race de hooks), Foundry las identificará
     // por el mismo id y reutilizará/reemplazará la existente en vez de pintar
     // dos ventanas. Refuerza el guardado por "_instancia" (ver abrirORefrescar).
     id: "ad6-visual-conflicto"
    ,tag: "div"
    ,classes: ["ad6", "conflictos"]
    ,window: {
       // Valor SOLO de relleno: ApplicationV2 NO procesa el prefijo "i18n:" en
       // el título (ni localiza DEFAULT_OPTIONS, que es estático y se evalúa al
       // importar el módulo). El texto real y localizado lo pone el getter
       // "get title()" (ver más abajo), en tiempo de uso.
       title: "Ad6.Mensajes.ventana.conflictos"
      ,resizable: true
      ,minimizable: true
    }
    ,position: {
       width: 300
      ,height: 380
    }
    ,actions: {
       abrirConflicto:       Ad6_AppVisualConflicto.prototype._onAbrirConflicto
      ,toggleVisible:        Ad6_AppVisualConflicto.prototype._onToggleVisible
      ,toggleVisibleTiempo:  Ad6_AppVisualConflicto.prototype._onToggleVisibleTiempo
    }
  };

  static PARTS = {
    cuerpo: {
      template: "systems/ad6_robotech/templates/combate/appVisualConflicto.hbs"
    }
  };

  /**
   * Título LOCALIZADO en tiempo de uso (idioma del cliente al que se pinta).
   * ApplicationV2 consulta este getter cada vez que dibuja la barra, por lo
   * que el título respeta el idioma del cliente aunque DEFAULT_OPTIONS sea
   * estático. Mismo patrón que Ad6_AppCombate.
   * @override
   */
  get title()
  {
    return game.i18n.localize("Ad6.Mensajes.ventana.conflictos");
  }

  // -------------------------------------------------------------------------
  // Ciclo de vida / registro (singleton por cliente)
  // -------------------------------------------------------------------------

  static _instancia = null;

  /**
   * Abre la ventana si no existe; si ya existe, la refresca (para reflejar el
   * estado actual del combate y de sus conflictos).
   *
   * ANTI-DUPLICADOS: si ya hay una instancia registrada (aunque su `rendered`
   * todavía sea false porque el render es ASÍNCRONO y no ha terminado), NO
   * creamos otra: refrescamos la que hay. Sin esta comprobación, varios hooks
   * seguidos (createCombatant + updateCombatant + ready…) crearían una ventana
   * nueva cada uno antes de que el primer render terminase -> DUPLICADOS.
   */
  static abrirORefrescar()
  {
    const actual = Ad6_AppVisualConflicto._instancia;
    if (actual)
    {
      // Ya renderizada -> refrescamos forzando el contexto.
      // Aún renderizando (rendered false) -> NO lanzamos otro render (evita
      // carreras); cuando termine el que está en curso ya mostrará el estado.
      if (actual.rendered) actual.render({ force: true });
      return actual;
    }

    const nueva = new Ad6_AppVisualConflicto();
    // Registramos la instancia ANTES de renderizar: así, si cualquier hook
    // dispara mientras el render está en curso, encontrará "_instancia" y no
    // creará una segunda.
    Ad6_AppVisualConflicto._instancia = nueva;
    nueva.render(true);
    return nueva;
  }

  /** Cierra la ventana si está abierta. */
  static cerrar()
  {
    const inst = Ad6_AppVisualConflicto._instancia;
    // Cerramos aunque no esté "rendered" todavía (render en curso): close() es
    // idempotente y evita dejar una ventana a medio abrir huérfana.
    if (inst) inst.close();
    Ad6_AppVisualConflicto._instancia = null;
  }

  /** @override — al cerrarse, desregistramos la instancia (solo si es la nuestra). */
  async close(options)
  {
    // Solo desregistramos si ESTA instancia es la registrada. Así, si por una
    // carrera hubiera quedado otra instancia activa, no la "olvidamos" al
    // cerrarse esta.
    if (Ad6_AppVisualConflicto._instancia === this)
    {
      Ad6_AppVisualConflicto._instancia = null;
    }
    return super.close(options);
  }

  // -------------------------------------------------------------------------
  // Contexto de render
  // -------------------------------------------------------------------------

  /** @override */
  async _prepareContext(options)
  {
    const context = await super._prepareContext(options);

    const conflictos = conflictosVisiblesParaUsuario();
    context.esGM   = game.user?.isGM === true;
    context.vacio  = conflictos.length === 0;
    context.conflictos = conflictos.map(a => {
      // Datos de presentación (retrato, nombre, tiempo, visibilidad) resueltos
      // por la lógica pura de ad6_visualConflicto.mjs.
      const pres = datosPresentacionConflicto(a);
      // El icono del ojo (visible / temporizador) depende de esGM y del flag.
      return {
         ...pres
        ,ojoVisible: pres.visible
        ,ojoTiempo:  pres.visibleTemporizador
      };
    });

    return context;
  }

  // -------------------------------------------------------------------------
  // Acciones
  // -------------------------------------------------------------------------

  /** Doble click en el retrato: abre la hoja del conflicto (solo GM). */
  async _onAbrirConflicto(event, target)
  {
    if (!game.user?.isGM) return;
    const uuid = target?.dataset?.uuid;
    if (!uuid) return;
    const actor = await fromUuid(uuid);
    if (actor) actor.sheet?.render(true);
  }

  /** Alterna system.visible del conflicto (solo GM). */
  async _onToggleVisible(event, target)
  {
    if (!game.user?.isGM) return;
    const uuid = target?.dataset?.uuid;
    if (!uuid) return;
    const actor = await fromUuid(uuid);
    if (!actor) return;
    await actor.update({ "system.visible": actor.system?.visible !== true });
    this.render({ force: true });
  }

  /** Alterna system.visibleTemporizador del conflicto (solo GM). */
  async _onToggleVisibleTiempo(event, target)
  {
    if (!game.user?.isGM) return;
    const uuid = target?.dataset?.uuid;
    if (!uuid) return;
    const actor = await fromUuid(uuid);
    if (!actor) return;
    await actor.update({ "system.visibleTemporizador": actor.system?.visibleTemporizador !== true });
    this.render({ force: true });
  }
}

// ---------------------------------------------------------------------------
// Ciclo de vida de la ventana (hooks)
// ---------------------------------------------------------------------------

/**
 * Registra los hooks que mantienen viva/actualizada la ventana:
 *   - createCombat / deleteCombat: aparece/desaparece el combate activo.
 *   - createCombatant / deleteCombatant / updateCombatant: entran/salen
 *     conflictos de la liza o cambia su estado "derrotado".
 *   - updateActor: cambia system.visible, system.visibleTemporizador,
 *     system.temporizado o system.tiempoRestante de un conflicto.
 *
 * La ventana se ABRE sola si hay conflictos visibles para este usuario y NO
 * está abierta; se REFRESCA si ya lo está; y se CIERRA si no queda ninguno.
 * Debe llamarse una vez al inicializar el sistema (init/ready).
 */
export function inicializarVisualConflicto()
{
  const refrescar = () =>
  {
    // ¿Hay algo que este usuario deba ver?
    const hay = conflictosVisiblesParaUsuario().length > 0;

    if (hay)
    {
      Ad6_AppVisualConflicto.abrirORefrescar();
    }
    else
    {
      Ad6_AppVisualConflicto.cerrar();
    }
  };

  Hooks.on("createCombat", refrescar);
  Hooks.on("deleteCombat", refrescar);
  Hooks.on("createCombatant", refrescar);
  Hooks.on("deleteCombatant", refrescar);
  Hooks.on("updateCombatant", refrescar);

  // Cambios en cualquier actor: solo refrescamos si es un conflicto (evita
  // reabrir la ventana por cualquier update del resto de actores).
  Hooks.on("updateActor", (actor) =>
  {
    if (actor?.type === "conflicto") refrescar();
  });

  // Al arrancar (ready), evaluamos una vez por si ya había conflictos.
  Hooks.on("ready", refrescar);
}
