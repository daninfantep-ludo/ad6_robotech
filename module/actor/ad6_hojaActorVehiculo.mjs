import {Ad6_HojaActorPersona} from './ad6_hojaActorPersona.mjs'
import {Ad6_HojaActorTeniente} from './ad6_hojaActorTeniente.mjs'
import {Ad6} from '../config.mjs'
import * as Func from '../../model/funciones.mjs'

export class Ad6_HojaActorVehiculo extends Ad6_HojaActorTeniente
{
  constructor(options = {}) {
    super(options);
    // Valor por defecto, pero solo si no hay uno guardado
    this._activeTab = this._activeTab ?? "equipo";
    // ver si tiene estructura, si no, crearla
    let armaduras = this.actor.items.filter(function(item){return item.type=="armadura"}); //debería haber solo una
    if(armaduras.length==0)
    {
      let feature = { name: "Blindaje" ,type: "armadura" };
      this.actor.createEmbeddedDocuments("Item",[feature]);
    } else if (armaduras.length>2)
    {
      ui.notifications.error(game.i18n.localize("Ad6.Mensajes.mechaArmadurasExcedidas")) ;
    }
    let perfiles = this.actor.items.filter(function(item){return item.type=="perfilVelocidad"}); //debería haber solo una
    if(perfiles.length==0)
    {
      let feature = { name: "Velocidad" ,type: "perfilVelocidad", system: {inicial: "", velocidad:"", seleccionado:true} };
      this.actor.createEmbeddedDocuments("Item",[feature]);
    }
    this._activeTab="equipo";
  }

  static DEFAULT_OPTIONS = {
     classes: ["my-system", "sheet", "actor"]
    ,scrollY: [".tab-content"]
    ,position: {
      width: 800,
      height: 740
    }
    ,actions:{
      cambiarVelocidad: this._onCambiarVelocidad
      ,borrarPiloto: this._onBorrarPiloto
      ,tirarDados: this._onTirarDados
      ,toggleHardware: this._onToggleHardware
      ,clickConfigVehiculo: this._onClickConfigVehiculo
      ,clickLocalizacion: this._onClickLocalizacion
      ,clickSistema: this._onClickSistema
                        ,recargarPiloto: this._onRecargarPiloto
      ,borrarTirada: this._onBorrarTirada

    }
    
    ,dragDrop: [{
        dragSelector: ".item",
        dropSelector: ".window-content"
    }]

    ,form: {
      closeOnSubmit: false,
      submitOnChange: true
    }

  };
  
