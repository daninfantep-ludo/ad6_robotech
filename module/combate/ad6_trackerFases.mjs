/**
 * Presentación de FASES en el combat tracker
 * ============================================================================
 * Este módulo engancha el render del CombatTracker NATIVO de Foundry para:
 *
 *   1) OCULTAR las filas de los Combatants de PRESENCIA. En este sistema el
 *      tracker no muestra "actores": muestra TIRADAS FIJADAS (un Combatant de
 *      fase por cada slot tirada1/tirada2/tirada3 activo). Los de presencia se mantienen
 *      para la lógica interna (objetivos, derrotado), pero no se pintan.
 *
 *   2) Sustituir el hueco de la INICIATIVA (que aquí no existe) por un icono
 *      Font Awesome según la MACROFASE de la tirada:
 *        - soporte      -> fa-heart-circle-bolt
 *        - operaciones  -> fa-hand-fist
 *        - cinematica   -> fa-film
 *
 *   3) Añadir a cada fila de fase: los ÉXITOS, el icono de SINERGIA (si la
 *      tiene) y los BOTONES de acción (Atacar / Fuego concentrado / Prestar
 *      defensa), con la MISMA visibilidad condicional que en la hoja, y SOLO
 *      visibles para el GM o el PROPIETARIO del actor.
 *
 *   4) Neutralizar el comportamiento de "click para activar/panear token" en
 *      las filas de fase (no tienen token).
 *
 * Todo se hace por INYECCIÓN EN EL DOM tras el render (idempotente: cada render
 * reconstruye la lista y volvemos a aplicar). No se toca el core.
 *
 * PUNTO CLAVE DEL ENGANCHE: en Foundry v14 el hook de render de una aplicación
 * V2 se llama `render<NombreDeClase>`. Aquí la clase es `CombatTracker`, así que
 * el hook es `renderCombatTracker`. La firma es (app, element, context, options)
 * donde `element` es el HTMLElement raíz de la aplicación.
 *
 * Todo el código y los comentarios están en castellano a propósito.
 */

import { esCombatantDeFase, FLAG_COMBATANT_FASE } from "./ad6_servicioCombate.mjs";
import * as ServicioCombate from "./ad6_servicioCombate.mjs";
const ID_FLAG = "ad6-robotech";

// Icono FA por macrofase.
const ICONO_SUPERFASE = {
   soporte:     "fa-heart-circle-bolt"
  ,operaciones: "fa-hand-fist"
  ,cinematica:  "fa-film"
};

/**
 * Nombre VISIBLE (localizado) de una macrofase. Reutiliza las claves
 * Ad6.SuperFase.* que el sistema ya usa en las plantillas (p.ej.
 * parcialTiradaBoton.hbs), de modo que hay UNA sola fuente de verdad para los
 * textos y se traducen solos según el idioma del usuario. Si el valor viene
 * vacío o no tiene traducción, cae al valor crudo.
 * @param {string} superFase  "soporte" | "operaciones" | "cinematica" | ...
 * @returns {string}
 */
function _nombreSuperFase(superFase)
{
  if (!superFase) return "";
  const clave = "Ad6.SuperFase." + superFase;
  return game.i18n.has(clave) ? game.i18n.localize(clave) : superFase;
}

/**
 * Debe llamarse UNA vez al inicializar el sistema (init/ready).
 */
export function inicializarTrackerFases()
{
  // Enganche principal: tras cada render del combat tracker nativo.
  Hooks.on("renderCombatTracker", (app, element, context, options) => {
    try { _decorarTracker(element, app); }
    catch (err) { console.error("AD6 Robotech | Error decorando el tracker de fases:", err); }
  });

  // ENGANCHE DE RESPALDO: en V14 el tracker re-renderiza solo la PARTE "tracker"
  // en algunos cambios (turno, round...). Por si ese camino no dispara el hook
  // de la app completa, redecoramos también cuando cambian los datos de combate.
  // Es idempotente, así que repetir no hace daño.
  const redecorar = () => {
    const el = ui?.combat?.element;
    if (el) _decorarTracker(el, ui.combat);
  };
  Hooks.on("updateCombat", redecorar);
  Hooks.on("updateCombatant", redecorar);
  Hooks.on("createCombatant", redecorar);
  Hooks.on("deleteCombatant", redecorar);

  // ENGANCHE EXTRA (muy robusto): parcheamos el método `_onRender` del propio
  // CombatTracker del core. No dependemos del nombre del hook ni de su firma:
  // tras el render original, decoramos el DOM. Si el hook de arriba ya lo hizo,
  // esto es idempotente y no molesta. Se hace en `ready` porque hasta entonces
  // `ui.combat` (la app de la sidebar) no existe.
  Hooks.once("ready", () => {
    try
    {
      const AppClass = ui?.combat?.constructor;
      if (AppClass?.prototype?._onRender && !AppClass.prototype.__ad6Parcheado)
      {
        const original = AppClass.prototype._onRender;
        AppClass.prototype._onRender = async function(context, options)
        {
          await original.call(this, context, options);
          try { _decorarTracker(this.element, this); }
          catch (err) { console.error("AD6 Robotech | Error decorando el tracker (patch _onRender):", err); }
        };
        AppClass.prototype.__ad6Parcheado = true;
      }
    }
    catch (err)
    {
      console.error("AD6 Robotech | No se pudo parchear _onRender del CombatTracker:", err);
    }
  });
}

