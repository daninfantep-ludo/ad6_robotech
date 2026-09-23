import {Ad6_HojaActorPersona} from './ad6_hojaActorPersona.mjs'



export class Ad6_HojaActorPrincipal extends Ad6_HojaActorPersona
{
  constructor(options = {}) {
    super(options);
    // Valor por defecto, pero solo si no hay uno guardado
    this._activeTab = this._activeTab ?? "habilidades";
  }

  static DEFAULT_OPTIONS = {
     classes: ["my-system", "sheet", "actor"]
    ,scrollY: [".tab-content"]
    ,position: {
      width: 810,
      height: 740
    }

            ,actions: {
       clickHeroico: this._onClickHeroico
      ,clickDisposicion: this._onClickDisposicion
      ,clickConducta: this._onClickConducta
      ,clickEstres: this._onClickEstres
      ,tirarDados: this._onTirarDados
      ,clickHexHeroico: this._onClickHexHeroico
      ,quitarVehiculo: this._onQuitarVehiculo
      // Necesario para que se ejecute NUESTRO _onBorrarTirada (que además
      // desmarca los equipos/suities del vehículo). Sin esto se heredaría el
      // de la base y el vehículo no se desmarcaría.
      ,borrarTirada: this._onBorrarTirada

    }
    ,form: {
      closeOnSubmit: false,
      submitOnChange: true
    }

  };

  static PARTS = {
    principalVitales: {
       template: "systems/ad6_robotech/templates/actor/principalVitales.hbs"
    }
    ,principalEstresHeridas: {
       template: "systems/ad6_robotech/templates/actor/principalEstresHeridas.hbs"
    }
    ,tirada:
    {
      template: "systems/ad6_robotech/templates/actor/principalTiradaHeroicos.hbs"
    }
    ,tabs: 
    {
        template: "systems/ad6_robotech/templates/actor/principalTabsNavegacion.hbs"
    }
        ,habilidades: {
        template: "systems/ad6_robotech/templates/actor/tabHabilidades.hbs",
        scrollable: [".tab-content"]
    }
    ,talentosElementos: {
        template: "systems/ad6_robotech/templates/actor/principalTalentosElementos.hbs",
        scrollable: [".tab-content"]
    }
    ,tripulante: {
        template: "systems/ad6_robotech/templates/actor/principalTripulante.hbs",
        scrollable: [".tab-content"]
    }
    ,equipo: {
        template: "systems/ad6_robotech/templates/actor/tabEquipo.hbs",
        scrollable: [".tab-content"]
    }
    ,competencias: {
        template: "systems/ad6_robotech/templates/actor/tabCompetencias.hbs",
        scrollable: [".tab-content"]
    }
    ,notas: {
        template: "systems/ad6_robotech/templates/actor/tabNotas.hbs",
        scrollable: [".tab-content"]
    }

  };

      static TABS = {
        primary: {
            tabs: [
                { id: "habilidades", label: "Habilidades" },
                { id: "talentosElementos", label: "Especiales" },
                { id: "equipo", label: "Equipo" },
                { id: "competencias", label: "Competencias" },
                { id: "notas", label: "Notas" }
            ],
            initial: "habilidades"
        }
    };

    

  // COMPORTAMIENTO ESPECIAL EN PRINCIPAL:
  // extiende el método general para manejar el agotamiento si se ha superado
  // para usarlo y que no me llame sólo al del padre hay que registrarlo en el actions
  // del hijo para que ejecute este
    static async _onTirarDados(event,target)
  {
    // AWAIT del tirar base: dentro se consume el uso del equipo/suit en uso.
    // Si el personaje es TRIPULANTE, ese item pertenece al VEHÍCULO
    // (item.update asíncrono), así que hay que esperar a que termine ANTES de
    // re-renderizar para que la fila muestre el nuevo "usos.restante".
    await super._onTirarDados(event,target);
    const resultado = this.actor.system.calcularAgotamiento();
    const elEstres = foundry.utils.deepClone(this.actor.system.estres ?? []);
    this.agregarUpdates("system.estres", elEstres);
    await this.actualizar();
    // Re-render para reflejar el uso consumido (p.ej. el suit de equipo del
    // vehículo en la pestaña Tripulante).
    this.render();
    if(resultado=="quiebre")
    {
      ui.notifications.error(game.i18n.format("Ad6.Mensajes.quiebre"));
    }

  }




