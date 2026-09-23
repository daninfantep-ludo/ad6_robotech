const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
import {Ad6} from '../config.mjs'
import * as Func from '../../model/funciones.mjs'
import { NSLOTS_TIRADA } from '../../model/funciones.mjs'
import * as ServicioAsistencia from '../chat/ad6_servicioAsistencia.mjs'
import * as ServicioCombate from '../combate/ad6_servicioCombate.mjs'
import * as ServicioUpgrade from '../upgrade/ad6_servicioUpgrade.mjs'


/* este clase es en la que pongo todas las funciones comunes para que las hereden todas las hojas
   como los manejos generales de los items, borrarlos y similar */

export class Ad6_HojaActor extends HandlebarsApplicationMixin(ActorSheetV2) 
{
      constructor(options = {}) {
      super(options);
      // Valor por defecto, pero solo si no hay uno guardado
      this._activeTab = this._activeTab ?? "habilidades";
      this._tabsListenerAttached = false;
    }
    
    static DEFAULT_OPTIONS = {
    classes: ["my-system", "sheet", "actor"],
        position: {
      width: 600,
      height: 800
    },
    window: {
      //title: "Hoja de Personaje",
      resizable: true, // <--- ESTO activa la capacidad de cambiar el tamaño
      minimizable: true
    },
        // Define the form parts that compose your sheet layout
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    // Permitir arrastrar items SOBRE la hoja (necesario para dropear Mejoras
    // "upgrade" en principal/teniente/vehiculo, y para los drops nativos).
    dragDrop: [{
      dragSelector: null,
      dropSelector: ".window-content"
    }],
    actions: {
       editPortrait: Ad6_HojaActor.prototype._onEditPortrait
      ,itemAnadir: this._onItemAnadir
      ,itemBorrar: this._onItemBorrar
      ,itemChat: this._onItemChat
      ,itemEditar: this._onItemEditar
      ,tirarDados: this._onTirarDados
      ,borrarTirada: this._onBorrarTirada      
      ,gastarItem: this._onGastarItem
            ,recargarItem: this._onRecargarItem
      ,infinitoItem: this._onInfinitoItem
      ,clickHabilidadTeniente: this._onClickHabilidadTeniente
            ,guardarTirada: this._onGuardarTirada
      ,restablecerTirada: this._onRestablecerTirada
            ,resetearTiradas: this._onResetearTiradas
            ,abrirAtaque: this._onAbrirAtaque
            ,fuegoConcentrado: this._onFuegoConcentrado
            ,prestarDefensa: this._onPrestarDefensa
            ,borrarUpgrade: this._onBorrarUpgrade

    }
  };

  
  // funciones generales para borrar, añadir y enviar al chat itemes embebidos en las hojas
  static async _onItemBorrar(event,target)
  {
      const itemId = event.target.dataset.id;
      //console.log(this.actor.type);
      // se le pasa el tipo para saber de qué actor hay que borrar
      const res = await Func.ObtenerActorOriginal(this.actor,event.target.dataset.tipo);
      await res.actor.deleteEmbeddedDocuments("Item", [itemId]);
      if (res.esPiloto)
        this.render();
      //await this.actor.deleteEmbeddedDocuments("Item", [itemId])
  }
  static async _onItemChat(event,target)
  {
    const itemId = event.target.dataset.id;
    //const item = this.document.items.get(itemId);
    let item = await Func.ObtenerItem(this.actor,itemId);

    this.msgSimple("Ad6.Mensajes.Habilidad.Chat",{titulo: item.name, tipo:game.i18n.format("TYPES.Item." + item.type), notas: item.system.descripcion });
  }
  static async _onItemEditar(event,target)
  {
    const itemId = event.target.dataset.id;
    //const item = this.document.items.get(itemId);
    let item = await Func.ObtenerItem(this.actor,itemId);
    item.sheet.render(true);
  }
  // función a nivel padre para crear un item en el actor, pasándole el parámetro
  // todos los actores van a tener que crear itemes y si bien hay que definir el action en cada
  // formulario, la función general es esta

    static async _onItemAnadir(event,target)
    {
      const tipo = target.dataset.tipo;
      let feature = { name: game.i18n.localize("Ad6.Mensajes.nuevoItem") ,type: tipo };
      // se le pasa el tipo para saber de qué actor hay que borrar
      const res = await Func.ObtenerActorOriginal(this.actor,tipo);
      
      //this.actor.createEmbeddedDocuments("Item",[feature]);
      await res.actor.createEmbeddedDocuments("Item",[feature]);
      if(res.esPiloto)
        {
        this.render();
        }
    }

    // da igual que sea un talento o un equipment suite, es algo que tiene
    // la propiedad usos y es un item, lo demás, para este método, da lo mismo
    // en el caso de la tirada veré cómo invocar esto  o refactorizar el código
    // para que solo se gasten cosas desde un lugar
    static async _onInfinitoItem(event,target)
    {
        const itemId = event.target.dataset.id;
        //const item = this.document.items.get(itemId);
        let item = await Func.ObtenerItem(this.actor,itemId);
        await Func.infinitoItem(item);
        // en caso que estemos en un vehículodonde los items son prestados
        if(this.actor.type=="vehiculo") this.render();

    }
    static async _onRecargarItem(event,target)
    {
        const itemId = event.target.dataset.id;
        //const item = this.document.items.get(itemId);
        let item = await Func.ObtenerItem(this.actor,itemId);
        await Func.recargarItem(item);
        // en caso que estemos en un vehículodonde los items son prestados
        if(this.actor.type=="vehiculo") this.render();
    }
    static async _onGastarItem(event,target)
    {
        const itemId = event.target.dataset.id;
        //const item = this.document.items.get(itemId);
        let item = await Func.ObtenerItem(this.actor,itemId);
        await Func.usarItem(item);
        // en caso que estemos en un vehículodonde los items son prestados
        if(this.actor.type=="vehiculo") this.render();
    }
  

    // Quita una Mejora (upgrade) del actor: revierte sus efectos (bonos, imágenes,
  // designación, items inyectados) y borra el item. Toda la lógica vive en el
  // servicio AISLADO (module/upgrade/ad6_servicioUpgrade.mjs); aquí sólo se
  // resuelve el item y se delega. Compartido por vehículo, principal y teniente.
  static async _onBorrarUpgrade(event, target) {
    const itemId = target.dataset.id;
    const upgrade = this.actor.items.get(itemId);
    if (!upgrade || upgrade.type !== "upgrade") return;
    await ServicioUpgrade.quitarUpgrade(this.actor, upgrade);
    this.render();
  }