/**
 * Resuelve el elemento raíz del tracker: preferimos el `element` que nos da el
 * hook; si no, el de la app de la sidebar (ui.combat.element).
 * @param {HTMLElement} element
 * @returns {HTMLElement|null}
 */
function _elementoDe(element)
{
  if (element instanceof HTMLElement) return element;
  const el = ui?.combat?.element;
  return (el instanceof HTMLElement) ? el : null;
}

/**
 * Aplica toda la decoración al elemento del tracker recién renderizado.
 * @param {HTMLElement} element
 * @param {object} app
 */
function _decorarTracker(element, app)
{
  const root = _elementoDe(element);
  if (!root) return;

  const combat = app?.viewed ?? game.combat;
  if (!combat) return;

  const filas = root.querySelectorAll("li.combatant[data-combatant-id]");
  for (const fila of filas)
  {
    const combatant = combat.combatants.get(fila.dataset.combatantId);
    if (!combatant) continue;

    if (esCombatantDeFase(combatant))
    {
      _decorarFilaDeFase(fila, combatant);
    }
    else
    {
      // 1) Combatant de presencia: NO se muestra en el tracker.
      fila.style.display = "none";
      fila.classList.add("ad6-fila-presencia-oculta");
    }
  }
}

/**
 * Decora una fila de fase: icono de macrofase, éxitos + sinergia y botones.
 */
