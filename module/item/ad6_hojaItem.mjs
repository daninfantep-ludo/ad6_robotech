const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
import {Ad6} from '../config.mjs'

export class Ad6_HojaItem extends HandlebarsApplicationMixin(ItemSheetV2)   {

    // El tamaño por defecto es 500x660 (DEFAULT_OPTIONS). SOLO la hoja de un
    // item de tipo "upgrade" necesita más ancho: sus filas de armaduras/equipos/
    // suities llevan muchas columnas.
    //
    // ¿POR QUÉ _initializeApplicationOptions Y NO EL constructor?
    // En ApplicationV2 las opciones finales (`this.options`) se construyen en
    // `_initializeApplicationOptions`, que se ejecuta DURANTE `super()` ANTES de
    // que un constructor propio pueda tocar nada. Mutar `this.options.position`
    // en el constructor llega TARDE y no cambia el tamaño ya resuelto.
    //
        // Sobreescribir `_initializeApplicationOptions` es el punto de extensión
        // correcto: recibimos las opciones ya normalizadas (con DEFAULT_OPTIONS
        // aplicados) y podemos ajustar `position` POR INSTANCIA. Se ejecuta dentro
        // de `super()`, así que hay que leer el documento de las opciones de
        // entrada (clave "document"), no confiar en `this.document`.
        _initializeApplicationOptions(options) {
        // Las opciones de ENTRADA traen el documento (clave "document") cuando
        // la hoja se abre desde un Item. Usamos ese dato como fuente principal
        // (this.document puede no estar aún asignado en este punto) y caemos a
        // this.document por si acaso.
        const documento = options?.document ?? this?.document ?? null;
        const opciones = super._initializeApplicationOptions(options);
        if (documento?.type === "upgrade") {
            opciones.position = foundry.utils.mergeObject(
                { ...(opciones.position ?? {}) },
                { width: 800, height: 740 },
                { inplace: false }
            );
        }
        return opciones;
    }

    static DEFAULT_OPTIONS = {
        classes: ["ad6_robotech", "sheet", "item"],
        position: {
            width: 500,
            height: 660
        },
        window: {
            resizable: true,
            frame: true
        },
        form: {
            closeOnSubmit: false,
            submitOnChange: true
        },
                                actions: {
          ponerInfinito: Ad6_HojaItem._ponerInfinito
          // Selector de imagen genérico del item: al pinchar una <img data-edit="ruta">
          // abre el FilePicker y guarda la ruta elegida en ese campo (img raíz del
          // item, o cualquier campo de system, p.ej. system.imgToken en un upgrade).
          ,editarImagen: Ad6_HojaItem._onEditarImagen
                    // Actions propias del item "upgrade": quitar de las listas de cosas a
          // inyectar. La AÑADIDURA se hace arrastrando items reales sobre la
          // hoja (ver _onDrop), no con botones.
          ,upgradeBorrarArmadura: Ad6_HojaItem._onUpgradeBorrarArmadura
          ,upgradeBorrarEquipo: Ad6_HojaItem._onUpgradeBorrarEquipo
          ,upgradeBorrarSuitEquipo: Ad6_HojaItem._onUpgradeBorrarSuitEquipo
          ,upgradeBorrarTalento: Ad6_HojaItem._onUpgradeBorrarTalento
          ,upgradeBorrarElemento: Ad6_HojaItem._onUpgradeBorrarElemento
        },
        // Permitir arrastrar items reales (armadura/equipo/suitEquipo) SOBRE la
        // hoja de un upgrade para añadirlos a sus listas de inyección.
        dragDrop: [{
            dragSelector: null,
            dropSelector: ".window-content"
        }]
    };
    static PARTS = {
        sheet: {
            template: "systems/ad6_robotech/templates/item/hojaItem.hbs"
        }
    };
        /* Altura de la ventana según el tipo de item. */


