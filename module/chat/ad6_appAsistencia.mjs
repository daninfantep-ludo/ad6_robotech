/**
 * Ventana compartida de Asistencia
 * ----------------------------------------------------------------------------
 * ApplicationV2 SINGLETON que todos los clientes ven. Muestra los pools de
 * asistencia activos y ofrece 3 botones (tomar 1, tomar todos, eliminar) más un
 * selector del actor que recibe los éxitos (pensado para el GM con muchas
 * fichas y para jugadores con varios actores asignados).
 *
 * Toda la lógica de negocio vive en ad6_servicioAsistencia.mjs; aquí solo la
 * interfaz. El código y los comentarios están en castellano a propósito.
 */

import * as Servicio from './ad6_servicioAsistencia.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class Ad6_AppAsistencia extends HandlebarsApplicationMixin(ApplicationV2)
{
  // Id fijo => una sola instancia por cliente (singleton).
  static DEFAULT_OPTIONS = {
     id: "ad6-asistencia"
    ,tag: "div"
    ,classes: ["ad6", "asistencia"]
    ,window: {
       // OJO: en ApplicationV2 el "title" del DEFAULT_OPTIONS NO procesa el
       // prefijo "i18n:" (eso era de ApplicationV1). Si se deja
       // "i18n:Ad6.Mensajes.ventana.asistencia", la ventana muestra esa cadena
       // LITERAL, no la traducción. Por eso aquí NO ponemos el título localizado
       // y lo resolvemos en tiempo de uso con el getter "get title()" (ver más
       // abajo), igual que hace Ad6_AppCombate. Este texto es solo un fallback.
       title: "Ad6.Mensajes.ventana.asistencia"
      ,resizable: false
      ,minimizable: true
    }
    ,position: {
       width: 380
      ,height: "auto"
    }
    ,actions: {
       tomarUno:     Ad6_AppAsistencia.prototype._onTomarUno
      ,tomarTodos:   Ad6_AppAsistencia.prototype._onTomarTodos
      ,eliminar:     Ad6_AppAsistencia.prototype._onEliminar
    }
  };

  static PARTS = {
    cuerpo: {
      template: "systems/ad6_robotech/templates/asistencia/appAsistencia.hbs"
    }
  };

  // Actor que este cliente usará para "recibir" los éxitos. Se resuelve por
  // prioridad, pero el usuario puede cambiarlo con el selector.
  _actorElegido = null;

  /**
   * Título de la ventana LOCALIZADO en tiempo de uso (idioma del cliente).
   * En ApplicationV2 el título debe resolverse con game.i18n aquí (el prefijo
   * "i18n:" del DEFAULT_OPTIONS NO se procesa). Mismo patrón que Ad6_AppCombate.
   * @override
   */
  get title()
  {
    return game.i18n.localize("Ad6.Mensajes.ventana.asistencia");
  }

  /** @override */
  async _onRender(context, options)
  {
    await super._onRender(context, options);

    // El selector de actor dispara un evento "change" (no "click"), así que lo
    // enganchamos a mano en cada render.
    const selector = this.element.querySelector("select[data-selector-actor]");
    if (selector)
    {
      selector.addEventListener("change", (ev) => {
        this._actorElegido = game.actors.get(ev.target.value) ?? null;
        this.render();
      });
    }
  }

  /** @override */
  async _prepareContext(options)
  {
    const context = await super._prepareContext(options);

    const resuelto = Servicio.resolverActorQuePulsa();
    // Si el usuario cambió el actor a mano, respetamos su elección mientras
    // ese actor siga siendo válido.
    if (this._actorElegido && !game.actors.get(this._actorElegido.id))
    {
      this._actorElegido = null;
    }
    const actor = this._actorElegido ?? resuelto.actor;

    const candidatos = Servicio.actoresDelUsuario();

    context.pools = Servicio.obtenerPoolsActivos();
    context.esGM  = game.user.isGM;
    context.actor = actor ? { id: actor.id, nombre: actor.name, img: actor.img } : null;
    // Mostramos el selector siempre que haya más de un candidato (el GM con
    // muchas fichas siempre lo verá; el jugador con un solo actor, no).
    context.mostrarSelector = candidatos.length > 1;
    context.candidatos = candidatos.map(a => ({
       id: a.id
      ,nombre: a.name
      ,seleccionado: actor?.id === a.id
    }));

    return context;
  }

  // -------------------------------------------------------------------------
  // Acciones
  // -------------------------------------------------------------------------

  async _onTomarUno(event, target)
  {
    const uuid = target.dataset.uuid;
    const actor = this._actorElegido ?? Servicio.resolverActorQuePulsa().actor;
    const ok = await Servicio.tomarExitos(actor, uuid, 1);
    if (ok) this.render();
  }

  async _onTomarTodos(event, target)
  {
    const uuid = target.dataset.uuid;
    const actor = this._actorElegido ?? Servicio.resolverActorQuePulsa().actor;

    // Confirmación, "sólo por si acaso". Usamos el mismo patrón DialogV2 que ya
    // emplea el resto del sistema (más portable entre versiones de Foundry).
    const confirmado = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
         window: {
            title: game.i18n.localize("Ad6.Asistencia.dialogoTomarTodos.titulo")
         }
        ,content: `<p>${game.i18n.format("Ad6.Asistencia.dialogoTomarTodos.confirmar", {
           actor: actor?.name ?? "—"
        })}</p>`
        ,buttons: [
          {
             action: "aceptar"
            ,label: game.i18n.localize("Ad6.Asistencia.dialogoTomarTodos.aceptar")
            ,default: true
            ,callback: () => resolve(true)
          }
          ,{
             action: "cancelar"
            ,label: game.i18n.localize("Ad6.Etiquetas.cancelar")
            ,callback: () => resolve(false)
          }
        ]
        ,close: () => resolve(false)
      }).render(true);
    });
    if (!confirmado) return;

    const ok = await Servicio.tomarExitos(actor, uuid, Number.MAX_SAFE_INTEGER);
    if (ok) this.render();
  }

  async _onEliminar(event, target)
  {
    if (!game.user.isGM)
    {
      ui.notifications.warn(game.i18n.localize("Ad6.Asistencia.avisos.soloGM"));
      return;
    }
    await Servicio.destruirPool(target.dataset.uuid);
    this.render();
  }

  // -------------------------------------------------------------------------
  // Ciclo de vida (singleton)
  // -------------------------------------------------------------------------

  /** Abre la ventana si no existe; si ya existe, la refresca. */
  static abrirORefrescar()
  {
    const inst = Ad6_AppAsistencia._instancia;
    if (inst && inst.rendered)
    {
      inst.render();
      return inst;
    }
    Ad6_AppAsistencia._instancia = new Ad6_AppAsistencia();
    Ad6_AppAsistencia._instancia.render(true);
    return Ad6_AppAsistencia._instancia;
  }

  /** Cierra la ventana si ya no hay pools activos. */
  static cerrarSiVacio()
  {
    const inst = Ad6_AppAsistencia._instancia;
    if (inst && inst.rendered) inst.close();
  }
}

// Instancia singleton por cliente.
Ad6_AppAsistencia._instancia = null;