function _decorarFilaDeFase(fila, combatant)
{
  const datos = combatant.flags?.[ID_FLAG]?.[FLAG_COMBATANT_FASE] ?? {};
  const actor = combatant.actor || game.actors?.get(combatant.actorId);
  if (!actor) return;

  // Permisos: el GM o el PROPIETARIO del actor pueden EJECUTAR acciones
  // (consumir la fase y usar los botones). El resto solo ve información.
  const esPropietario = !!(game.user?.isGM || actor.isOwner);

  const exitos = Number(datos.exitos ?? 0);
  const sinExitos = exitos <= 0;

  // --- 5) Sin éxitos: la fila se atenúa (ya "actuó"/gastó) ---
  fila.classList.toggle("ad6-fase-sin-exitos", sinExitos);

  // --- 2) Icono de macrofase en el hueco de la iniciativa ---
  // Además, en soporte/cinemática el icono puede PULSARSE para "consumir" la
  // acción (dejar la tirada de ese slot a 0 éxitos). Solo GM o propietario, y
  // solo mientras queden éxitos.
  const celdaIniciativa = fila.querySelector(".token-initiative");
  if (celdaIniciativa)
  {
    // ICONO: por regla, al ACELERAR el icono NO cambia; solo su COLOR. Por eso
    // el glifo sale de la macrofase ORIGINAL (superFaseOriginal), no de la
    // actual (que tras acelerar apunta al destino).
    const superIcono = datos.superFaseOriginal ?? datos.superFase;
    const icono = ICONO_SUPERFASE[superIcono] ?? "fa-circle-question";
    const nombre = _nombreSuperFase(superIcono);

    // Solo repintamos si aún no está nuestro icono (evita parpadeo/flicker).
    if (!celdaIniciativa.querySelector(".ad6-ico-macrofase"))
    {
      celdaIniciativa.innerHTML = "";
      const i = document.createElement("i");
      i.className = `fa-solid ${icono} ad6-ico-macrofase`;
      i.title = nombre;
      celdaIniciativa.appendChild(i);
    }
    else
    {
      // La celda ya tenía el icono: nos aseguramos de que el GLIFO corresponde
      // a la macrofase original (por si la fila se reutilizara con otro slot).
      const existente = celdaIniciativa.querySelector(".ad6-ico-macrofase");
      const glifoActual = (existente.className.match(/fa-[a-z-]+/g) ?? [])
        .find(c => c.startsWith("fa-") && c !== "fa-solid");
      if (glifoActual && glifoActual !== icono)
      {
        existente.classList.remove(glifoActual);
        existente.classList.add(icono);
      }
      existente.title = nombre;
    }

    const iconoEl = celdaIniciativa.querySelector(".ad6-ico-macrofase");
    // COLOR (y clase de macrofase para el orden/realce): de la macrofase ACTUAL
    // (destino tras acelerar). Así una acción acelerada conserva su icono pero
    // toma el color de la zona a la que se ha movido.
    celdaIniciativa.classList.remove("ad6-macrofase-soporte", "ad6-macrofase-operaciones", "ad6-macrofase-cinematica");
    celdaIniciativa.classList.add("ad6-celda-macrofase", `ad6-macrofase-${datos.superFase}`);

    const superFaseConsumible = (datos.superFase === "soporte") || (datos.superFase === "cinematica");
    const puedeConsumir = iconoEl && esPropietario && superFaseConsumible && !sinExitos && !!datos.slot;

    if (puedeConsumir)
    {
      if (!iconoEl.dataset.ad6Consumible)
      {
        iconoEl.dataset.ad6Consumible = "1";
        iconoEl.classList.add("ad6-ico-macrofase-consumible");
        iconoEl.title = `${nombre} — clic para consumir la acción`;
        // Evitamos que el clic dispare el "activar combatant" de la fila.
        iconoEl.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          // Consumir = dejar la tirada de ese slot a 0 éxitos.
          ServicioCombate.consumirTirada(actor, datos.slot);
        });
      }
    }
    else if (iconoEl?.dataset.ad6Consumible)
    {
      delete iconoEl.dataset.ad6Consumible;
      iconoEl.classList.remove("ad6-ico-macrofase-consumible");
      iconoEl.title = nombre;
    }
  }

  // --- 4) Neutralizar el click-de-token (no hay token en una fila de fase) ---
  fila.classList.add("ad6-fila-fase");
  fila.removeAttribute("data-action");   // el data-action="activateCombatant" del <li>
  fila.setAttribute("draggable", "false");

  // --- 3) Zona de datos de tirada (+ botones) ---
  // La insertamos dentro de .token-name (debajo del nombre) para que quede en la
  // misma fila, sin romper el layout nativo.
  const zonaNombre = fila.querySelector(".token-name");
  if (!zonaNombre) return;

  // Evitamos duplicar si por alguna razón ya existe (re-render parcial).
  zonaNombre.querySelector(".ad6-fase-datos")?.remove();

  const cont = document.createElement("div");
  cont.className = "ad6-fase-datos";

  // Éxitos + sinergia: los ve TODO el mundo (GM, dueño y observadores). Salvo
  // cuando son 0: con el filtro oscuro ya queda claro que "actuó", así que no
  // se pinta el número.
  if (!sinExitos)
  {
    const bloqueExitos = document.createElement("span");
    bloqueExitos.className = "ad6-fase-exitos";
    bloqueExitos.innerHTML = `<span class="ad6-exitos-num">${exitos}</span>`
      + (datos.sinergia ? `<i class="fa-brands fa-superpowers ad6-ico-sinergia" title="Tirada con sinergia"></i>` : "");
    cont.appendChild(bloqueExitos);
  }

  // Botones: SOLO para el GM o el propietario del actor.
  if (esPropietario)
  {
    const slot = datos.slot;
    const tirada = actor.system?.[slot];

    // Atacar (fa-burst).
    if (_botonAtaque(tirada))
    {
        cont.appendChild(_boton("ad6-fase-btn atacar", "fa-solid fa-burst fa-fade ad6-ico-ataque",
        game.i18n.localize("Ad6.Etiquetas.atacar"), () => ServicioCombate.invocarAtaque(actor, slot)));
    }

    // Fuego concentrado (fa-arrows-to-circle).
    if (_botonAtaque(tirada) && _tieneArma(tirada))
    {
      cont.appendChild(_boton("ad6-fase-btn fuego", "fa-solid fa-arrows-to-circle",
        game.i18n.localize("Ad6.Etiquetas.fuegoConcentrado"), () => ServicioCombate.invocarFuegoConcentrado(actor, slot)));
    }

    // Prestar defensa (fa-shield-heart).
    if (_botonDefensa(tirada))
    {
      cont.appendChild(_boton("ad6-fase-btn defensa", "fa-solid fa-shield-heart",
        game.i18n.localize("Ad6.Etiquetas.prestarDefensa"), () => ServicioCombate.invocarPrestarDefensa(actor, slot)));
    }

    // Acelerar / Apurar (Push): sube la acción una macrofase
    // (cinematica -> operaciones, operaciones -> soporte). Cuesta 1 punto de
    // fatiga (2 si la acción es de sinergia) tomado del estrés del actor. Solo
    // se muestra si la acción es acelerable (operaciones/cinematica con éxitos)
    // y al actor le quedan suficientes puntos de estrés disponibles.
    if (_botonAcelerar(actor, tirada))
    {
      const destino = ServicioCombate.superFaseAceleradaDe(tirada);
      const coste = ServicioCombate.costeAcelerar(tirada);
      const nombreBoton = game.i18n.localize("Ad6.Etiquetas.acelerarA") + 
        _nombreSuperFase(destino) + " (" + game.i18n.localize("Ad6.Etiquetas.costo") + " " + coste +  " "+
        game.i18n.localize("Ad6.Etiquetas.fatiga") + ")";
      cont.appendChild(_boton("ad6-fase-btn acelerar", "fa-regular fa-circle-up",
        //`Acelerar a ${_nombreSuperFase(destino)} [coste ${coste} fatiga]`,
        nombreBoton,
        () => ServicioCombate.acelerarAccion(actor, slot)));
    }
  }

  // Solo añadimos la caja si tiene contenido (evita huecos vacíos).
  if (cont.childElementCount > 0) zonaNombre.appendChild(cont);
}