  // Gestiona el DROP de un item de tipo "upgrade" sobre la hoja: crea una copia
  // del upgrade en el actor y lo EQUIPA automáticamente (aplica bonos, imágenes,
  // designación e inyecta sus listas, según el tipo de actor). Devuelve true si
  // el drop era un upgrade (y por tanto YA está gestionado), o false si NO lo
  // era (para que el llamante siga con el resto de su _onDrop). Se centraliza
  // aquí para compartirlo entre vehículo, principal y teniente.
  async _gestionarDropUpgrade(event) {
    let data;
    try {
      data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    } catch (err) {
      return false;
    }
    if ((data.type !== "Item") || (!data.uuid)) return false;

    const itemDropeado = await fromUuid(data.uuid);
    if (!itemDropeado || itemDropeado.type !== "upgrade") return false;

    // Creamos la copia del upgrade en el actor (independiente del original).
    const copia = foundry.utils.deepClone(itemDropeado.toObject());
    copia._id = foundry.utils.randomID();
    const [creado] = await this.actor.createEmbeddedDocuments("Item", [copia]);
    if (creado) await ServicioUpgrade.equiparUpgrade(this.actor, creado);
    this.render();
    return true;
  }

  /** 
   * Prepare data for rendering within your Handlebars templates.
   * @override 
   */
  async _prepareContext(options) {
    // DocumentSheetV2 provides this.document (the Actor instance)
    const actor = this.document; 
    
    // Provide a safe deep clone of the source data to avoid mutating active state
    const context = {
       actor: actor
      ,source: actor.toObject(false) // Safe data copy
      ,system: actor.system
      ,flags: actor.flags
      ,items: actor.items.contents
      ,effects: actor.effects.contents
      ,isEditable: this.isEditable
      // para tener acceso a las listas de cosas de config.mjs
      ,config: Ad6
      // accesos a las listas de itemes clasificadas
      ,talentos: this.actor.items.filter(function(item){return item.type=="talento"})
      ,armaduras: this.actor.items.filter(function(item){return item.type=="armadura"})
      ,equipos: this.actor.items.filter(function(item){return item.type=="equipo"})
      ,suitEquipos: this.actor.items.filter(function(item){return item.type=="suitEquipo"})
      ,habilidades: this.actor.items.filter(function(item){return item.type=="habilidad"})
      ,elementos: this.actor.items.filter(function(item){return item.type=="elemento"})
      ,competencias: this.actor.items.filter(function(item){return item.type=="competencia"})
      ,velocidades: this.actor.items.filter(function(item){return item.type=="perfilVelocidad"})
      ,localizaciones: this.actor.items.filter(function(item){return item.type=="localizacion"})
      ,competenciasPiloto: null
      // No confundir con el system.hardwares que es el array de un equipo donde se guardan
      // los booleanos del estado de un hardware. Hoy en nombres de mierda...
      ,hardwares: this.actor.items.filter(function(item){return item.type=="hardware"})
      // Indican si hay al menos un item de esa lista que sea un banco de armas.
      // Sirven para que los encabezados de tabEquipo muestren la columna "Bancos".
            ,equiposHayBancos: this.actor.items.some(i => i.type === "equipo" && i.system.esBanco)
      ,suitEquiposHayBancos: this.actor.items.some(i => i.type === "suitEquipo" && i.system.esBanco)
            // ¿El select de subfase debe mostrarse bloqueado (solo etiqueta)?
      // Ver _bloquearSelectFase(). En ese caso la subfase se elige con los
      // botones hexagonales, no con el select.
      ,bloquearFase: this._bloquearSelectFase()

      // Datos para pintar, de forma genérica, los botones de TIRADAS FIJADAS
      // (un dadito por slot: dice-one/dice-two/dice-three). Cada elemento tiene:
      //   n       -> sufijo del slot ("1"/"2"/"3"), usado en data-tirada e ids.
      //   icono   -> clase Font Awesome del dado.
      //   tirada  -> el objeto system.tiradaN (fase, exitos, arma, sinergia...).
      // El partial parcialTiradaBoton itera esta lista, así no se repite HTML
      // por cada tirada y añadir una nueva es tocar SOLO la lista canónica.
            ,tiradasFijadas: Ad6_HojaActor._tiradasFijadasParaPlantilla(actor)

    };

    // Mejoras (upgrades) del actor, para el menú emergente de Vitales. Aplica a
    // vehiculo, principal y teniente.
    context.upgrades = ServicioUpgrade.upgradesDelActor(actor);

    context.tabs = this._prepareTabs("primary");

    // Configure tab navigation states
    //context.tabs = this._getTabs();

    return context;
  }
  

    async _onRender(context, options)
  {
    await super._onRender(context, options);
        // Anotamos esta hoja como "la última enfocada por este usuario". Sirve
        // para que la ventana de Asistencia (y futuras apps) sepan qué actor
        // recibe los éxitos, sobre todo en el caso del GM con muchas fichas.
        ServicioAsistencia.anotarHojaEnfocada(this.actor);
        // Estos dos métodos registran el evento de cambio en los texboxes y en los checkboxes
        // para su tratamiento al cambiar, y poderlos guardar en la hoja de personaje
        // el check tiene que tener la clase chk-change y el textbox, change no más.
        this.element.querySelectorAll(".change").forEach(el => {
          el.addEventListener("change", this._onTextChange.bind(this));
        });
                this.element.querySelectorAll(".chk-change").forEach(checkbox => {
                    checkbox.addEventListener("change", this._onCheckChange.bind(this));
                });

                // Cierre de los menús contextuales "..." de las filas de las pestañas.
                // Un único listener delegado en el elemento de la hoja:
                //  - Si se pulsa un botón de acción dentro de un .menu-panel -> se cierra ese menú.
                //  - Si se pulsa fuera de cualquier .menu-context -> se cierran todos.
                if (!this._menuClickBound) {
                  this._menuClickBound = this._onMenuDocumentClick.bind(this);
                }
                this.element.removeEventListener("click", this._menuClickBound);
                this.element.addEventListener("click", this._menuClickBound);

                // Preservar el estado abierto de los menús ante re-renders de la hoja.
                // Sin esto, al pulsar un checkbox de configuración dentro de un panel
                // (que dispara document.update() -> re-render) el .menu-toggle se
                // reconstruye desmarcado y el panel emergente se cierra.
                this.element.querySelectorAll(".menu-toggle").forEach(toggle => {
                  // Restaurar el estado tras un re-render
                  toggle.checked = this._openMenuIds.has(toggle.id);
                  // Registrar las aperturas/cierres
                  toggle.addEventListener("change", (ev) => {
                    if (ev.target.checked) this._openMenuIds.add(ev.target.id);
                    else this._openMenuIds.delete(ev.target.id);
                  });
                });

                // código simplificado para evitar el flic, manejo de los tabs
        /*-------------------------------------------*/
        // EL BUG: `this.element` se reemplaza en cada re-render (render()), por lo que
        // un listener adjuntado "una sola vez" (con _tabsListenerAttached) queda huérfano
        // en un nodo viejo fuera del DOM y se pierde el cambio de pestañas (sobre todo
        // con varias hojas abiertas a la vez).
        // Por eso lo re-adherimos en CADA _onRender, removiendo antes el anterior para
        // evitar duplicados si el elemento no llegara a reemplazarse.
        this.element.removeEventListener("click", this._tabsClickHandler);
        this._tabsClickHandler = (event) => {
            const button = event.target.closest("[data-group][data-tab][role='tab']");
            if (button) {
                event.preventDefault();
                this._activeTab = button.dataset.tab;
                this.seleccionarTab(button.dataset.group, this._activeTab);
            }
        };
        this.element.addEventListener("click", this._tabsClickHandler);

        
      } 