  // PRINCIPAL: extiende el comportamiento normal para poner las subespecialidades que son propias sólo de personajes principales
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    // prepara el listado de subespecialidades de la carrera de forma que sea legible por el Handlebars
    const sublistadoEspecialidades= context.config.Especialidades[this.actor.system.carrera] ?? {};        
    context.especialidadesCarrera = Object.fromEntries(
    Object.entries(sublistadoEspecialidades).map(([clave, datos]) => 
      [ datos.nombre,
        game.i18n.localize(datos.nombre)
      ]));

    /* Código para el manejo de los tabs */
    /*********************************** */

    // Vehículo del que este principal es TRIPULANTE (si lo hay). Se expone EN
    // VIVO: los equipos y suities se leen del actor vehículo, NO se copian. Se
    // usan nombres de contexto PROPIOS (equiposVehiculo / suitEquiposVehiculo)
    // para NO pisar las listas propias del personaje que usa la pestaña Equipo.
    context.vehiculoTripulante = null;
    context.equiposVehiculo = [];
    context.suitEquiposVehiculo = [];
    context.equiposVehiculoHayBancos = false;
    context.suitEquiposVehiculoHayBancos = false;

    const idVehiculo = this.actor.system?.nombreVehiculo;
    if (idVehiculo && (idVehiculo !== "undefined")) {
      const vehiculo = game.actors?.get(idVehiculo);
      if (vehiculo) {
        context.vehiculoTripulante = vehiculo;
        context.equiposVehiculo = vehiculo.items.filter(i => i.type === "equipo");
        context.suitEquiposVehiculo = vehiculo.items.filter(i => i.type === "suitEquipo");
        context.equiposVehiculoHayBancos = context.equiposVehiculo.some(i => i.system.esBanco);
        context.suitEquiposVehiculoHayBancos = context.suitEquiposVehiculo.some(i => i.system.esBanco);
      }
    }

