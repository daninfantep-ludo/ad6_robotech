/**
 * Ventana de interacción de Combate (Ad6_AppCombate)
 * ============================================================================
 * ApplicationV2 que muestra la pantalla del ATAQUE (atacante / defensor).
 * NO es singleton: cada cliente puede tener VARIAS ventanas a la vez:
 *   - El atacante, una (la suya).
 *   - Cada defensor que este cliente controle, una.
 *   - El GM: una por cada NPC (sin dueño jugador) atacado.
 *
 * Registramos las instancias en un Map por "clave de ventana":
 *   clave = `${encuentroId}:${rol}:${actorUuid}`
 *
 * Toda la lógica de negocio vive en ad6_servicioCombate.mjs; aquí solo la
 * interfaz. El código y los comentarios están en castellano a propósito.
 */

import * as Servicio from './ad6_servicioCombate.mjs';
import { resolverEntrada } from './ad6_log.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class Ad6_AppCombate extends HandlebarsApplicationMixin(ApplicationV2)
{
  static DEFAULT_OPTIONS = {
     // Sin id fijo => pueden coexistir varias instancias en el mismo cliente.
     tag: "div"
    ,classes: ["ad6", "combate"]
    ,window: {
       // Prefijo "i18n:": ApplicationV2 localiza el título ÉL MISMO al abrir
       // la ventana (en tiempo de uso). NO usar game.i18n.localize() aquí,
       // porque DEFAULT_OPTIONS es estático y se evalúa al IMPORTAR el módulo.
       title: "i18n:Ad6.Mensajes.ventana.combate"
      ,resizable: true
      ,minimizable: true
      // Solo MINIMIZAR: quitamos la "X" para que esta ventana no se pueda cerrar
      // a mano. La única vía de cierre es el botón "Cerrar" (que además cierra
      // el encuentro para TODOS). Se evita así dejar ventanas huérfanas.
      ,controls: ["minimize"]
    }
    ,position: {
       width: 420
      ,height: 560
    }
    ,actions: {
       anadirObjetivo:   Ad6_AppCombate.prototype._onAnadirObjetivo
      ,quitarObjetivo:   Ad6_AppCombate.prototype._onQuitarObjetivo
      ,toggleObjetivos:  Ad6_AppCombate.prototype._onToggleObjetivos
      ,confirmarAtaque:  Ad6_AppCombate.prototype._onConfirmarAtaque
      ,confirmarDefensa: Ad6_AppCombate.prototype._onConfirmarDefensa
      ,copiarLog:        Ad6_AppCombate.prototype._onCopiarLog
      ,cerrar:           Ad6_AppCombate.prototype._onCerrar
    }
  };

  static PARTS = {
    cuerpo: {
      template: "systems/ad6_robotech/templates/combate/appCombate.hbs"
    }
  };

  // -------------------------------------------------------------------------
  // Datos de instancia
  // -------------------------------------------------------------------------

  constructor(options = {})
  {
    // Guardamos el snapshot recibido ANTES de construir (lo usa el título) y
    // calculamos el título de la ventana a partir del rol y el actor.
    const snapshot = options.snapshot ?? Servicio.obtenerEncuentro(options.encuentroId);

    // ApplicationV2 lee el título de options.window.title; lo fijamos ya para
    // que la ventana nazca con el título correcto.
    options.window = options.window ?? {};
    options.window.title = Ad6_AppCombate.tituloDeVentana(options.rol, options.actorUuid, snapshot);

    super(options);

    this.encuentroId = options.encuentroId;
    this.rol         = options.rol;          // "atacante" | "defensor"
    this.actorUuid   = options.actorUuid;    // uuid del actor del mundo ("Actor.<id>")
    // actorId (sin puntos): clave con la que se indexa enc.defensas.
    this.actorId     = Ad6_AppCombate._idDesdeUuid(options.actorUuid);
    this._snapshot   = snapshot;
  }

  /** Extrae el id de un uuid de Actor del mundo ("Actor.<id>"). */
  static _idDesdeUuid(uuid)
  {
    if (typeof uuid !== "string") return null;
    const m = uuid.match(/^Actor\.([A-Za-z0-9]+)$/);
    return m ? m[1] : null;
  }

  /**
   * Calcula el título de ventana a partir del rol y el actor.
   *   - atacante -> "Atacante: <nombre del atacante>"
   *   - defensor -> "Defensor: <nombre del defensor>"
   * Usa el snapshot (que trae los nombres ya resueltos); si no lo hay, cae al
   * propio documento del actor y, en último caso, a una etiqueta genérica.
   */
  static tituloDeVentana(rol, actorUuid, snapshot)
  {
    if (rol === "atacante")
    {
      const nombre = snapshot?.atacanteNombre
        ?? game.actors?.get(snapshot?.atacanteId)?.name
        ?? "";
      return game.i18n.format("Ad6.Mensajes.ventana.atacante", { nombre }).trim();
    }

    // defensor
    const id = Ad6_AppCombate._idDesdeUuid(actorUuid);
    let nombre = (id ? snapshot?.defensas?.[id]?.nombre : "") ?? "";
    if (!nombre)
    {
      const actor = fromUuidSync(actorUuid);
      nombre = actor?.name ?? "";
    }
    return game.i18n.format("Ad6.Mensajes.ventana.defensor", { nombre }).trim();
  }

  /** @override — mantiene el título correcto en cada render. */
  get title()
  {
    const enc = Servicio.obtenerEncuentro(this.encuentroId) ?? this._snapshot;
    return Ad6_AppCombate.tituloDeVentana(this.rol, this.actorUuid, enc);
  }

  // -------------------------------------------------------------------------
  // Ciclo de vida / registro de instancias
  // -------------------------------------------------------------------------

  static _instancias = new Map(); // clave -> instancia

  static claveVentana(encuentroId, rol, actorUuid)
  {
    return `${encuentroId}:${rol}:${actorUuid}`;
  }

  /** Abre la ventana si no existe; si existe, la refresca. */
  static abrirORefrescar(encuentroId, rol, actorUuid, snapshot)
  {
    const clave = Ad6_AppCombate.claveVentana(encuentroId, rol, actorUuid);
    const inst = Ad6_AppCombate._instancias.get(clave);
    if (inst && inst.rendered)
    {
      // IMPORTANTE: render() sin force NO re-ejecuta el contexto en un app ya
      // renderizado (solo lo trae al frente). Necesitamos force:true para que
      // el defensor vea los cambios (p.ej. el ataque confirmado).
      inst.render({ force: true });
      return inst;
    }
    const nueva = new Ad6_AppCombate({ encuentroId, rol, actorUuid, snapshot });
    Ad6_AppCombate._instancias.set(clave, nueva);
    nueva.render(true);
    return nueva;
  }

  /** Cierra todas las ventanas de un encuentro (lo pulse quien lo pulse). */
  static cerrarEncuentro(encuentroId)
  {
    for (const [clave, inst] of Ad6_AppCombate._instancias.entries())
    {
      if (clave.startsWith(`${encuentroId}:`))
      {
        if (inst.rendered) inst.close();
        Ad6_AppCombate._instancias.delete(clave);
      }
    }
  }

  /** Cierra las ventanas de un encuentro que NO estén en el conjunto deseado. */
  static cerrarNoDeseadas(encuentroId, deseadas)
  {
    for (const [clave, inst] of Ad6_AppCombate._instancias.entries())
    {
      if (!clave.startsWith(`${encuentroId}:`)) continue;
      if (deseadas.has(clave)) continue;
      if (inst.rendered) inst.close();
      Ad6_AppCombate._instancias.delete(clave);
    }
  }

  /** @override — al cerrarse, desregistramos la instancia. */
  async close(options)
  {
    const clave = Ad6_AppCombate.claveVentana(this.encuentroId, this.rol, this.actorUuid);
    Ad6_AppCombate._instancias.delete(clave);
    return super.close(options);
  }

  // -------------------------------------------------------------------------
  // Contexto de render
  // -------------------------------------------------------------------------

  /** @override */
  async _prepareContext(options)
  {
    const context = await super._prepareContext(options);

    const enc = Servicio.obtenerEncuentro(this.encuentroId);
    const esAtacante = this.rol === "atacante";
    if (!enc)
    {
      context.vacio = true;
      return context;
    }

    context.vacio        = false;
    context.encuentroId  = enc.id;
    context.rol          = this.rol;
    context.esAtacante   = esAtacante;
    context.actorUuid    = this.actorUuid;
    context.estado       = enc.estado;

    // Cabecera (foto + nombre, sin etiqueta redundante). En ambas ventanas
    // identifica al ATACANTE: en la del atacante se muestra a sí mismo; en la
    // del defensor, a quién está respondiendo.
    context.cabecera = { nombre: enc.atacanteNombre, img: enc.atacanteImg };

    // ---------- Sección ATAQUE ----------
    // Un encuentro puede tener VARIAS armas (la propia del atacante + las que
    // otros le "prestan" para el fuego concentrado). Cada arma lleva SUS PROPIOS
    // éxitos (asignados por el atacante) y su propio máximo. Preparamos una fila
    // de presentación por arma.
    context.armas = (enc.armas ?? []).map((a, i) => {
      const datosArma = a?.datos?.system ?? {};
      const opcionesPen = Array.isArray(a?.penetracionOpciones)
        ? a.penetracionOpciones.map(Number)
        : [];
      const opcionesDano = Array.isArray(a?.danoOpciones)
        ? a.danoOpciones.map(String)
        : [];
      // Daño MOSTRADO en la notación del arma (crudo). El valor EFECTIVO elegido
      // va aparte en "danoFinal" (como con la penetración).
      const danoCrudo = datosArma.dano ?? "";
      // Penetración CRUDA tal cual la define el arma (p.ej. "1", "0|1", o "").
      // Sin valor por defecto: el parcial decide si mostrar el badge "Pen".
      const penCruda = datosArma.penetracion ?? "";
      return {
         indice:       i
        ,nombre:       a?.nombre || "—"
        // CRUDO para el badge "Daño <valor>" cuando NO hay opciones; si está
        // vacío, guion. Cuando SÍ hay opciones, la plantilla NO lo usa (solo pinta
        // el select), por eso da igual su valor en ese caso.
        ,dano:         (danoCrudo === "") ? "—" : danoCrudo
        // Penetración CRUDA para el badge "Pen <valor>" cuando NO hay opciones.
        // Vacía si el arma no tiene penetración (así la plantilla la oculta).
        ,penetracion:  penCruda
        // true si el arma DEFINE penetración (aunque sea "0"). Decidido sobre el
        // valor CRUDO, no sobre el formateado: distingue "" de "0".
        ,tienePenetracion: (String(penCruda).trim() !== "")
        ,area:         datosArma.area ?? "—"
        ,descriptores: _descriptoresDe(datosArma)
        ,exitosAtaque: Number(a?.exitosAtaque ?? 0)
        ,exitosTirada: Number(a?.exitosTirada ?? 0)
        ,maximoAtaque: Number(a?.exitosTirada ?? 0)   // máximo asignable de esta arma
        ,principal:    a?.principal === true
        ,actorNombre:  a?.actorNombre ?? ""
        // Campo del input reutilizable (parcialMaxValor) para esta arma.
        ,campo:        `exitos-ataque-${i}`
        // ---- PENETRACIÓN ----
        // Valor final efectivo (0 si no hay penetración).
        ,penetracionFinal: Number(a?.penetracionFinal ?? 0)
        // Opciones posibles: cuando hay MÁS DE UNA (formato "Pn|m"), el
        // atacante elige; si hay 0 o 1, es un valor fijo.
        ,penetracionOpciones: opcionesPen
        ,penetracionElegible: opcionesPen.length > 1
        // Campo del select de penetración (id único por arma en esta ventana).
        ,campoPenetracion: `penetracion-final-${i}`
        // ---- DAÑO (mismo mecanismo que la penetración) ----
        // Valor final efectivo (la notación ELEGIDA, p.ej. "2xL"). Si el arma no
        // tiene opciones, cae al daño crudo.
        ,danoFinal:    (() => {
          const f = a?.danoFinal;
          if (typeof f === "string" && f.trim() !== "") return f;
          return (danoCrudo === "") ? "" : danoCrudo;
        })()
        // Opciones posibles: cuando hay MÁS DE UNA (formato "L|2xL"), el
        // atacante elige; si hay 0 o 1, es un valor fijo.
        ,danoOpciones: opcionesDano
        ,danoElegible: opcionesDano.length > 1
        // Campo del select de daño (id único por arma en esta ventana).
        ,campoDano: `dano-final-${i}`
      };
    });
    // Total de éxitos sumados de todas las armas (informativo en la cabecera).
    context.totalAtaque = context.armas.reduce((s, a) => s + a.exitosAtaque, 0);
    context.ataqueConfirmado = enc.ataqueConfirmado;
    // Solo el atacante puede editar, y solo mientras no haya confirmado.
    context.editableAtaque = esAtacante && !enc.ataqueConfirmado;
    // cambio esto porque puedo atacar a quien quiera y como quiera tenga sinergia o no.
    
    // ---------- Sección OBJETIVOS (solo atacante) ----------
    if (esAtacante)
    {
      context.objetivos = enc.objetivos.map(o => ({ ...o }));
      // Catálogo de posibles objetivos: SOLO los combatientes presentes en el
      // combate activo (no todos los actores del mundo). Se excluye al atacante.
      // El uuid NO se muestra: viaja en data-uuid de cada fila de resultado.
      context.catalogo = Servicio.catalogoObjetivos(enc.atacanteUuid)
        .map(a => ({ uuid: a.uuid, nombre: a.name, img: a.img }));
    }

    // ---------- Sección DEFENSA ----------
    // Un defensor reparte su defensa entre VARIAS FUENTES: la suya propia más
    // las que otros actores le hayan "prestado". Cada fuente tiene su propio
    // máximo y su propio reparto. Esta vista se usa tanto en la ventana del
    // DEFENSOR (editable) como en la del ATACANTE (solo lectura).
    if (esAtacante)
    {
      // El atacante ve, en solo lectura y en tiempo real, la defensa de CADA
      // objetivo (una fila por defensor, con el detalle de sus fuentes).
      context.defensasAtacante = enc.objetivos.map(o =>
      {
        const def = enc.defensas?.[o.actorId] ?? null;
        return {
           nombre:     o.nombre
          ,img:        o.img
          ,confirmado: def?.confirmado === true
          ,fuentes:    (def?.fuentes ?? []).map((f, i) => ({
             indice:       i
            ,actorNombre:  f.actorNombre
            ,propia:       f.propia === true
            ,disponible:   Number(f.disponible ?? 0)
            ,exitos:       Number(f.exitosDefensa ?? 0)
          }))
          ,total:      (def?.fuentes ?? []).reduce((s, f) => s + Number(f.exitosDefensa ?? 0), 0)
        };
      });
    }
    else
    {
      // enc.defensas se indexa por actorId (sin puntos).
      const def = (this.actorId ? enc.defensas[this.actorId] : null) ?? null;

      // El defensor SOLO puede repartir/confirmar una vez el atacante ha
      // confirmado su ataque. Lo exponemos en la RAÍZ del contexto para que la
      // plantilla pueda decidir con o SIN entrada de defensa (defensa en blanco).
      context.esperandoAtaque   = !enc.ataqueConfirmado;
      context.defensaConfirmada = def?.confirmado === true;

      context.defensa = def ? {
         nombre:      def.nombre
        ,img:         def.img
        ,confirmado:  def.confirmado
        // El defensor SOLO puede repartir sus éxitos una vez el atacante ha
        // confirmado su ataque (antes no sabemos qué hay que defender).
        ,esperandoAtaque: !enc.ataqueConfirmado
        ,editable:    enc.ataqueConfirmado === true && def.confirmado === false
        // Una fila por FUENTE (propia + prestadas), con su campo de input.
        // Aplanamos "editable" DENTRO de cada fuente para no depender de rutas
        // relativas ("../") dentro del {{#each}} en la plantilla.
        ,fuentes:     (def.fuentes ?? []).map((f, i) => ({
           indice:       i
          ,actorNombre:  f.actorNombre
          ,propia:       f.propia === true
          ,disponible:   Number(f.disponible ?? 0)
          ,exitos:       Number(f.exitosDefensa ?? 0)
          ,campo:        `exitos-defensa-${i}`
          ,editable:     (enc.ataqueConfirmado === true && def.confirmado === false)
        }))
        ,totalDisponible: (def.fuentes ?? []).reduce((s, f) => s + Number(f.disponible ?? 0), 0)
        ,totalTomado:     (def.fuentes ?? []).reduce((s, f) => s + Number(f.exitosDefensa ?? 0), 0)
      } : null;
    }

    // Log del cálculo: cada entrada es un objeto estructurado que SE LOCALIZA
    // AQUÍ (en el render), de modo que cada cliente lo ve en SU idioma. Formas:
    //   { clave, datos, nivel?, sangria? } -> frase (game.i18n.format)
    //   { texto, nivel?, sangria? }        -> notación fija (no se traduce)
    //   "línea" (legacy)                   -> string plano
    // El "nivel" da color/estilo (destruido=rojo, aplicar=ámbar, sinDano=verde).
    // La "sangria" (nº de niveles) se convierte en padding-left CSS para que el
    // wrap respete la indentación. Si la entrada no trae "sangria" (o es un
    // string legacy), se deduce de los espacios iniciales del texto.
    //
    // NOTA: NO llamamos a esta variable "log" para evitar cualquier ambigüedad
    // con el helper reservado {{log}} de Handlebars.
    const ESPACIOS_POR_NIVEL = 2;   // 2 espacios = 1 nivel de indentación lógica
    const PX_POR_ESPACIO = 5;       // ancho (px) de cada espacio (aprox. mono)

    context.logLineas = (enc.log ?? []).map(e =>
    {
      const nivel = (typeof e === "string") ? "" : String(e?.nivel ?? "");
      // Resolvemos el texto en el idioma del cliente actual (clave o literal).
      const bruto = resolverEntrada(e);

      // SANGRÍA: si la entrada trae el campo estructural "sangria", mandamos él;
      // si no, deducimos por los espacios iniciales del texto (compatibilidad).
      let sangriaPx;
      let texto = bruto;
      if (e && typeof e === "object" && e.sangria !== undefined)
      {
        sangriaPx = (Number(e.sangria) || 0) * (ESPACIOS_POR_NIVEL * PX_POR_ESPACIO);
      }
      else
      {
        const m = bruto.match(/^[ \t]*/);
        const prefijo = m ? m[0] : "";
        const numEspacios = prefijo.replace(/\t/g, "  ").length;
        texto = bruto.slice(prefijo.length);
        sangriaPx = Math.floor(numEspacios / ESPACIOS_POR_NIVEL) * (ESPACIOS_POR_NIVEL * PX_POR_ESPACIO);
      }

      return { texto, nivel, sangria: sangriaPx };
    });

    return context;
  }

  // -------------------------------------------------------------------------
  // Acciones
  // -------------------------------------------------------------------------

  async _onAnadirObjetivo(event, target)
  {
    // Dos formas de invocar esta acción:
    //   1) Click en una fila de resultado: trae el uuid en data-uuid.
    //   2) Click en el botón "+": no trae uuid; entonces tomamos la PRIMERA
    //      coincidencia visible del buscador.
    let uuid = target?.dataset?.uuid;

    if (!uuid)
    {
      // Tomamos la primera fila que COINCIDE con lo escrito (independientemente
      // de si la lista está visible u oculta en ese instante).
      const input = this.element.querySelector("input[data-buscador-objetivos]");
      const q = (input?.value ?? "").trim().toLowerCase();
      const lista = this.element.querySelector("[data-resultados-objetivos]");
      const filas = lista
        ? Array.from(lista.querySelectorAll(".ad6-combate-resultado"))
        : [];
      const primera = filas.find(li => {
        const nombre = (li.dataset.nombre ?? li.textContent ?? "").toLowerCase();
        return q.length === 0 ? true : nombre.includes(q);
      });
      uuid = primera?.dataset?.uuid;
    }
    if (!uuid) return;

    const actor = await fromUuid(uuid);
    if (!actor) return;

    await Servicio.anadirObjetivo(this.encuentroId, actor);

    // Limpiamos el buscador tras añadir.
    const input = this.element.querySelector("input[data-buscador-objetivos]");
    if (input) input.value = "";
    this.render();
  }

  async _onQuitarObjetivo(event, target)
  {
    const uuid = target.dataset.uuid;
    await Servicio.quitarObjetivo(this.encuentroId, uuid);
    this.render();
  }

  /**
   * Muestra/oculta el cuerpo de la sección "Objetivos" (solo atacante).
   * Es puramente de CLIENTE: no toca el encuentro ni difunde nada. Recordamos
   * la preferencia en la instancia para que se respete en los re-render.
   */
  async _onToggleObjetivos(event, target)
  {
    const caja = this.element.querySelector("[data-caja-objetivos]");
    if (!caja) return;
    const colapsado = caja.classList.toggle("ad6-colapsado");
    // Guardamos la preferencia manual del usuario (true = expandido).
    this._objetivosExpandido = !colapsado;
  }

  async _onConfirmarAtaque(event, target)
  {
    await Servicio.confirmarAtaque(this.encuentroId);
    this.render();
  }

  async _onConfirmarDefensa(event, target)
  {
    await Servicio.confirmarDefensa(this.encuentroId, this.actorUuid);
    this.render();
  }

  /**
   * Copia el LOG DE COMBATE COMPLETO al portapapeles en formato TEXTO PLANO
   * (sin HTML), para poder pegarlo en un chat, un foro, etc.
   *
   * Tomamos el texto de las líneas del propio DOM (que ya viene con su
   * indentación convertida en padding, pero el texto interno conserva el texto
   * original sin sangría). Para no perder el sangrado, reconstruimos cada línea
   * añadiendo la indentación lógica a partir del padding calculado por la app
   * (o, más simple y robusto, leyendo el snapshot del encuentro).
   */
  async _onCopiarLog(event, target)
  {
    const enc = Servicio.obtenerEncuentro(this.encuentroId);
    if (!enc) return;

    // Reconstruimos el texto desde el LOG del encuentro (fuente de verdad).
    // Cada entrada se LOCALIZA aquí (idioma del cliente que copia) y la
    // indentación se re-crea con DOS espacios por nivel para que el pegado sea
    // legible.
    const lineas = (enc.log ?? []).map(e => {
      const textoResuelto = resolverEntrada(e);
      // Sangría estructural si la entrada la trae; si no, la deducimos de los
      // espacios iniciales del propio texto (entradas legacy).
      let nivel;
      let texto = textoResuelto;
      if (e && typeof e === "object" && e.sangria !== undefined)
      {
        nivel = Number(e.sangria) || 0;
      }
      else
      {
        const m = textoResuelto.match(/^[ \t]*/);
        const prefijo = m ? m[0] : "";
        const numEspacios = prefijo.replace(/\t/g, "  ").length;
        nivel = Math.floor(numEspacios / 2);
        texto = textoResuelto.slice(prefijo.length);
      }
      return "  ".repeat(nivel) + texto;
    });

    const textoPlano = lineas.join("\n");

    try
    {
      await navigator.clipboard.writeText(textoPlano);
      ui.notifications.info(game.i18n.localize("Ad6.Mensajes.ventanaCombate.copiarLog"));
    }
    catch (err)
    {
      // Fallback: método clásico (textarea oculto + execCommand) por si el
      // navegador no concede permiso de portapapeles en contexto no seguro.
      try
      {
        const ta = document.createElement("textarea");
        ta.value = textoPlano;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        ui.notifications.info(game.i18n.localize("Ad6.Mensajes.ventanaCombate.copiarLog"));
      }
      catch (err2)
      {
        ui.notifications.error(game.i18n.localize("Ad6.Mensajes.ventanaCombate.errorCopiarLog"));
      }
    }
  }

  async _onCerrar(event, target)
  {
    // Cualquiera puede cerrar: cierra TODAS las ventanas del encuentro.
    await Servicio.cerrarEncuentro(this.encuentroId);
  }

  // -------------------------------------------------------------------------
  // Listeners de render (inputs editables de éxitos)
  // -------------------------------------------------------------------------

  /** @override */
  async _onRender(context, options)
  {
    await super._onRender(context, options);

    // Estado del colapso de la sección "Objetivos": la plantilla lo deja en su
    // estado INICIAL (colapsado si el ataque ya está confirmado). Si el usuario
    // lo ha cambiado a mano, respetamos su preferencia tras cada render.
    if (this._objetivosExpandido !== undefined)
    {
      const caja = this.element.querySelector("[data-caja-objetivos]");
      if (caja) caja.classList.toggle("ad6-colapsado", this._objetivosExpandido === false);
    }

    // Evitar que esta ventana se cierre con la tecla ESC (solo esta ventana).
    // El cierre SOLO debe producirse con el botón "Cerrar". Interceptamos el
    // keydown en fase de CAPTURA sobre el propio elemento y detenemos la
    // propagación para que ApplicationV2 no reciba el Escape y no cierre.
    if (this.element && !this._escBloqueado)
    {
      this._escBloqueado = true;
      this.element.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape")
        {
          ev.stopPropagation();
          ev.preventDefault();
        }
      }, true);
    }

    // El log tiene scroll: lo llevamos SIEMPRE al final para que el resultado
    // (la última línea resaltada) quede visible sin tener que bajar a mano.
    const logEl = this.element.querySelector(".ad6-combate-log");
    if (logEl) logEl.scrollTop = logEl.scrollHeight;

    // Inputs de éxitos de ATAQUE (uno por ARMA, solo si editable).
    // OJO: el parcial parcialMaxValor, en modo editable, emite el input con
    // name="{{campo}}". Cada arma usa el campo "exitos-ataque-<indice>", así que
    // recogemos todos y sacamos el índice del propio nombre del campo.
    const inputsAtaque = this.element.querySelectorAll("input[name^='exitos-ataque-']");
    inputsAtaque.forEach((input) => {
      input.addEventListener("change", async (ev) => {
        const indice = Number(ev.target.name.split("-").pop());
        await Servicio.fijarExitosAtaque(this.encuentroId, indice, ev.target.value);
        this.render();
      });
    });

    // Selects de PENETRACIÓN FINAL (uno por arma, solo si el arma tiene varias
    // opciones "Pn|m" y el atacante puede editar). El índice va en el nombre
    // del campo "penetracion-final-<indice>".
    const selectsPen = this.element.querySelectorAll("select[name^='penetracion-final-']");
    selectsPen.forEach((select) => {
      select.addEventListener("change", async (ev) => {
        const indice = Number(ev.target.name.split("-").pop());
        await Servicio.fijarPenetracionFinal(this.encuentroId, indice, ev.target.value);
        this.render();
      });
    });

    // Selects de DAÑO FINAL (uno por arma, solo si el arma tiene varias opciones
    // "L|2xL" y el atacante puede editar). Mismo mecanismo que la penetración.
    // El índice va en el nombre del campo "dano-final-<indice>".
    const selectsDano = this.element.querySelectorAll("select[name^='dano-final-']");
    selectsDano.forEach((select) => {
      select.addEventListener("change", async (ev) => {
        const indice = Number(ev.target.name.split("-").pop());
        await Servicio.fijarDanoFinal(this.encuentroId, indice, ev.target.value);
        this.render();
      });
    });

    // Inputs de éxitos de DEFENSA (uno por FUENTE, solo si editable).
    // Igual que en ataque: el parcial parcialMaxValor emite el input con
    // name="exitos-defensa-<indice>"; sacamos el índice del propio nombre.
    const inputsDefensa = this.element.querySelectorAll("input[name^='exitos-defensa-']");
    inputsDefensa.forEach((input) => {
      input.addEventListener("change", async (ev) => {
        const indice = Number(ev.target.name.split("-").pop());
        await Servicio.fijarExitosDefensa(this.encuentroId, this.actorUuid, indice, ev.target.value);
        this.render();
      });
    });

    // Buscador de objetivos: filtramos la lista de resultados por NOMBRE mientras
    // se escribe. El uuid de cada fila viaja en data-uuid y NUNCA se muestra.
    const buscador = this.element.querySelector("input[data-buscador-objetivos]");
    const lista    = this.element.querySelector("[data-resultados-objetivos]");
    if (buscador && lista)
    {
      const filas = Array.from(lista.querySelectorAll(".ad6-combate-resultado"));

      const aplicarFiltro = () => {
        const q = buscador.value.trim().toLowerCase();
        let visibles = 0;
        for (const fila of filas)
        {
          const nombre = (fila.dataset.nombre ?? fila.textContent ?? "").toLowerCase();
          const coincide = q.length === 0 || nombre.includes(q);
          fila.style.display = coincide ? "" : "none";
          if (coincide) visibles++;
        }
        // Mostramos la lista solo si hay algo que ofrecer y texto escrito.
        lista.style.display = (visibles > 0 && q.length > 0) ? "" : "none";
      };

      // Estado inicial: lista oculta hasta que se escriba.
      lista.style.display = "none";
      buscador.addEventListener("input", aplicarFiltro);
      buscador.addEventListener("focus", aplicarFiltro);
      // Al perder el foco, ocultamos la lista (pequeño retardo para que dé
      // tiempo al "click" sobre una fila de resultado).
      buscador.addEventListener("blur", () => {
        setTimeout(() => { lista.style.display = "none"; }, 150);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers de módulo
// ---------------------------------------------------------------------------

/** Construye el texto de descriptores a partir del system del arma clonada. */
function _descriptoresDe(datosArma)
{
  if (!datosArma) return "";
  const partes = [];
  if (datosArma.extendido)     partes.push("[E]");
  if (datosArma.agua)          partes.push("[W]");
  if (datosArma.bocajarro)     partes.push("[M]");
  if (datosArma.francotirador) partes.push("[S]");
  if (datosArma.incendiaria)   partes.push("[In]");
  if (datosArma.corrosiva)     partes.push("[Co]");
  if (datosArma.pesada)        partes.push("[Bu]");
  if (datosArma.bloqueo)       partes.push("[Pr]");
  if (datosArma.misiles)       partes.push("[Ms]");
  if (datosArma.silenciosa)    partes.push("[Q]");
  return partes.join(" ");
}
