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
    ,talentos: {
        template: "systems/ad6_robotech/templates/actor/tabTalentos.hbs",
        scrollable: [".tab-content"]
    }
    ,elementos: {
        template: "systems/ad6_robotech/templates/actor/tabElementos.hbs",
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
                { id: "elementos", label: "Elementos" },
                { id: "talentos", label: "Talentos" },
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
    super._onTirarDados(event,target);
    const resultado = this.actor.system.calcularAgotamiento();
    const elEstres = foundry.utils.deepClone(this.actor.system.estres ?? []);
    this.agregarUpdates("system.estres", elEstres);
    this.actualizar();
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

    //context.tabs = this._prepareTabs("primary");
    return context;
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