  // desde el padre se dedfinen los listener generales.  


  /**
   * Cierra los menús contextuales "..." de las filas de las pestañas.
   * Lógica:
   *  - Clic en un botón de acción dentro de un .menu-panel => ejecuta la acción
   *    (la gestiona Foundry por data-action) y se cierra ese menú.
   *  - Clic fuera de cualquier .menu-context => se cierran todos los menús.
   */
  _onMenuDocumentClick(event)
  {
    const contextEl = event.target.closest ? event.target.closest(".menu-context") : null;

                if (contextEl) {
      // Click dentro de un menú concreto
      if (event.target.closest(".menu-panel")) {
        // No cerramos si el clic fue en un campo editable (input, textarea,
        // select, checkbox): el usuario debe poder hacer clic y escribir sin
        // que el menú se oculte. Sí cerramos cuando se pulsa un botón/acción.
        const editable = event.target.closest("input, textarea, select, checkbox");
        if (!editable) {
          const toggle = contextEl.querySelector(".menu-toggle");
          if (toggle) {
            toggle.checked = false;           // cerrar tras elegir una opción/acción
            this._openMenuIds.delete(toggle.id);
          }
        }
      }
      // Si el click fue en el label ".menu-pin", no hacemos nada: el checkbox
      // alterna por sí solo (HTML/CSS) y el menú se abre/cierra.
    } else {
      // Click fuera de cualquier menú -> cerrar todos (y olvidar su estado)
      this._openMenuIds.clear();
      this.element.querySelectorAll(".menu-toggle").forEach(t => t.checked = false);
    }
  }

   // La idea es que en la hoja concreta de cada actor se registren los campos con change y chk-change
   // y si se necesita lógica adicional, se sobreescriban los _onTextChange y _onCheckChange
    async _onTextChange(event)
  {
    const itemId = event.target.dataset.id;
    let campo = "";
    if (event.target.dataset.campo == "name") {
      campo = event.target.dataset.campo;
    } else {
      campo = "system." + event.target.dataset.campo;
    }
    const valor = event.target.value;

    // ¿Este input debe sincronizar el MÁXIMO si la protección NO es ablativa?
    // Lo usa la fila de armaduras de tabEquipo (parcialMaxValor con dataSyncMax):
    // al teclear el "restante" de una armadura NO ablativa, el máximo toma el
    // mismo valor. Si la armadura SÍ es ablativa, el máximo NO se toca. Se lee
    // aquí (antes del update, que re-renderiza) para no perder el dataset.
    const syncMax = event.target.dataset.syncMax === "true";
    //const item = this.document.items.get(itemId);
    let item = await Func.ObtenerItem(this.actor, itemId);

    // --- Conservación del foco al usar TAB ---------------------------------
    // Cuando pulsas TAB, el navegador mueve el foco al siguiente campo y el
    // campo que se abandona dispara el evento `change`. Ese `change` provoca el
    // `item.update()` de abajo, que re-renderiza la hoja y reconstruye el DOM,
    // por lo que el campo que habia ganado el foco con el TAB queda "perdido".
    // Para evitarlo, capturamos ese siguiente campo (document.activeElement)
    // ANTES del update y, una vez re-renderizado, le devolvemos el foco.
    let focoRestaurar = null;
    const activo = document.activeElement;
    if (activo && this.element.contains(activo) && activo !== event.target) {
      focoRestaurar = {
        id: activo.dataset?.id,
        campo: activo.dataset?.campo
      };
    }

    // Sincronización del máximo (solo desde la línea de armadura de tabEquipo):
    //   - Armadura NO ablativa -> el máximo toma el mismo valor que el restante.
    //   - Armadura ablativa    -> el máximo NO se toca.
    // Se hace en UN ÚNICO update (restante + valor) para no re-renderizar dos
    // veces ni perder el foco.
    if (syncMax && item && item.system?.armadura?.ablativa !== true) {
      await item.update({ [campo]: valor, "system.armadura.valor": valor });
    } else {
      await item.update({ [campo]: valor });
    }

    // Devolver el foco al campo que habia tomado con TAB
    if (focoRestaurar && focoRestaurar.id && focoRestaurar.campo) {
      const selector = `[data-id="${focoRestaurar.id}"][data-campo="${focoRestaurar.campo}"]`;
      const el = this.element.querySelector(selector);
      if (el) el.focus();
    }
  }

