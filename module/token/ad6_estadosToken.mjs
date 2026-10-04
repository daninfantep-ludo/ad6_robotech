/**
 * Presentación de ESTADOS en el TOKEN.
 * ============================================================================
 * - BADGE con el NIVEL de incendio (1..3) sobre el icono de estado del token.
 * - SINCRONIZACIÓN efecto -> (token + hoja): al crear/quitar un efecto de estado,
 *   refresca el token (para que aparezca/desaparezca su ICONO) y re-renderiza las
 *   hojas del actor.
 *
 * El icono de estado propiamente dicho lo pinta Foundry (proviene del efecto,
 * con su "statuses" registrado en CONFIG.statusEffects). Aquí sólo añadimos el
 * badge numérico del nivel de incendio y forzamos el refresco visual.
 *
 * NOTA: NO se añaden botones a la HUD del token. Los estados se gestionan desde
 * la HOJA del actor (fila de Vitales), aplicados/quitados por el sistema/combate,
 * y por caducidad. Se retiraron los botones de HUD porque la HUD de v14 no
 * captura bien los clics fuera de su caja interactiva (no se podían pulsar).
 *
 * INTERRUPTOR: todo va gobernado por ACTIVAR_ESTADOS; si está apagado, no se
 * engancha nada.
 *
 * Todo el código y los comentarios están en castellano a propósito.
 */

import { ACTIVAR_ESTADOS, Ad6 } from '../config.mjs';
import * as Estado from '../combate/ad6_servicioEstados.mjs';

/**
 * Debe llamarse UNA vez (init).
 */
export function inicializarEstadosToken()
{
  if (!ACTIVAR_ESTADOS) return;

  // BADGE: cada vez que un token se refresca, repintamos el badge de nivel.
  Hooks.on("refreshToken", (token) =>
  {
    try { _pintarBadgeNivel(token); } catch (e) { /* nunca romper el render */ }
  });

  // SINCRONIZACIÓN "efecto -> (token + hoja)": cada vez que se CREA, ACTUALIZA o
  // BORRA un efecto activo que sea de NUESTROS estados, refrescamos el token del
  // actor (para que el icono/badge quede al día) y RE-RENDERIZAMOS sus hojas
  // abiertas (para que la sección de Vitales refleje el cambio).
  //
  // OJO: solo aplicamos a efectos de NUESTROS estados; los efectos "de otro
  // tipo" (y los que no son de estado) NO se ven afectados.
  //
  // IMPORTANTE (timing): cuando el estado se aplica por CÓDIGO (combate), el
  // hook corre EN EL MISMO INSTANTE en que el efecto se está creando, y en ese
  // momento el documento puede no estar aún incorporado a la colección del
  // actor ni el canvas al día. Por eso el repintado se DIFIERE al siguiente
  // tick del bucle de eventos (setTimeout 0), cuando ya todo está asentado.
  const refrescarPorEfecto = (efecto) =>
  {
    // Capturamos AHORA (sincrónicamente) de qué actor es el efecto y de qué tipo,
    // porque al diferir el efecto puede haberse desvinculado (deleteActiveEffect).
    const actor = efecto?.parent;
    if (!_esEfectoDeEstado(efecto) || !actor) return;

    // Diferimos: dejamos que Foundry termine de incorporar/borrar el efecto y de
    // actualizar el canvas antes de forzar el repintado del token y la hoja.
    setTimeout(() =>
    {
      try { _refrescarPresentacionDeEstado(actor); } catch (e) { /* idem */ }
    }, 0);
  };
  Hooks.on("createActiveEffect", refrescarPorEfecto);
  Hooks.on("updateActiveEffect", refrescarPorEfecto);
  Hooks.on("deleteActiveEffect", refrescarPorEfecto);
}

/**
 * ¿El actor COINCIDE con el del efecto? (para localizar los tokens/hojas a
 * refrescar). Se compara por documento y, si es un actor sintético de token,
 * también por su actor base.
 * @param {Actor} actor
 * @param {Actor} objetivo
 */
function _mismoActor(actor, objetivo)
{
  if (!actor || !objetivo) return false;
  if (actor === objetivo) return true;
  if (actor.uuid && objetivo.uuid && actor.uuid === objetivo.uuid) return true;
  // Un efecto puede colgar de un actor sintético de token; su base es actorId.
  if (objetivo.id && actor.id && actor.id === objetivo.id) return true;
  return false;
}