  static PARTS = {
    vitales: {
      template: "systems/ad6_robotech/templates/actor/vehiculoVitales.hbs"
    }
    ,tirada:
    {
      template: "systems/ad6_robotech/templates/actor/vehiculoTiradaPiloto.hbs"
    }
    ,tabs: 
    {
        template: "systems/ad6_robotech/templates/actor/principalTabsNavegacion.hbs"
    }
    ,habilidades: {
        template: "systems/ad6_robotech/templates/actor/vehiculoHabilidades.hbs",
        scrollable: [".tab-content"]
    }
    ,talentosElementos: {
        template: "systems/ad6_robotech/templates/actor/vehiculoTalentosElementos.hbs",
        scrollable: [".tab-content"]
    }

    ,equipo: {
        template: "systems/ad6_robotech/templates/actor/tabEquipo.hbs",
        scrollable: [".tab-content"]
    }
    ,localizaciones: {
        template: "systems/ad6_robotech/templates/actor/tabLocalizaciones.hbs",
        scrollable: [".tab-content"]
    }
    ,competencias:
    {
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
                { id: "talentosElementos", label: "Especiales" },
                { id: "equipo", label: "Equipo" },
                { id: "localizaciones", label: "Localizaciones" },
                { id: "competencias", label: "Competencias" },
                { id: "notas", label: "Notas" }
            ],
            initial: "equipo"
        }
    };

      async _onChangeNave(rolNave,tipoTripulacion)
      {
        // cambia los valores
        let cadena = "Naves." + tipoTripulacion + "." + rolNave;
        this.agregarUpdates("system.asistir", foundry.utils.getProperty(Ad6, cadena + ".asistir"));
        this.agregarUpdates("system.observar", foundry.utils.getProperty(Ad6, cadena + ".observar"));
        this.agregarUpdates("system.ocultar", foundry.utils.getProperty(Ad6, cadena + ".ocultar"));
        this.agregarUpdates("system.atacar", foundry.utils.getProperty(Ad6, cadena + ".atacar"));
        this.agregarUpdates("system.defender", foundry.utils.getProperty(Ad6, cadena + ".defender"));
        this.agregarUpdates("system.redirigir", foundry.utils.getProperty(Ad6, cadena + ".redirigir"));
        this.agregarUpdates("system.interactuar", foundry.utils.getProperty(Ad6, cadena + ".interactuar"));
        this.agregarUpdates("system.inhibir", foundry.utils.getProperty(Ad6, cadena + ".inhibir"));
        this.actualizar();
    
        Func.borrarTirada(this.actor);
        
      }
        
        static async _onBorrarTirada(event,target)
        {
          super._onBorrarTirada(event,target);
          // borrar las habilidades del piloto también.

                    const idPiloto = this.actor.system.nombrePiloto;
          if (idPiloto && (idPiloto !== "undefined")) {
            const piloto = game.actors.get(idPiloto);
            if (piloto) {
              let habilidades = piloto.items.filter(i => i.type === "habilidad");          
              for(let i = 0; i < habilidades.length; i++)
              {
                habilidades[i].system.marcado=false;
                habilidades[i].update({["system.marcado"]: false}); // hay que poner system.marcado para actualizar el
                                                                          // modelo de datos      
              }
              // Suities de equipo PERSONALES del piloto: al borrar la tirada dejan
              // de estar "siendoUsado", igual que las habilidades. (El resto de
              // suits -los del propio vehículo- los desmarca Func.borrarTirada.)
              let suitsPersonales = piloto.items.filter(i => i.type === "suitEquipo" && i.system.personal === true);
              for(let i = 0; i < suitsPersonales.length; i++)
              {
                suitsPersonales[i].system.siendoUsado = false;
                suitsPersonales[i].update({["system.siendoUsado"]: false});
              }
            }

          }
        }

    _onChangeForm(formConfig, event) {
      const target = event.target;

      // si el target que genera el change tiene el tag de abajo
      // que yo lo puse en el select de tipo de teniente
      if (target.matches("[data-tipoTripulacion-select]")) {

          this._onChangeNave(this.actor.system.rolNave, target.value);
      }
      if (target.matches("[data-rolNave-select]")) {

          this._onChangeNave(target.value, this.actor.system.tipoTripulacion);
      }

      return super._onChangeForm(formConfig, event);
    } 

    static async _onRecargarPiloto(event,target)
    {
      
      this.render();
    }
    obtenerTabs() {
      let tabsList = [
        { id: "equipo", label: "Equipo", group: "primary" },
        { id: "competencias", label: "Competencias" },
        { id: "notas", label: "Notas", group: "primary" }
      ];
      if(this.actor.system.usaLocalizaciones)
      {
        tabsList = [
        { id: "equipo", label: "Equipo", group: "primary" },
        { id: "localizaciones", label: "Localizaciones", group: "primary" },
        { id: "competencias", label: "Competencias" },
        { id: "notas", label: "Notas", group: "primary" }
      ];
      }


      const idPiloto = this.actor.system.nombrePiloto;
      if (idPiloto) {
        const piloto = game.actors.get(idPiloto);
        if (piloto) {
          if (piloto.type === "principal") {
            if(this.actor.system.usaLocalizaciones)
            {
              tabsList = [
                { id: "habilidades", label: "Habilidades", group: "primary" },
                { id: "talentosElementos", label: "Especiales", group: "primary" },                
                { id: "equipo", label: "Equipo", group: "primary" },
                { id: "localizaciones", label: "Localizaciones", group: "primary" },
                { id: "competencias", label: "Competencias" },
                { id: "notas", label: "Notas", group: "primary" }
              ];
            }
            else
            {
              tabsList = [
                { id: "habilidades", label: "Habilidades", group: "primary" },
                { id: "talentosElementos", label: "Especiales", group: "primary" },                
                { id: "equipo", label: "Equipo", group: "primary" },
                { id: "competencias", label: "Competencias" },
                { id: "notas", label: "Notas", group: "primary" }
              ];
            }
          } else if (piloto.type === "teniente") {
              if(this.actor.system.usaLocalizaciones)
              {
                tabsList = [
                  { id: "habilidades", label: "Habilidades", group: "primary" },
                  { id: "equipo", label: "Equipo", group: "primary" },
                  { id: "localizaciones", label: "Localizaciones", group: "primary" },
                  { id: "competencias", label: "Competencias" },
                  { id: "notas", label: "Notas", group: "primary" }
                ];
              }
              else
              {
                tabsList = [
                  { id: "habilidades", label: "Habilidades", group: "primary" },
                  { id: "equipo", label: "Equipo", group: "primary" },
                  { id: "competencias", label: "Competencias" },
                  { id: "notas", label: "Notas", group: "primary" }
                ];
              }
          }
        }
      }
      else
      {
        // ya sabemos que no tiene piloto, ahora ¿Es nave?
        if(this.actor.system.escalaPrincipal=="N")
        {
          tabsList = [
            { id: "habilidades", label: "Habilidades", group: "primary" },
            { id: "equipo", label: "Equipo", group: "primary" },
            { id: "competencias", label: "Competencias" },
            { id: "notas", label: "Notas", group: "primary" }];
          if(this.actor.system.usaLocalizaciones)
          {
            tabsList = [
              { id: "habilidades", label: "Habilidades", group: "primary" },
            { id: "equipo", label: "Equipo", group: "primary" },
            { id: "localizaciones", label: "Localizaciones", group: "primary" },
            { id: "competencias", label: "Competencias" },
            { id: "notas", label: "Notas", group: "primary" }];
          }
        }
        //console.log("------------->" + this.actor.system.escalaPrincipal);
      }

      return {
        primary: {
          tabs: tabsList,
          initial: "equipo"
        }
      };
    }

                // Estos checkboxes usan data-action (NO name). Guardamos el valor con
                // actor.update(); ApplicationV2 detecta el cambio del documento y re-renderiza
                // la hoja automáticamente (reconstruyendo también la barra de pestañas).
                // NO llamamos a this.render() para evitar un doble re-render que duplicaba
                // el contenido del tab activo.
                /*static async _onClickBasico(event,target)
                {
                  console.log(event.target.dataset);
                  const nuevoValor = target.checked ? true : false;
                  await this.actor.update({ "system.esBasico": nuevoValor });
                }

                static async _onClickLocalizaciones(event,target)
                {
                  const nuevoValor = target.checked ? true : false;
                  await this.actor.update({ "system.usaLocalizaciones": nuevoValor });
                }*/

                static async _onClickConfigVehiculo(event,target)
                {
                  const nuevoValor = target.checked ? true : false;
                  await this.actor.update({ [event.target.dataset.campo]: nuevoValor });

                }

                // Alterna el estado (operativa/destruida) de una localización del vehículo.
                // Las localizaciones pertenecen siempre al propio vehículo.
                static async _onClickLocalizacion(event,target)
                {
                  const itemId = target.dataset.id;
                  const item = this.document.items.get(itemId);
                  if (!item) return;
                  await item.update({ "system.marcado": !item.system.marcado });
                }


        // Cicla el estado de un sistema del vehículo al pulsar su botón.
    // - sensores / apuntado / impulsores: Nominal[0] -> Dificultad[-1] ->
    //   Desventaja[-2] -> Ventaja[+2] -> Apoyo[+1] -> (vuelve a Nominal)
    // - motores: 100% -> 75% -> 50% -> 25% -> 0% -> (vuelve a 100%)
    static async _onClickSistema(event,target)
    {
      const campo = target.dataset.sistema;  // sensores | apuntado | impulsores | motores
      const actual = this.actor.system[campo];

      let siguiente;
      if (campo === "motores")
      {
        const ciclo = ["100%","75%","50%","25%","0%"];
        const idx = ciclo.indexOf(String(actual));
        siguiente = ciclo[(idx >= 0 ? idx + 1 : 0) % ciclo.length];
      }
      else
      {
        // orden de ciclado pedido para los modificadores de condición
        const ciclo = ["normal","obstaculo","desventaja","ventaja","apoyo"];
        const idx = ciclo.indexOf(String(actual));
        siguiente = ciclo[(idx >= 0 ? idx + 1 : 0) % ciclo.length];
      }
      await this.actor.update({ [`system.${campo}`]: siguiente });
      this.render();
    }

    async _onTextChange(event)
    {
      super._onTextChange(event);
      if((event.target.dataset.blindaje=="S")&&(event.target.dataset.campo=="armadura.tipo"))
      {
        // si estoy cambiando la armadura principal, por lo tanto estoy cambiando el tipo de vehículo
        // debo ver si es nave, para poder las habilidades correspondientes si no no.-
           this.agregarUpdates("system.escalaPrincipal",event.target.value);
           this.actualizar();
      }
    }
    static async _onCambiarVelocidad(event,target)        
    {
      const itemId = event.target.dataset.id;
      const item = this.document.items.get(itemId);
      await Func.cambiarVelocidad(this.actor,item);
    }

    async _prepareContext(options) {
      
            const context = await super._prepareContext(options);
      // esto me va a servir para mapear que parcial muestro en el tab de habilidades en el vehículo
      const typeTemplateMap = {
          "principal": "tabHabilidades"
         ,"teniente": "tenienteTabHabilidades"
         ,"vehiculo":"vehiculoHabilidadesTripulacion"         
      };
      context.tipoTemplateHabilidad = "ninguno";
      context.piloto = null;

      // Separar la armadura principal ("Blindaje") del resto (escudo extra)
      const armaduras = context.armaduras || [];
      context.armaduraPrincipal = armaduras.find(i => i.name === "Blindaje") || armaduras[0] || null;
      // hago esto para poder acceder luego al tipo de vehículo que es por el tipo de armadura que es
      
      
      context.armaduraExtra = armaduras.find(i => i !== context.armaduraPrincipal) || null;
      context.velocidadPrincipal = context.velocidades.find(i => i.system.seleccionado);

      // voy a contar acá la cantidad de puntos de hardware que tengo     
      
      let cantEquiposHard = context.equipos.filter(i => i.system.esHardware).reduce((acc, item) => acc + Number(item.system?.bancos?.maximo || 0), 0);
      let cantSuitesHard = context.suitEquipos.filter(i => i.system.esHardware).reduce((acc, item) => acc + Number(item.system?.bancos?.maximo || 0), 0);
      let cantHardwares = context.hardwares.filter(i => true).reduce((acc, item) => acc + 1, 0);
      
      let cantRestEquipos = context.equipos.filter(i => i.system.esHardware).reduce((acc, item) => acc + Number(Func.ContarHardwaresActivos(item)||0),0);
      let cantRestSuites = context.suitEquipos.filter(i => i.system.esHardware).reduce((acc, item) => acc + Number(Func.ContarHardwaresActivos(item)||0),0);
      let cantRestHardwares = context.hardwares.filter(i => i.system.marcado).reduce((acc, item) => acc + 1, 0);

      
      context.totalHardware = cantEquiposHard + cantSuitesHard + cantHardwares; 
      context.totalHardwareRestante = cantRestEquipos + cantRestSuites + cantRestHardwares; 

      // Exponer el actor piloto y sus items cuando hay un piloto asignado
      const idPiloto = this.actor.system.nombrePiloto;
      if (idPiloto && (idPiloto !== "undefined")) {
        const piloto = game.actors.get(idPiloto);
                if (piloto) {
          context.talentos = piloto.items.filter(i => i.type === "talento");
          context.habilidades = piloto.items.filter(i => i.type === "habilidad");
          context.elementos = piloto.items.filter(i => i.type === "elemento");
          // Suities de equipo PERSONALES del piloto (system.personal === true):
          // son intrínsecos al personaje y se muestran en la pestaña "Especiales"
          // (junto a talentos y elementos) SÓLO mientras el piloto esté asignado.
          // NO se copian al vehículo: se listan EN VIVO desde el piloto, igual que
          // talentos/elementos/habilidades. Como las acciones (gastar/recargar/
          // editar/marcar siendoUsado) usan Func.ObtenerItem, que resuelve al
          // piloto cuando el item no es del vehículo, operan sobre el item REAL
          // del personaje (los usos se consumen ahí, no en una copia).
          context.suitEquiposPersonales = piloto.items.filter(i => i.type === "suitEquipo" && i.system.personal === true);
          context.tipoTemplateHabilidad = typeTemplateMap[piloto.type] || "ninguno";
          context.piloto = piloto;
          context.tipoPiloto = piloto.type;
          context.system.piloto = piloto; // me guardo el objeto también


          /* copio los datos del piloto en el context, para tenerlos disponibles, pero
             no los persisto */
          if(piloto.type=="principal")
          {
            context.system.agotamiento = piloto.system.agotamiento;
            //context.system.hastaAgotamiento = false; ya lo puse como miembro
            context.competenciasPiloto = piloto.items.filter(i => i.type === "competencia");

                        // Aviso si el piloto principal NO tiene ninguna competencia con el
            // mismo nombre que las que exige el vehículo (context.competencias).
            const requeridas = context.competencias || [];
            const nombresReq = requeridas.map(c => c.name);
            context.pilotoSinCompetencia = (nombresReq.length > 0) && (
                 !context.competenciasPiloto.length
              || context.competenciasPiloto.every(pc => !nombresReq.includes(pc.name))
            );
            /*
              Si el personaje tiene "vuelo todo" como talento hay que
              a) poner en cada vehículo que sea susceptible de ser volado la competencia
              "vuelo todo"
              b) en el personaje la competencia "vuelo todo"
              de esta manera el algoritmo detectará
              deberían quedar fuera las naves grandes, y los barcos
            */
          }
          if(piloto.type=="teniente")
          {
            // copio/creo esto porque antes no lo tenía el vehículo. Pero ahora lo puede tener
            // porque si es un vehículo sin piloto (podría ser un teniente pero tendría que cambiar mucho)
            // el tema del teniente en sí mismo, que también podría ser... pero esto implicaría tener artificialmente
            // un tipo de teniente por cada tipo de rol... mejor que se pueda elegir, en el fondo sería la tripulación
            // de la nave "por defecto"
              context.system.asistir = piloto.system.asistir;
              context.system.ocultar = piloto.system.ocultar;
              context.system.observar = piloto.system.observar;
              context.system.atacar = piloto.system.atacar;
              context.system.defender = piloto.system.defender;
              context.system.redirigir = piloto.system.redirigir;
              context.system.inhibir = piloto.system.inhibir;
              context.system.interactuar = piloto.system.interactuar;
              context.system.elemento = piloto.system.elemento;

          }
        }
      }
      else
      {
        // no tengo piloto
        if(context.system.escalaPrincipal=="N") // si es naval pongo los "Tenientes Navales"
        {
          context.tipoTemplateHabilidad = typeTemplateMap["vehiculo"] || "ninguno";
        }
      }

      return context;
    }