    return context;
  }

  // PRINCIPAL: la pestaña "Tripulante" SOLO aparece si hay un vehículo
  // instalado (system.nombreVehiculo). Como static TABS no puede ver al actor,
  // inyectamos/quitamos la pestaña aquí, reutilizando toda la lógica de activado
  // (active/cssClass/labelTraducido) que ya hace _prepareTabs de la base.
  _prepareTabs(group = "primary") {
    const tabs = super._prepareTabs(group);

    const idVehiculo = this.actor.system?.nombreVehiculo;
    const hayVehiculo = !!idVehiculo && (idVehiculo !== "undefined");

    if (group === "primary" && hayVehiculo) {
      const activo = (this._activeTab === "tripulante");
      tabs.tripulante = {
        id: "tripulante",
        label: "Tripulante",
        active: activo,
        cssClass: activo ? "active" : "",
        // Nombre visible localizado por id; si no existe la clave, cae al label.
        labelTraducido: game.i18n.has("Ad6.Pestanas.tripulante")
          ? game.i18n.localize("Ad6.Pestanas.tripulante") : ""
      };
    }

    // Si el vehículo se ha quitado y estábamos en "tripulante", volvemos a
    // "habilidades" para no dejar un tab activo inexistente.
    if (this._activeTab === "tripulante" && !tabs.tripulante) {
      this._activeTab = "habilidades";
      if (tabs.habilidades) {
        tabs.habilidades.active = true;
        const base = tabs.habilidades.cssClass || "";
        tabs.habilidades.cssClass = `${base} active`.trim();
      }
    }

    return tabs;
  }

  // PRINCIPAL: al BORRAR la tirada hay que desmarcar también los EQUIPOS y
  // SUITIES del vehículo del que es tripulante (los del propio personaje ya los
  // desmarca Func.borrarTirada). Así no quedan usos/"siendoUsado" colgados en el
  // vehículo cuando se resetea la ronda desde la hoja del principal.
    static async _onBorrarTirada(event, target) {
    await super._onBorrarTirada(event, target);

    const idVehiculo = this.actor.system?.nombreVehiculo;
    if (idVehiculo && (idVehiculo !== "undefined")) {
      const vehiculo = game.actors?.get(idVehiculo);
      if (vehiculo) {
        const delVehiculo = vehiculo.items.filter(i => i.type === "equipo" || i.type === "suitEquipo");
        for (const item of delVehiculo) {
          item.system.siendoUsado = false;
          await item.update({ ["system.siendoUsado"]: false });
        }
        // Re-render para que las filas del vehículo muestren los checks
        // desmarcados (el update del propio actor no garantiza que se lea el
        // vehículo ya actualizado; forzamos el refresco al terminar).
        this.render();
      }
    }
  }

  // PRINCIPAL: el personaje "baja" del vehículo (botón X de la pestaña Tripulante).
  static async _onQuitarVehiculo(event, target) {
    this.agregarUpdates("system.nombreVehiculo", "");
    await this.actualizar();
    this.render();
  }

  // PRINCIPAL: aceptar el DROP de un actor de tipo VEHÍCULO para actuar como
  // tripulante. Cualquier otro Actor se rechaza (no se arrastra a esta hoja); los
  // Items (armas, armaduras, Mejoras...) siguen el flujo nativo.
  async _onDrop(event) {
    // Un Item de tipo "upgrade" (Mejora) se añade y equipa automáticamente.
    if (await this._gestionarDropUpgrade(event)) return;

    let data;
    try {
      data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    } catch (err) {
      return super._onDrop(event);
    }

    // Todo lo que NO sea un Actor se delega al manejo nativo (Items, etc.).
    if (data.type !== "Actor") return super._onDrop(event);

    const actor = await fromUuid(data.uuid);
    if (!actor) return super._onDrop(event);

    // Solo se acepta un VEHÍCULO como tripulante.
    if (actor.type !== "vehiculo") {
      ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.soloVehiculo"));
      return;
    }

    this.agregarUpdates("system.nombreVehiculo", actor.id);
    await this.actualizar();
    this.render();
  }



  // PRINCIPAL: acción de pinchar en las casillas de estrés propio de actor principal
  static async _onClickEstres(event,target)
  {
    event.preventDefault();
    const indice = Number(target.dataset.indice);
    const actor = this.actor;
    const estres = foundry.utils.deepClone(
        actor.system.estres ?? []
    );
    const actual = estres[indice];
    const siguiente = {
      "": "F",
      "F": "D",
      "D": ""
    }[actual];

    estres[indice] = siguiente ?? "";
    this.agregarUpdates("system.estres",estres);
    this.actualizar();
    /*await actor.update({
        "system.estres": estres
    });*/
  }

  // PRINCIPAL: botón para hacer click en un movimiento heróico
  static async _onClickHexHeroico(event,target)
  {
    
    event.preventDefault();
    const indice = Number(target.dataset.indice);
    const actor = this.actor;
    const movimientosHeroicos = foundry.utils.deepClone(
        actor.system.movimientosHeroicos ?? []
    );
    
    const actual = movimientosHeroicos[indice].letra;
    const siguiente = {
      "": "X",
      "X": ""
    }[actual];

    movimientosHeroicos[indice].letra = siguiente ?? "";
    
    this.agregarUpdates("system.movimientosHeroicos",movimientosHeroicos);
    this.actualizar();

  }

  // PRINCIPAL: botón para setear si tengo un movimiento heróico más por el talento rugido de león
  static async _onClickHeroico(event,target)
  {
    const valor = target.dataset.valor;    
    const movimientosHeroicos = foundry.utils.deepClone(
        this.actor.system.movimientosHeroicos ?? []
    );
      
    movimientosHeroicos[0].visible = (valor=="false");
    movimientosHeroicos[0].letra = "";
    movimientosHeroicos[1].letra = "";    
    this.agregarUpdates("system.movimientosHeroicos",movimientosHeroicos);
    this.actualizar();



  }

  /* PRINCIPAL: solo los principales rerollean con naturaleza y conducta */
  async  logicaNaturaleza(valor, valorDescriptor)
  {
    if(valor=="false")
    { 
      this.msgSimple("Ad6.Mensajes.Naturaleza.gastar",{ descriptor: valorDescriptor });
    } else { 
      this.msgSimple("Ad6.Mensajes.Naturaleza.recargar",{ descriptor: valorDescriptor });
    }

  }
  /* PRINCIPAL: solo los principales rerollean con naturaleza y conducta */
  static async _onClickDisposicion(event,target)
  {
    const valor = target.dataset.valor;    
    this.logicaNaturaleza(valor,game.i18n.format("Ad6.Etiquetas.disposicion"));
  }
  /* PRINCIPAL: solo los principales rerollean con naturaleza y conducta */
  static async _onClickConducta(event,target)
  {
    const valor = target.dataset.valor;    
    this.logicaNaturaleza(valor,game.i18n.format("Ad6.Etiquetas.conducta"));
  }
}