  async _prepareContext(options) {
     const context = await super._prepareContext(options);
        
      const itemData = this.document.toObject(false);
      context.system = itemData.system;
      context.flags = itemData.flags;
      context.itemType = this.document.type;
      // para tener acceso a las listas de cosas de config.mjs (Ad6.Rango, etc.)
      context.config = Ad6;
      const rawHTML = itemData.system.descripcion || "";
      context.descripcionRica = await foundry.applications.ux.TextEditor.implementation.enrichHTML(rawHTML)

      
        
        // (se usan los NOMBRES de los templates registrados con loadTemplates en ad6_robotech.mjs)
        // y luego lookup busca
        const typeTemplateMap = {
             "habilidad": "hojaHabilidad"
            ,"equipo": "hojaEquipo"
            ,"suitEquipo": "hojaSuitEquipo"
            ,"talento": "hojaTalento"
            ,"armadura": "hojaArmadura"
            ,"elemento": "hojaGenerico"
            ,"competencia": "hojaGenerico"
            ,"hardware": "hojaHardware"
            ,"localizacion": "hojaLocalizacion"
                        ,"perfilVelocidad": "hojaPerfilVelocidad"
            ,"hardware":"hojaLocalizacion"
            ,"upgrade": "hojaUpgrade"
        };
        
        context.typeTemplate = typeTemplateMap[this.document.type] || "hojaEquipo";
        
        return context;
    
  }

   get title() {
    const etiqueta = game.i18n.localize("TYPES.Item."+ this.document.type);
    return this.document.name + ' [' + etiqueta +']' ;
  }

    static async _ponerInfinito(event, target) {
    const updates = {};
    updates["system.usos.maximo"] = "∞";
    updates["system.usos.restante"] = "∞";
    if (Object.keys(updates).length > 0) { await this.document.update(updates);}

  }

    // -------------------------------------------------------------------------
  // Selector de imagen genérico del item.
  // Se engancha en cualquier elemento con data-action="editarImagen" y
  // data-ruta="RUTA" (img o div): abre el FilePicker de Foundry (tipo imagen) y,
  // al aceptar, guarda la ruta elegida en el campo indicado:
  //   - data-ruta="img"              -> el img propio del item (raíz).
  //   - data-ruta="system.imgToken"  -> un campo de texto del sistema (upgrade).
  //
  // IMPORTANTE: NO usamos el atributo data-edit de Foundry. DocumentSheetV2
  // recopila TODOS los elementos [data-edit] como campos del formulario al
  // hacer submit; en un <div>/<img> sin valor de formulario real eso mete
  // basura (p.ej. el texto del placeholder) en el campo y hace fallar la
  // validación del DataModel al guardar cualquier otro cambio.
  // -------------------------------------------------------------------------
  static async _onEditarImagen(event, target) {
    event.preventDefault();
    // data-ruta es lo nuestro; data-edit se admite como respaldo por si algún
    // template antiguo aún lo usa.
    const ruta = target?.dataset?.ruta ?? target?.dataset?.edit ?? "img";
    const fp = new foundry.applications.apps.FilePicker({
      type: "image",
      callback: (imagePath) => {
        this.document.update({ [ruta]: imagePath });
      }
    });
    fp.browse();
  }

  /**
   * Intercepta cambios en el formulario del item.
   * Cuando cambia "bancos.máximo", mantiene sincronizado el array de hardwares
   * con la cantidad de piezas indicada (todas en buen estado: true).
   */
  _onChangeForm(formConfig, event) {
    const target = event?.target;
    if (target && (target.name === "system.bancos.maximo")) {
      const valor = parseInt(target.value, 10);
      const nuevoValor = Number.isFinite(valor) && valor > 0 ? valor : 0;
      const item = this.document;
      const actuales = item.system.hardwares || [];

      // Solo rehacemos el array si cambia la longitud, para no pisar
      // el estado bueno/malo (true/false) que ya se haya marcado.
      if ((nuevoValor > 0) && (actuales.length !== nuevoValor)) {
        const hardwares = Array.from({ length: nuevoValor }, () => true);
        // update directo del campo (sin esperar a que lo haga el form)
        item.update({ "system.hardwares": hardwares });
            } else if (nuevoValor === 0) {
        item.update({ "system.hardwares": [] });
      }
    }
    return super._onChangeForm(formConfig, event);
  }