/** Crea un botón de acción de una fila de fase. */
function _boton(clase, iconoClases, titulo, onClick)
{
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `boton-ico ${clase}`;
  btn.title = titulo;
  btn.setAttribute("aria-label", titulo);
  btn.innerHTML = `<i class="${iconoClases}"></i>`;
  // stopPropagation: que el click no dispare el de la fila (activar token).
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    onClick();
  });
  return btn;
}

// ---------------------------------------------------------------------------
// Condiciones de visibilidad (espejo EXACTO de los helpers de la hoja:
// botonAtaque y botonDefensa de ad6_robotech.mjs).
// ---------------------------------------------------------------------------

/** ¿La tirada es "atacable"? (muestra el botón de ataque / fuego concentrado). */
function _botonAtaque(t)
{
  if (!t) return false;
  // Sin éxitos disponibles no hay nada que asignar (se gastaron, o la tirada
  // salió sin éxito): no se muestran ni Atacar ni Fuego concentrado.
  const exitos = Number(t.exitos ?? 0);
  if (exitos <= 0) return false;
  // OJO: el SIGNIFICADO lo da "faseOriginal" (subfase de origen), NO "fase"
  // (que tras ACELERAR apunta a la subfase de la macrofase destino). Así una
  // acción de cinemática acelerada a operaciones NO se convierte en ataque.
  const faseOrigen = t.faseOriginal || t.fase;
  if (faseOrigen === "operacionesAtacar") return true;
  if (t.superFase === "operaciones" && t.sinergia === true) return true;
  return false;
}

/** ¿La tirada tiene un arma con datos (nombre + clase)? */
function _tieneArma(t)
{
  const arma = t?.arma;
  return ((arma?.nombre ?? "") !== "") && ((arma?.clase ?? "") !== "");
}

/** ¿La tirada puede "prestar defensa"? (espejo del helper botonDefensa). */
function _botonDefensa(t)
{
  if (!t) return false;
  const exitos = Number(t.exitos ?? 0);
  if (exitos <= 0) return false;
  // Igual que _botonAtaque: significado por "faseOriginal" con fallback a "fase".
  const faseOrigen = t.faseOriginal || t.fase;
  if (faseOrigen === "operacionesDefender") return true;
  if (t.superFase === "operaciones" && t.sinergia === true) return true;
  return false;
}

/**
 * ¿Se muestra el botón "Acelerar" para esta tirada?
 *   - La acción debe ser acelerable: estar en operaciones/cinemática, con fase
 *     fijada y con éxitos (una acción ya consumida no se acelera).
 *   - El actor que PAGA la fatiga (el propio actor si es principal, o su piloto
 *     principal si es un vehículo tripulado por uno) debe tener suficientes
 *     puntos de estrés DISPONIBLES (huecos "") para el coste: 1, ó 2 si sinergia.
 * Si no hay estrés suficiente (o no hay actor que lo pague), el botón NO se muestra.
 */
function _botonAcelerar(actor, t)
{
  if (!ServicioCombate.superFaseAceleradaDe(t)) return false;
  const coste = ServicioCombate.costeAcelerar(t);
  const actorFatiga = ServicioCombate.actorDeFatiga(actor);
  const estres = actorFatiga?.system?.estres;
  if (!Array.isArray(estres)) return false;
  return estres.filter(v => v === "").length >= coste;
}