  async _onCheckChange(event)
  {
    
    // PRIMERO GUARDO EL CHECK EN LA HOJA DE PERSONAJE, ESTÉ DONDE ESTÉ EL CHECK
    // si es un check normal no necesito hacerlo pero si es un check con el class change sí
    const itemId = event.target.dataset.id;
    let campo ="";
    if(event.target.dataset.campo=="name")
    {
      campo = event.target.dataset.campo;
    }
    else{
      campo = "system." + event.target.dataset.campo;
    }
    const valor = event.target.checked;
    
    let item = await Func.ObtenerItem(this.actor,itemId);
    //let  item = this.actor.items.get(itemId); /// esto es lo original
    //const item = this.getItemOnItemId(itemId);
    /*
    if (item===null)
      item = await fromUuid("Item."+itemId);

*/
/*
    if ((item===undefined)||(item===null))
    {
        let padre = this.actor.system.nombrePiloto;
        let uuid = "Actor." + padre+ ".Item."+itemId;        
        item = await foundry.utils.fromUuid(uuid);
    }

*/
    
await item.update({[campo]: valor});

    
    // tengo que ver, porque puede ser que estén marcando otra cosa con el check,
    // como por ejemplo, la armadyra equipada
    
    // hice click en equipar / desequipar armadura / usar arma o elemento de equipo
    // filtro porque sólo quiero modificar los dados en caso que esté usando una suit de equipo
    
    if((event.target.dataset.campo =="equipada") ||
       (event.target.dataset.campo =="armadura.ablativa") ||
       ((event.target.dataset.campo =="siendoUsado")&&(event.target.dataset.suit!="suit"))
      ) {  return; }
    //const itemId = event.target.dataset.id;
    //const item = this.document.items.get(itemId);
    // ojo que puede ser un suit de equipo
    // esto se sabe porque event.target.dataset.suitEquipo == suitEquipo
    // "mejora": le pongo al campo del suit de equipo valor para que tenga el mismo nombre que la habilidad
    // y el getter como no hace class check... pues traiga lo mismo, soy un genio ratero ¡como queso!

    if(event.target.checked) // se toma el valor del interfase
    {
        this.agregarUpdates("system.dados",this.actor.system.dados + item.system.valor );
    }
    else
    {

      let valor=0;
      if(this.actor.system.dados - item.system.valor) { valor = this.actor.system.dados - item.system.valor; }
      this.agregarUpdates("system.dados",valor );
    }
    this.actualizar();


  }


    /* estructura para gestionar la actualización que se va a hacer en los hijos
     y reusar el código */
  updates = {};    // diccionario de actualizaciones

  // Conjunto de ids de menús (.menu-toggle) que están abiertos. Sirve para que
  // un re-render de la hoja (p. ej. al pulsar un checkbox de configuración que
  // llama a document.update()) NO cierre el panel emergente que estaba abierto.
  _openMenuIds = new Set();
  
  async actualizar()    // actualiza la hoja con los pares campo/valor de updates
  {
      if (Object.keys(this.updates).length > 0) {
        await this.document.update(this.updates);
      }
      // nota hay que poner this porque si no dice que está no definido
      this.updates = {};
  }

  async agregarUpdates(clave,valor)  // encapsula el añadido de pares campo/valor a actualizar
  {
    // nota hay que poner this porque si no dice que está no definido
    this.updates[clave] = valor;
  }

  /* Función general para escribir en el chat en una línea actualizaciones simples */