  // -------------------------------------------------------------------------
  // ITEM "upgrade": acciones de quitar de las listas de inyección
  // -------------------------------------------------------------------------
  // Cada lista (armaduras/equipos/suitEquipos) es un ArrayField de ObjectField.
  // Quitar un elemento = clonar el array SIN ese índice y guardarlo. Se clona
  // para no mutar el documento activo (mismo patrón que otros handlers del
  // sistema, p.ej. _onToggleHardware del vehículo).
  _quitarDeLista(campo, index)
  {
    if (this.document.type !== "upgrade") return;
    if (!Number.isFinite(index) || index < 0) return;
    const actuales = this.document.system[campo];
    if (!Array.isArray(actuales) || index >= actuales.length) return;
    const nuevos = actuales.filter((_, i) => i !== index);
    this.document.update({ [`system.${campo}`]: nuevos });
  }

  static async _onUpgradeBorrarArmadura(event, target)
  {
    this._quitarDeLista("armaduras", Number(target.dataset.index));
  }

  static async _onUpgradeBorrarEquipo(event, target)
  {
    this._quitarDeLista("equipos", Number(target.dataset.index));
  }

    static async _onUpgradeBorrarSuitEquipo(event, target)
  {
    this._quitarDeLista("suitEquipos", Number(target.dataset.index));
  }

  static async _onUpgradeBorrarTalento(event, target)
  {
    this._quitarDeLista("talentos", Number(target.dataset.index));
  }

  static async _onUpgradeBorrarElemento(event, target)
  {
    this._quitarDeLista("elementos", Number(target.dataset.index));
  }

  // -------------------------------------------------------------------------
  // ITEM "upgrade": AÑADIR cosas a las listas ARRASTRANDO items reales
  // -------------------------------------------------------------------------
    // Sólo tiene efecto si la hoja es de un upgrade. Aceptamos items cuyo tipo
  // sea armadura / equipo / suitEquipo / talento / elemento y guardamos una
  // COPIA COMPLETA del item (toObject()) en la lista correspondiente, para poder
  // recrearlo luego tal cual al equipar el upgrade. Cualquier otro caso delega
  // en el comportamiento nativo de Foundry (que se encarga de drops estándar).
  async _onDrop(event)
  {
    // Si no es la hoja de un upgrade, comportamiento nativo.
    if (this.document.type !== "upgrade") return super._onDrop(event);

    let data;
    try {
      data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    } catch (err) {
      return super._onDrop(event);
    }

    // Sólo aceptamos Items.
    if (data?.type !== "Item") return super._onDrop(event);

    const item = await fromUuid(data.uuid);
    if (!item) return super._onDrop(event);

        const campoPorTipo = {
       armadura: "armaduras"
      ,equipo: "equipos"
      ,suitEquipo: "suitEquipos"
      ,talento: "talentos"
      ,elemento: "elementos"
    };
        const campo = campoPorTipo[item.type];
    // Tipo no soportado (p.ej. otro upgrade): no hacemos nada con el drop.
    if (!campo) {
      ui.notifications.warn(game.i18n.localize("Ad6.Upgrade.tipoNoAdmitido"));
      return;
    }

    // Guardamos una copia completa del item (independiente del original).
    const copia = foundry.utils.deepClone(item.toObject());
    // Le damos identidad propia para que no arrastre el _id del original.
    copia._id = foundry.utils.randomID();

    const actuales = Array.from(this.document.system[campo] ?? []);
    actuales.push(copia);
    await this.document.update({ [`system.${campo}`]: actuales });
    this.render();
  }
}


  