// extiendo el método para añadir la funcionalidad del agotamiento en caso que el piloto
// sea un principal, pero desde ese estado
    static async _onTirarDados(event,target)
  {
    // AWAIT del tirar base: dentro se consume el uso del equipo en uso. Con los
    // suits de equipo PERSONALES del piloto, el item consumido vive en el piloto
    // (item.update asíncrono), así que hay que esperar a que termine ANTES de
    // re-renderizar para que la fila muestre el nuevo "usos.restante".
    await super._onTirarDados(event,target);

    //console.log(this.actor.system.piloto); <--- esto funciona
    console.log(this.actor.name);
    const elPiloto = this.actor.system.piloto;
    if(elPiloto)
    {
      // Re-render SIEMPRE que haya piloto (no sólo principal): así se refresca el
      // uso consumido de los suits personales del piloto en cualquier caso.
      this.render();

      if(elPiloto.type == "principal")
      {
        elPiloto.system.dados = this.actor.system.dados;
        elPiloto.system.dadosEquipo = this.actor.system.dadosEquipo;
        elPiloto.system.hastaAgotamiento = this.actor.system.hastaAgotamiento;

        let resultado = elPiloto.system.calcularAgotamiento();
        const elEstres = foundry.utils.deepClone(elPiloto.system.estres ?? []);
        elPiloto.update({"system.estres":elEstres});
        if(resultado=="quiebre")
        {
          ui.notifications.error(game.i18n.format("Ad6.Mensajes.quiebre"));
        }
      }
    }

  }



    /**
   * Genera dinámicamente los tabs de la hoja del vehículo.
   * El piloto (si hay uno) decide qué tabs se muestran.
   */
  _prepareTabs(group="primary") {
    const params = this.obtenerTabs();
    const groupConf = params[group] || { tabs: [], initial: "" };

    // Normalizar la lista de tabs a objeto clave->tab
    const tabs = {};
    for (const tab of groupConf.tabs) {
      tabs[tab.id] = { ...tab };
    }

        // Activar el tab actual (misma lógica que la base para evitar flick)
    const entries = Object.values(tabs);
    for (const tab of entries) {
      const active = (tab.id === this._activeTab);
      tab.active = active;
      const base = tab.cssClass || "";
      tab.cssClass = active ? `${base} active`.trim() : base.replace(/\bactive\b/g, "").trim();
      // Nombre VISIBLE de la pestaña, localizado por su id (igual que la base).
      // Si la clave no existe, lo dejamos vacío para caer al "label" original.
      const clave = "Ad6.Pestanas." + tab.id;
      tab.labelTraducido = game.i18n.has(clave) ? game.i18n.localize(clave) : "";
    }

    // Asegurar que _activeTab apunta a un tab existente
    if (!Object.prototype.hasOwnProperty.call(tabs, this._activeTab)) {
      this._activeTab = groupConf.initial || entries[0]?.id || "";
    }

    return tabs;
  }

  static async _onBorrarPiloto(event, target) {
    //await this.actor.update({"system.nombrePiloto": ""});
    this.agregarUpdates("system.nombrePiloto", "");    
    this.agregarUpdates("name", this.actor.system.nombreAnterior);
    this.actualizar();
    this.render();
  }

  // Alterna el estado (operativo/estropeado) de un hardware de un equipo del vehículo.
  // Los hardwares siempre pertenecen al propio vehículo (el piloto no usa hardwares).
  static async _onToggleHardware(event, target) {
    const itemId = target.dataset.id;
    const index = Number(target.dataset.index);
    const item = this.document.items.get(itemId);
    // console.log(item);
    if (!item) return;

    // Array actual de hardwares (seguro ante undefined/huecos)
    const actuales = Array.from(item.system.hardwares ?? []);
    //console.log(actuales);
    if (!Number.isFinite(index) || (index < 0) || (index >= actuales.length)) return;

        // Clonamos para no mutar el documento y alternamos el valor en el índice
    const hardwares = [...actuales];
    hardwares[index] = !hardwares[index];
    //console.log(hardwares);
    await item.update({ "system.hardwares": hardwares });
    // Re-renderizar la hoja para que el color del botón se actualice al momento.
    this.render();
  }

    async _onDrop(event) {
      // Un Item de tipo "upgrade" (Mejora): se añade al actor Y se EQUIPA
      // automáticamente. La gestión vive en la base (_gestionarDropUpgrade), para
      // compartirla con principal y teniente. Si el drop era un upgrade, ya está
      // gestionado y salimos.
      if (await this._gestionarDropUpgrade(event)) return;

      // Leemos los datos del arrastre. Si hubiera algún problema o no es un
      // Actor, delegamos SIEMPRE en el comportamiento por defecto (que gestiona
      // añadir items, importar actores, etc.). Así no se rompe el drop de armaduras.
      let data;
      try {
        data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
      } catch (err) {
        return super._onDrop(event);
      }

      // Todo lo que NO sea un Actor se lo dejamos al manejo nativo
      // (p. ej. los Items como armaduras, armas, etc.)
      if (data.type !== "Actor") {
        return super._onDrop(event);
      }

    // solo hago esto si lo dropeado es un actor
    const actor = await fromUuid(data.uuid);
    if (!actor) return super._onDrop(event);

    // Solo se aceptan pilotos de tipo teniente o principal.
    // Cualquier otro actor se rechaza y se CANCELA el drop (no es un item).
    if (!["teniente", "principal"].includes(actor.type)) {
      ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.soloPilotosTenientePrincipal"));
      return;
    }

    this.agregarUpdates("system.nombrePiloto", actor.id);
    this.agregarUpdates("system.nombreAnterior", this.actor.name);
    //await this.actor.update({ name: "New Actor Name" });
    this.agregarUpdates("name", this.actor.name + " ["+ actor.name +"]");

    if(actor.type=="teniente")
    {
      /* nota importante: por qué copio los de teniente y es más hago que el vehículo herede de teniente
       lo que parece que es una aberración de diseño? (y seguramente lo és):
       necesito los métodos de control de los botones de click de habilidad
       pero por la puta madre pareciera que los puedo poner en funciones, porque usa cosas de persona*/

      /*await this.agregarUpdates("system.asistir",actor.system.asistir);
      await this.agregarUpdates("system.ocultar",actor.system.ocultar);
      await this.agregarUpdates("system.observar",actor.system.observar);
      await this.agregarUpdates("system.atacar",actor.system.atacar);
      await this.agregarUpdates("system.defender",actor.system.defender);
      await this.agregarUpdates("system.redirigir",actor.system.redirigir);
      await this.agregarUpdates("system.inhibir",actor.system.inhibir);
      await this.agregarUpdates("system.interactuar",actor.system.interactuar);
      await this.agregarUpdates("system.elemento",actor.system.elemento);*/
      
      }
    if(actor.type=="principal")
    {
     /* await this.agregarUpdates("system.agotamiento",actor.system.agotamiento);
     await  this.agregarUpdates("system.hastaAgotamiento",actor.system.hastaAgotamiento);
         console.log(actor.system.agotamiento);
    console.log(actor.system.hastaAgotamiento);*/

    }

      await this.actualizar();
    
    //await this.actor.update({"system.nombrePiloto": actor.id});

    this.render();
    /*console.log(this.actor.system.agotamiento);
    console.log(this.actor.system.hastaAgotamiento);
    console.log(this.actor.system.elemento);*/

  }
  onOpen(options) {
  this._activeTab = "equipo";
  return super.onOpen(options);
  }
}