  async msgSimple(cadena, datos){
    const actor = this.actor;
    const texto = game.i18n.format(cadena,{actor: actor, ...datos });
/*    const contenido = await foundry.applications.handlebars.renderTemplate(
        "systems/ad6_robotech/templates/chat/msgSimple.hbs",{texto}
      );
*/ // No necesito esto para mensajes simples. Sólo con el texto HTML es suficiente.
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor })
        ,content: texto
        ,sound: "sounds/dice.wav"
      });
  }

  async _onEditPortrait(event) {
        event.preventDefault();
        const fp = new foundry.applications.apps.FilePicker({
            type: "image",
            callback: (imagePath) => {
                this.document.update({ img: imagePath });
            }
        });
        fp.browse();
    }



  static async _onTirarDados(event,target)
  {
    // core de realizar las tiradas


    
    const dadosEquipo = Func.contarDadosEquipo(this.actor);

    const puedeUsarEquipo = Func.puedeUsarEquipo(this.actor);

    const formula = this.actor.system.formulaTirada(dadosEquipo,puedeUsarEquipo);


    if(formula=="{}")    return;
    let tirada = new Roll(formula);
    await tirada.evaluate();
    let exitos = 0;

    for(let i=0; i < tirada.dice.length; i++)
    {
      exitos += this.actor.system.exitosDado(tirada.dice[i].total);
    }

        await Func.consumirEquipoUsado(this.actor);

        let er = "";
    if(!puedeUsarEquipo){ er = game.i18n.localize("Ad6.Mensajes.sinUsos"); }

        // Sinergia: se calcula AHORA (al lanzar) y se congela en el chat.
        // Solo un principal (o vehículo con piloto principal) con 2+ habilidades.
        const sinergia = Ad6_HojaActor._calcularSinergia(this.actor);

        let datosChat ={
       tipo: game.i18n.localize("Ad6.TipoTirada." + this.actor.system.tirada)
      ,fase: game.i18n.localize("Ad6.FaseAccion." + this.actor.system.fase)
      ,error: er
      ,dados: tirada.dice
      ,exitos: exitos
      ,sinergia: sinergia
    };

        await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor })
      ,content: await foundry.applications.handlebars.renderTemplate("systems/ad6_robotech/templates/chat/msgTirada.hbs",datosChat)
      ,sound: "sounds/dice.wav"
            // Adjuntamos los datos mínimos de la tirada en un flag propio para poder
      // releerlos después y "fijarlos" en un slot de tirada (tirada1/2/3) sin
      // mirar el HTML.
      // Guardamos también "tipo" y "dados" para poder re-renderizar el mensaje
      // cuando se le sumen éxitos de asistencia.
      ,flags: {
        "ad6-robotech": {
          "tirada": {
            actorUuid: this.actor.uuid
            ,actorId: this.actor.id
            ,fase: this.actor.system.fase
            ,tipo: this.actor.system.tirada
                        ,exitos: exitos
            ,dados: tirada.dice.map(d => ({ total: d.total, results: d.results }))
            ,asistenciaRecibida: 0
            ,fijado: false
            ,sinergia: sinergia
            // Interno: si esta tirada se apoyó en un suitEquipo (dadosEquipo > 0),
            // se congela aquí para poder copiarlo al fijar la tirada en tirada1/2/3.
            ,usoEquipo: dadosEquipo > 0
          }
        }
      }
        });

    // OJO: el Pool de Asistencia NO se genera aquí (al tirar), sino al FIJAR la
    // tirada (ver _onGuardarTirada). Así el pool sólo existe para tiradas que
    // ya han sido asignadas a un slot de la ronda.

    }

  static async _onBorrarTirada(event,target)
  {
    const actor = this.actor;
    Func.borrarTirada(actor);
    /*this.agregarUpdates("system.dados",0);
    this.agregarUpdates("system.dadosEquipo",0);
    this.agregarUpdates("system.modificador",0);
    this.agregarUpdates("system.fase","ninguna");
    this.agregarUpdates("system.tirada","normal");
    this.actualizar();
    // desmarcar todas las habilidades puestas
    const habilidades = this.actor.items.filter(function(item){return item.type=="habilidad"});
    for(let i = 0; i < habilidades.length; i++)
    {
      habilidades[i].system.marcado=false;
      await habilidades[i].update({["system.marcado"]: false}); // hay que poner system.marcado para actualizar el
                                                                // modelo de datos      
    }
    // desmarcar todos los suites de equipo puestos

    
    const suit = this.actor.items.filter(function(item){return item.type=="suitEquipo"});
    
    for(let i = 0; i < suit.length; i++)
    {
            suit[i].system.siendoUsado=false;
      await suit[i].update({["system.siendoUsado"]: false}); // hay que poner system.marcado para actualizar el
                                                                // modelo de datos      
    } */   
  } 

    // -------------------------------------------------------------------------
  // Gestión de las tiradas "fijadas" de la ronda (tirada1 / tirada2 / tirada3)
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // SINERGIA
  // -------------------------------------------------------------------------
  // La sinergia la generan SOLO los actores principales (o un vehículo
  // tripulado por un principal) y cuando intervienen DOS o más habilidades.
  // Nunca cuentan armas, armaduras, suits de equipo ni ningún otro item: solo
  // items de tipo "habilidad" con system.marcado === true.
  //
  // Resolución del actor "efectivo" cuyas habilidades cuentan:
  //   - actor "principal"            -> él mismo.
  //   - actor "vehiculo" con piloto  -> el piloto, SOLO si es "principal".
  //   - cualquier otro caso          -> null (no procede sinergia).
  // Es estático para poder usarlo tanto desde instancia (this) como desde los
  // handlers static de las actions.
  static _actorParaSinergia(actor)
  {
    if (!actor) return null;
    if (actor.type === "principal") return actor;

    if (actor.type === "vehiculo")
    {
      const idPiloto = actor.system?.nombrePiloto;
      if (idPiloto && idPiloto !== "undefined")
      {
        const piloto = game.actors.get(idPiloto);
        if (piloto && piloto.type === "principal") return piloto;
      }
    }
    return null;
  }

  // Cuenta las habilidades marcadas del actor "efectivo" para la sinergia.
  static _contarHabilidadesSinergia(actor)
  {
    const efectivo = Ad6_HojaActor._actorParaSinergia(actor);
    if (!efectivo) return 0;
    return efectivo.items.filter(i => i.type === "habilidad" && i.system.marcado === true).length;
  }

  // ¿La tirada tiene sinergia? true si el actor efectivo es un principal y hay
  // más de una habilidad marcada. En cualquier otro caso, false.
  static _calcularSinergia(actor)
  {
    return Ad6_HojaActor._contarHabilidadesSinergia(actor) > 1;
  }

    // -------------------------------------------------------------------------
  // SUPERFASE
  // -------------------------------------------------------------------------
  // Agrupa una subfase de accion (system.fase del actor) en su "superfase".
  //   soporteAsistir / soporteOcultar / soporteObservar -> "soporte"
  //   operacionesAtacar / operacionesDefender / operacionesRedirigir -> "operaciones"
  //   cinematicaInteractuar / cinematicaInhibir -> "cinematica"
  //   "ninguna" o vacio -> "ninguna"
  // Es estatico para poder invocarlo desde los handlers static de las actions.
    static _superFaseDe(subfase)
  {
    const s = subfase ?? "";
    if (s.startsWith("soporte"))     return "soporte";
    if (s.startsWith("operaciones")) return "operaciones";
    if (s.startsWith("cinematica"))  return "cinematica";
    return "ninguna";
  }

  // -------------------------------------------------------------------------
  // DATOS PARA LA PLANTILLA DE TIRADAS FIJADAS
  // -------------------------------------------------------------------------
  // Construye la lista que consume el partial "parcialTiradaBoton": un elemento
  // por slot de tirada (tirada1/tirada2/tirada3). Cada elemento lleva el sufijo
  // (n), el icono del dado (dice-one/dice-two/dice-three) y el objeto tirada ya
  // resuelto, para que la plantilla NO tenga que ir montando "system.tiradaN".
  // El orden de los iconos va alineado con NSLOTS_TIRADA.
  static _tiradasFijadasParaPlantilla(actor)
  {
    const ICONOS_DADO = { "1": "fa-dice-one", "2": "fa-dice-two", "3": "fa-dice-three" };
    return NSLOTS_TIRADA.map(n => ({
       n
      ,icono: ICONOS_DADO[n] ?? "fa-dice"
      ,tirada: actor.system?.[`tirada${n}`]
    }));
  }

    // ¿Un arma "cuenta" para el ataque? Regla:
  //   - equipo (arma normal): siempre cuenta.
  //   - suitEquipo: solo si tiene daño (no vacío/nulo).
  // Se usa tanto para las armas EN USO (item del actor) como para las armas
  // ya REGISTRADAS en una tirada fijada (system.tiradaN.arma).
  // Es estático para poder invocarlo desde los handlers static de las actions.
  static _armaCuentaParaAtaque(clase, dano)
  {
    if (clase === "equipo") return true;
    if (clase === "suitEquipo") return ((dano ?? "") !== "");
    return false;
  }

    // ¿El select de subfase (system.fase) debe estar BLOQUEADO (solo etiqueta)?
  // La subfase, en esos casos, NO se elige con el select sino con las
  // habilidades hexagonales. Casos:
  //   1) actor TENIENTE.
  //   2) actor VEHÍCULO cuyo piloto sea un TENIENTE.
  //   3) actor VEHÍCULO SIN piloto cuya estructura es NAVAL (escalaPrincipal === "N").
  // En el resto de casos el select es normal (editable).
  _bloquearSelectFase()
  {
    const actor = this.actor;
    if (!actor) return false;

    // (1) Teniente.
    if (actor.type === "teniente") return true;

    // (2)/(3) Vehículo.
    if (actor.type === "vehiculo")
    {
      const idPiloto = actor.system?.nombrePiloto;
      const hayPiloto = !!idPiloto && idPiloto !== "undefined";
      if (hayPiloto)
      {
        const piloto = game.actors?.get(idPiloto);
        return piloto?.type === "teniente";          // (2)
      }
      return actor.system?.escalaPrincipal === "N";  // (3)
    }

    return false;
  }

    // Devuelve un objeto {clase, item} con el arma en uso, con preferencia del
  // equipo (arma) sobre la suit de equipo, entre los que tienen siendoUsado.
  //
  // Además de los items del propio actor, si el actor es un PRINCIPAL con
  // vehículo instalado (system.nombreVehiculo), también se consideran los
  // equipos/suities del VEHÍCULO (el personaje actúa como tripulante y puede
  // fijar el ataque con un arma del vehículo). Se devuelve el ITEM REAL del
  // vehículo, para que al fijar la tirada se copie su identidad correctamente.
  _armaEnUso()
  {
    // Candidatos: items del propio actor + (si procede) los del vehículo.
    const candidatos = [...this.actor.items];

    if (this.actor.type === "principal")
    {
      const idVehiculo = this.actor.system?.nombreVehiculo;
      if (idVehiculo && idVehiculo !== "undefined")
      {
        const vehiculo = game.actors?.get(idVehiculo);
        if (vehiculo) candidatos.push(...vehiculo.items);
      }
    }

    const armas = candidatos.filter(i => i.type === "equipo" && i.system.siendoUsado);
    if (armas.length > 0) return { clase: "equipo", item: armas[0] };

    const suits = candidatos.filter(i => i.type === "suitEquipo" && i.system.siendoUsado);
    if (suits.length > 0) return { clase: "suitEquipo", item: suits[0] };

    return null;
  }

  // Busca la tirada más reciente del chat publicada por ESTA ficha (se marca con
  // el flag "ad6-robotech.tirada" al crearse en _onTirarDados).
  _leerUltimaTiradaChat()
  {
    if (!game.messages) return null;
    const candidatos = game.messages.contents.filter(m =>
      m.flags?.["ad6-robotech"]?.tirada &&
      (m.flags["ad6-robotech"].tirada.actorId === this.actor.id ||
       m.flags["ad6-robotech"].tirada.actorUuid === this.actor.uuid)
    );
                if (candidatos.length === 0) return null;
    candidatos.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    const flag = candidatos[0].flags["ad6-robotech"].tirada;
    return { fase: flag.fase, exitos: flag.exitos, sinergia: flag.sinergia === true, usoEquipo: flag.usoEquipo === true, asistenciaRecibida: Number(flag.asistenciaRecibida ?? 0), mensaje: candidatos[0] };
  }

  // Limpia las tiradas fijadas (botón "rotate" / inicio de combate).
  // Lo dejamos como método de instancia en la base para poder invocarlo también
  // desde la iniciativa u otros puntos del sistema.
        async limpiarTiradasGuardadas()
  {
    // Delegamos en la función pura del módulo (misma operación de datos), para
    // que la hoja y el tracker / el reset por asalto compartan UNA sola fuente.
    await Func.limpiarTiradasGuardadas(this.actor);
    this.render();
  }

  // Botón "guardar" (floppy) dentro de cada popup: toma los datos de la última
  // tirada del chat de la ficha y el arma/suit en uso, y los fija en tirada{N}.
    static async _onGuardarTirada(event,target)
  {
    const n = target.dataset.tirada;          // "1" | "2" | "3"
    if (!NSLOTS_TIRADA.includes(n)) return;

    const ultima = this._leerUltimaTiradaChat();
    if (!ultima) {
      ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.sinTiradaChat"));
      return;
    }

                // Clonamos los datos completos del arma elegida (con prelación arma/suit).
    const armaEnUso = this._armaEnUso();
        let guardada = {
            fase: ultima.fase ?? ""                          // SUBFASE concreta
      ,superFase: Ad6_HojaActor._superFaseDe(ultima.fase) // su SUPERFASE ("soporte"/"operaciones"/"cinematica"/"ninguna")
      // SUPERFASE ORIGINAL: al fijar, coincide con la de arriba. La usa el
      // tracker como ICONO: al ACELERAR, "superFase" cambia (mueve de zona y
      // color) pero "superFaseOriginal" se conserva para que el icono NO cambie.
      ,superFaseOriginal: Ad6_HojaActor._superFaseDe(ultima.fase)
      // SUBFASE ORIGINAL: al fijar, coincide con "fase". La usan los botones
      // (atacar/defensa/fuego) y el nombre del arma: al ACELERAR, "fase" cambia
      // (recoloca la fila) pero "faseOriginal" se conserva para que el
      // SIGNIFICADO de la acción (su tipo) NO cambie.
      ,faseOriginal: ultima.fase ?? ""
            ,exitos: ultima.exitos ?? 0
      // Congelada al lanzar la tirada y traída del flag del chat.
      ,sinergia: ultima.sinergia === true
      // Interno: si la tirada se apoyó en un suitEquipo (leído del flag del chat).
      ,usoEquipo: ultima.usoEquipo === true
      ,arma: { clase: "", nombre: "", datos: {} }
    };
        if (armaEnUso) {
      const copia = foundry.utils.deepClone(armaEnUso.item.toObject());
      // Es una copia con identidad propia (NO es el item original de la hoja)
      copia._id = foundry.utils.randomID();
      guardada.arma.clase = armaEnUso.clase;
      guardada.arma.nombre = armaEnUso.item.name;
      guardada.arma.datos = copia;
    }

    console.log(guardada)
    // -----------------------------------------------------------------------
    // VALIDACIÓN: fijar una tirada DE ATAQUE requiere un arma válida.
    // "Es de ataque" = misma condición que el helper botonAtaque de la hoja:
    //   fase === "operacionesAtacar"  O  "operacionesRedirigir"
    //   O  (superFase === "operaciones" && sinergia).
    // Debe cumplirse (a) o (b) o (c):
    //   (a) hay un EQUIPO seleccionado (siendoUsado) en el actor.
    //   (b) hay un SUIT DE EQUIPO seleccionado (siendoUsado) CON daño (no vacío).
    //   (c) NO hay (a) ni (b), pero la OTRA tirada ya tiene registrada un arma
    //       válida (equipo, o suitEquipo con daño en sus datos).
    // Si no se cumple nada, se avisa y NO se fija la tirada.
    // -----------------------------------------------------------------------
    const esAtaque = (guardada.fase === "operacionesAtacar")
                  || (guardada.fase === "operacionesRedirigir")
                  || (guardada.superFase === "operaciones" && guardada.sinergia === true);

    if (esAtaque)
    {
            // Candidatos: los items del actor y, si es un principal con vehículo
      // instalado, también los del vehículo (el arma puede venir de ahí).
      const candidatosValidacion = [...this.actor.items];
      if (this.actor.type === "principal") {
        const idv = this.actor.system?.nombreVehiculo;
        if (idv && idv !== "undefined") {
          const veh = game.actors?.get(idv);
          if (veh) candidatosValidacion.push(...veh.items);
        }
      }

      // (a) Equipo en uso.
      const tieneA = candidatosValidacion.some(
        i => i.type === "equipo" && i.system.siendoUsado === true);

      // (b) Suit de equipo en uso CON daño.
      const tieneB = candidatosValidacion.some(
        i => i.type === "suitEquipo"
          && i.system.siendoUsado === true
          && Ad6_HojaActor._armaCuentaParaAtaque("suitEquipo", i.system?.dano));

            // (c) alguna OTRA tirada ya tiene un arma registrada y válida. Se lee
      //     directamente de system.tiradaN.arma (armaOtra), sin tocar el actor.
      //     Con la lista canónica de slots, "otra" = cualquier slot distinto del
      //     que se está guardando.
      const otraRegistrada = Func.SLOTS_TIRADA
        .filter(clave => clave !== `tirada${n}`)
        .some(clave => {
          const armaOtra = this.actor.system?.[clave]?.arma;
          return !!armaOtra
            && Ad6_HojaActor._armaCuentaParaAtaque(armaOtra.clase, armaOtra?.datos?.system?.dano);
        });

      // (a) o (b) o (c). (c) solo aplica si NO hay arma en uso seleccionada.
      const ok = tieneA || tieneB || ((!tieneA && !tieneB) && otraRegistrada);

      if (!ok)
      {
        ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.fijarAtaqueSinArma"));
        return;
      }
    }

        this.agregarUpdates(`system.tirada${n}`, guardada);
        await this.actualizar();

                // Marcamos el mensaje de chat como "fijado": una tirada fijada ya no admite
        // que se le sumen más éxitos de asistencia (regla de diseño).
            await ServicioAsistencia.marcarTiradaFijada(this.actor);

        // Pool de Asistencia: SOLO se genera al FIJAR una tirada de la fase
        // "Asistir" (no al lanzarla). Los éxitos que aportan son los ORIGINALES
        // de la tirada (los del dado), no los que hubiera podido recibir por
        // asistencia de otros. (originales = exitos - asistenciaRecibida)
        if (guardada.fase === "soporteAsistir")
        {
          const originales = Number(guardada.exitos ?? 0) - Number(ultima.asistenciaRecibida ?? 0);
          if (originales > 0)
          {
            await ServicioAsistencia.registrarAsistencia(this.actor, originales);
          }
        }

                    // Tras fijar, puede que haya que "agrupar" la tirada recién guardada con
        // otra de la misma superfase.
        await this._agruparTiradasSiProcede(n);
        // Refresco EN TIEMPO REAL de la defensa: si este actor está en algún
        // encuentro de combate como defensor y acaba de fijar (tarde) una tirada de
        // defensa, recalculamos su "disponible" en TODOS esos encuentros y los
        // difundimos para que las ventanas se actualicen al instante.
        await ServicioCombate.refrescarDefensaDeActor(this.actor);
        // Re-render para ver el resumen guardado dentro del popup abierto.
        this.render();
  }

    // -------------------------------------------------------------------------
  // SINERGIA POR AGRUPACIÓN
  // -------------------------------------------------------------------------
      // -----------------------------------------------------------------------
    // Cuando el actor tiene VARIAS tiradas guardadas en la MISMA SUPERFASE
    // (ninguna / soporte / operaciones / cinematica) se "agrupan" de dos en dos:
    // una tirada absorbe los exitos de la otra, queda marcada con sinergia y la
    // otra se
  // vacia. Asi CUALQUIER actor (no solo los principales con 2+ habilidades)
  // puede generar sinergia. Reglas:
  //   - Se consideran "guardadas" las tiradas cuyo campo exitos tiene valor
  //     numerico (aunque sea 0): se puede guardar por error sin fase.
  //   - Solo si comparten superFase. Con varios slots (tirada1/tirada2/tirada3),
  //     se agrupa el slot recién guardado CON UN compañero guardado de su misma
  //     superfase (un solo par por guardado).
  //   - Destino (donde se acumula), por orden:
  //       1) la que tenga usoEquipo === true (si solo una lo tiene);
  //       2) la que tenga arma con algun valor (clase, nombre o datos);
  //       3) en ultimo caso, la que gatillo la validacion (n).
  //   - Si CUALQUIERA de las dos ya tiene sinergia === true, no se agrupa y
  //     se avisa (evita dobles agrupaciones / "re-sinergias").
  //   - n ("1" | "2" | "3") es el slot que se acaba de guardar y que gatilla la validacion.
    async _agruparTiradasSiProcede(n)
  {
    const s = this.actor.system;

    // "Guardada" = exitos tiene valor numerico (aunque sea 0). Recolectamos los
    // slots guardados usando la lista canónica (tirada1/tirada2/tirada3).
    const esNumerico = v => typeof v === "number" && !Number.isNaN(v);
    const guardados = [];   // [{ clave, valor }]
    for (const clave of Func.SLOTS_TIRADA)
    {
      const t = s?.[clave];
      if (esNumerico(t?.exitos)) guardados.push({ clave, valor: t });
    }

    // El slot que gatilla la agrupación (el que se acaba de guardar).
    const claveN = `tirada${n}`;
    const gatillo = guardados.find(g => g.clave === claveN);
    if (!gatillo) return;

    // Buscamos UN compañero de agrupación: otro slot guardado en la MISMA
    // superfase que el recién guardado, y ninguno con sinergia ya marcada.
    // (Misma regla que antes: sólo se agrupa contra otro slot guardado.)
    const companero = guardados.find(g =>
       g.clave !== claveN
      && g.valor.superFase === gatillo.valor.superFase
      && g.valor.sinergia !== true
      && gatillo.valor.sinergia !== true
    );

    // Si no hay compañero en la misma superfase, no hay nada que agrupar.
    if (!companero) return;

        const tA = gatillo.valor;          // una de las dos tiradas (la recién guardada)
    const tB = companero.valor;        // la otra (un compañero de superfase)

    // Decidir destino/origen (regla de desempate, en orden). El destino (donde
    // se acumulan los éxitos) se elige igual que antes, comparando las DOS
    // tiradas candidatas. "Sin desempate" -> gana la que gatilló la validación.
    let destino, origen;
    if ((Func.tieneArma(tB)) && (tA.usoEquipo))
    {
      destino = tB;
      origen  = tA;
    }
    else if ((Func.tieneArma(tA)) && (tB.usoEquipo))
    {
      destino = tA;
      origen  = tB;
    }
    else if (Func.tieneArma(tA) !== Func.tieneArma(tB))
    {
      // Solo una tiene arma -> esa es la destino.
      destino = Func.tieneArma(tA) ? tA : tB;
      origen  = Func.tieneArma(tA) ? tB : tA;
    }
    else if (tA.usoEquipo !== tB.usoEquipo)
    {
      // Solo una tiene usoEquipo -> esa es la destino.
      destino = tA.usoEquipo ? tA : tB;
      origen  = tA.usoEquipo ? tB : tA;
    }
    else
    {
      // Sin desempate -> la que gatillo la validacion.
      destino = tA;
      origen  = tB;
    }

    // Si alguna ya tiene sinergia, no se agrupa: se avisa y se deja todo igual.
    if (destino.sinergia === true || origen.sinergia === true) {
      ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.sinergiaYaAgrupada"));
      return;
    }

    // La destino absorbe a la origen: suma exitos, marca sinergia y conserva
    // sus propios datos (arma, usoEquipo, fase, superFase...).
    const fusionada = foundry.utils.deepClone(destino);
    fusionada.exitos   = Number(destino.exitos ?? 0) + Number(origen.exitos ?? 0);
    fusionada.sinergia = true;

        const vacio = { fase: "", superFase: "ninguna", superFaseOriginal: "", faseOriginal: "", exitos: 0, sinergia: false,
                    usoEquipo: false, arma: { clase: "", nombre: "", datos: {} } };

    // Escribimos SOLO en los dos slots que participan: el del destino (fusionada)
    // y el del origen (vacio). Los demás slots de tirada no se tocan.
    const claveDestino = (destino === tA) ? claveN : companero.clave;
    const claveOrigen  = (origen  === tA) ? claveN : companero.clave;
    this.agregarUpdates(`system.${claveDestino}`, fusionada);
    this.agregarUpdates(`system.${claveOrigen}`, vacio);
    await this.actualizar();
  }

  // Botón "resetear una tirada" dentro de cada popup: vacía solo esa tirada.
        static async _onRestablecerTirada(event,target)
  {
        const n = target.dataset.tirada;
    if (!NSLOTS_TIRADA.includes(n)) return;
        const vacio = { fase: "", superFase: "ninguna", superFaseOriginal: "", faseOriginal: "", exitos: 0, sinergia: false,
                        usoEquipo: false, arma: { clase: "", nombre: "", datos: {} } };
    this.agregarUpdates(`system.tirada${n}`, vacio);
    await this.actualizar();
    this.render();
  }

        // Botón grande "rotate" de la cabecera: limpia TODAS las tiradas fijadas.
  // Con estado consistente con lo que se quería: NO toca la tirada en curso.
  static async _onResetearTiradas(event,target)
  {
    await this.limpiarTiradasGuardadas();
    this.render();
  }

    // Botón "burst" del popup de una tirada elegible: abre el flujo de ATAQUE.
  // La lógica vive en el servicio (reutilizable también desde el combat
  // tracker); aquí solo se resuelve el slot y se delega.
    static async _onAbrirAtaque(event,target)
  {
    const n = target.dataset.tirada;      // "1" | "2" | "3"
    if (!NSLOTS_TIRADA.includes(n)) return;
    await ServicioCombate.invocarAtaque(this.actor, `tirada${n}`);
  }

  // Botón "+" (Fuego concentrado) del popup de una tirada: PRESTA el arma de
  // esta tirada a OTRO atacante que tenga un encuentro en curso.
  // La lógica vive en el servicio (reutilizable también desde el combat tracker).
    static async _onFuegoConcentrado(event, target)
  {
    const n = target.dataset.tirada;      // "1" | "2" | "3"
    if (!NSLOTS_TIRADA.includes(n)) return;
    await ServicioCombate.invocarFuegoConcentrado(this.actor, `tirada${n}`);
  }

  // Botón "shield-heart" (Prestar defensa) del popup de una tirada: PRESTA los
  // éxitos de defensa de esta tirada a un DEFENSOR de un encuentro activo.
  // La lógica vive en el servicio (reutilizable también desde el combat tracker).
    static async _onPrestarDefensa(event, target)
  {
    const n = target.dataset.tirada;      // "1" | "2" | "3"
    if (!NSLOTS_TIRADA.includes(n)) return;
    await ServicioCombate.invocarPrestarDefensa(this.actor, `tirada${n}`);
  }