/**
 * ¿El efecto se corresponde con uno de NUESTROS estados (corrosivo/incendiado)?
 * Se comprueba por el id del statusEffect registrado en el catálogo, tolerando
 * efectos creados a mano (por id/status).
 * @param {ActiveEffect} efecto
 */
function _esEfectoDeEstado(efecto)
{
  const statuses = (efecto?.statuses instanceof Set)
    ? Array.from(efecto.statuses)
    : (Array.isArray(efecto?.statuses) ? efecto.statuses : []);
  for (const clave of Object.keys(Ad6?.Estados ?? {}))
  {
    const id = Ad6.Estados[clave]?.id;
    if (!id) continue;
    if (statuses.includes(id)) return true;
    if (efecto?.id === id) return true;
    if (String(efecto?.id ?? "").endsWith(id)) return true;
  }
  return false;
}

/**
 * Refresca la PRESENTACIÓN (token + hojas) del ACTOR al que pertenece un efecto
 * de estado que acaba de cambiar. No toca datos: sólo re-dibuja.
 * @param {Actor} actor
 */
function _refrescarPresentacionDeEstado(actor)
{
  if (!actor) return;

  // 1) Hojas del actor abiertas -> re-render (para ver la fila de Vitales).
  for (const app of (foundry.applications?.instances?.values?.() ?? []))
  {
    try
    {
      if (app?.actor && _mismoActor(app.actor, actor) && app.rendered)
      {
        app.render({ force: true });
      }
    }
    catch (e) { /* una app problemática no debe romper el resto */ }
  }

  // 2) Tokens del actor en las escenas -> refresh (icono + badge de nivel).
  //    En el caso de un actor sintético (token no vinculado), el propio efecto
  //    cuelga de ese actor; si el actor es del mundo, refrescamos sus tokens.
  try
  {
    // Redibuja el ICONO de estado (lo pinta Foundry leyendo los "statuses" del
    // efecto y CONFIG.statusEffects) y repinta nuestro badge de nivel.
    //   - drawEffects(): método específico que REDIBUJA la capa de efectos del
    //     token (v11+). Es lo que garantiza que el icono aparezca SIN depender
    //     de que un refresh completo se dispare solo.
    //   - refresh(): red de seguridad para versiones sin drawEffects.
    const pintar = (t) =>
    {
      try
      {
        if (typeof t?.drawEffects === "function") t.drawEffects();
        else t?.refresh?.();
      }
      catch (e) { try { t?.refresh?.(); } catch (e2) {} }
      _pintarBadgeNivel(t);
    };

    // getActiveTokens(linked, document): con document = FALSE (por defecto)
    // devuelve los PLACEABLES (Token con .effects/.drawEffects); con TRUE
    // devolvería Token DOCUMENTS (sin capa visual). Necesitamos los placeables.
    const tokens = actor.getActiveTokens?.(true, false) ?? [];
    for (const t of tokens) pintar(t);
    // Red de seguridad: si getActiveTokens devolviera Token DOCUMENTS (sin
    // .effects/.refresh), caemos a sus placeables via el canvas.
    const canvas = globalThis.canvas;
    if (canvas?.tokens?.placeables)
    {
      for (const placeable of canvas.tokens.placeables)
      {
        if (_mismoActor(placeable?.actor, actor)) pintar(placeable);
      }
    }
    // Si el efecto cuelga de un actor sintético, refrescamos su token base.
    if (actor.isToken && actor.token?.object) pintar(actor.token.object);
  }
  catch (e) { /* nunca romper por un refresh de token */ }
}

/* ========================================================================
 * BADGE DE NIVEL
 * ===================================================================== */

/**
 * Pinta (o repinta) el badge numérico del nivel de incendio sobre el icono de
 * efecto del token. Si no está incendiado, limpia cualquier badge previo.
 * @param {Token} token
 */
function _pintarBadgeNivel(token)
{
  const actor = token?.actor;
  const capa = token?.effects;    // contenedor de iconos de estado del token
  if (!actor || !capa) return;

  // Limpiamos los badges previos de nuestro sistema.
  if (typeof capa.querySelectorAll === "function")
  {
    capa.querySelectorAll(".ad6-badge-nivel").forEach(el => el.remove());
  }

  const nivel = Estado.nivelIncendio(actor);
  if (nivel <= 0) return;

  const badge = document.createElement("div");
  badge.classList.add("ad6-badge-nivel");
  badge.textContent = String(nivel);
  badge.style.background = Ad6?.Estados?.incendiado?.color ?? "#e8611a";

  capa.appendChild(badge);
}