// que es peor copiar campos a mansalva o subir el click habilidadteniente al actor para que se herede y se use en donde corresponda?

  static async _onClickHabilidadTeniente(event,target)
  {
    //console.log(target.dataset.accion);
    //console.log(target.dataset.valor);
    
    //console.log(this.actor.system.fase);
    // ojo, puede tener dados de equipo ya marcados, no debo sólo sobreescribir
    let dEquipo = Func.contarDadosEquipo(this.actor);
    this.agregarUpdates("system.fase",target.dataset.accion);
    this.agregarUpdates("system.dados", parseInt(target.dataset.valor) + parseInt(dEquipo));
    this.actualizar();
  }

/*
    Funciones de manejo de tabs, para que quede general y sólo haya que sobreescribir el TABS del default options
*/

  seleccionarTab(group,tab)  
  {
      this.element.querySelectorAll(`[data-group="${group}"][data-tab]`).forEach(el => {
      el.classList.toggle("active", el.dataset.tab === tab);
      if (el.getAttribute("role") === "tab") {
          el.setAttribute("aria-selected", el.dataset.tab === tab);
      }
      });

      
  }   

  /**
   * Sobreescribe el prepare tab para evitar el flick que se produce
   * porque no sé por qué mierda se producía pero ahora no (overkill)
   */
  _prepareTabs(group="primary")
  {
    const tabs = super._prepareTabs(group) ?? {};
    // foundry may return an array or an object keyed by tab id
    const entries = Array.isArray(tabs)
      ? tabs
      : Object.values(tabs);
        for (const tab of entries) {
      const active = (tab.id === this._activeTab);
      tab.active = active;
      // keep the existing cssClass but ensure the correct .active marker
      const base = tab.cssClass || "";
      tab.cssClass = active ? `${base} active`.trim() : base.replace(/\bactive\b/g, "").trim();
      // Nombre VISIBLE de la pestaña, localizado por su id. El "label" del
      // static TABS / obtenerTabs() se deja como está (sirve de clave corta y
      // de fallback); el template pinta "labelTraducido" si existe.
      // Si la clave no existe en el idioma, lo dejamos vacío para que el
      // template caiga al "label" original (no mostramos la clave cruda).
      const clave = "Ad6.Pestanas." + tab.id;
      tab.labelTraducido = game.i18n.has(clave) ? game.i18n.localize(clave) : "";
    }
    return tabs;
  }

 

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
        /* Código para el manejo de los tabs */
         /*********************************** */
      
    if (!context.tabs) {
        context.tabs = this._prepareTabs("primary");
    }
    
        // Set tab context if this is a tab part
        if (["habilidades", "elementos", "talentos" ,"equipo","talentosElementos", "tripulante", "competencias", "localizaciones", "notas"].includes(partId)) {
        context.tab = context.tabs[partId];
    }

        /* Código para el manejo de los tabs */
         /*********************************** */
    
    return context;
}
}
