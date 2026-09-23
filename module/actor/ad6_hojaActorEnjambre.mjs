import { Ad6_MiembroEnjambre, Ad6_Proteccion } from '../../model/general.mjs';
import {Ad6_HojaActor} from './ad6_hojaActor.mjs'
import * as Func from '../../model/funciones.mjs'
import { combinarArmaduras } from '../combate/ad6_calculoDano.mjs';

export class Ad6_HojaActorEnjambre extends Ad6_HojaActor
{

  constructor(options = {}) 
  {
    super(options);
    // Valor por defecto, pero solo si no hay uno guardado
    this._activeTab = "formacion"; // cambiar
  }  

  
  static DEFAULT_OPTIONS = {
     classes: ["my-system", "sheet", "actor"]
    ,scrollY: [".tab-content"]
    ,position: {
      width: 800,
      height: 740
    }
    ,actions:{
      sumarUno: this._onSumarUno
      ,sumarCinco: this._onSumarCinco
      ,restarUno: this._onRestarUno
      ,restarCinco: this._onRestarCinco
      ,restaurar: this._onRestaurar
      ,borrarMiembro: this._onBorrarMiembro
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
      template: "systems/ad6_robotech/templates/actor/enjambreVitales.hbs"
    }
    ,tirada:
    {
      template: "systems/ad6_robotech/templates/actor/enjambreTirada.hbs"
    }
    ,tabs: 
    {
        template: "systems/ad6_robotech/templates/actor/principalTabsNavegacion.hbs"
    }
    ,equipo: {
        template: "systems/ad6_robotech/templates/actor/tabEquipo.hbs",
        scrollable: [".tab-content"]
    }
    ,formacion: {
        template: "systems/ad6_robotech/templates/actor/tabFormacion.hbs",
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
              { id: "equipo", label: "Equipo" },
              { id: "formacion", label: "Formación" },
              { id: "notas", label: "Notas" }
          ],
          initial: "formacion" // cambiar
      }
  };


  static async _onSumarUno(event,target)
  {
    if(this.actor.system.restantes >= 1){
      this.agregarUpdates("system.dados", this.actor.system.dados + 1);
      this.agregarUpdates("system.restantes", this.actor.system.restantes -1);
      this.actualizar();
    }

  }
  static async _onSumarCinco(event,target)
  {
    if(this.actor.system.restantes>=5)
    {
      this.agregarUpdates("system.dados", this.actor.system.dados + 5);
      this.agregarUpdates("system.restantes", this.actor.system.restantes -5);
      this.actualizar();
    }
    else
    {
      this.agregarUpdates("system.dados", this.actor.system.dados + this.actor.system.restantes);
      this.agregarUpdates("system.restantes", 0);
      this.actualizar();
    }
  }

  static async _onRestarUno(event,target)
  {
    
    if(this.actor.system.restantes < this.actor.system.unidades)
    {
      this.agregarUpdates("system.dados", this.actor.system.dados -1);
      this.agregarUpdates("system.restantes", this.actor.system.restantes + 1);
      this.actualizar();
    }
  }
  static async _onRestarCinco(event,target)
  {
    if(this.actor.system.restantes <= 2)
    {
      this.agregarUpdates("system.dados", this.actor.system.dados - 5);
      this.agregarUpdates("system.restantes", this.actor.system.restantes +5);
      this.actualizar();
    }
    else
    {
      this.agregarUpdates("system.dados", this.actor.system.dados - (this.actor.system.unidades - this.actor.system.restantes));
      this.agregarUpdates("system.restantes", this.actor.system.unidades);
      this.actualizar();
    }
  }

  static async _onRestaurar(event,target)
  {
    this.agregarUpdates("system.restantes",this.actor.system.unidades);
    this.actualizar();
  }

  /**
   * La clase base (Ad6_HojaActor) sólo rellena "context.tab" (con su clase
   * "active") para un conjunto fijo de pestañas que NO incluye "formacion".
   * Eso hace que la pestaña inicial del Enjambre quede sin su tab activo y
   *, por tanto, no responda al cambiar de pestaña como el resto de hojas.
    * Aquí se la entregamos al delegar el resto en la base.
    */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (!context.tabs) context.tabs = this._prepareTabs("primary");
    // Asegurar el tab contexto de la parte de formación (no cubierta en la base)
    if (partId === "formacion") {
      context.tab = context.tabs[partId];
    }
    return context;
  }



  async _onDrop(event) {
    // cuando arrastramos, podemos arrastrar un vehículo o un teniente
    // no un actor principal. Primero parto gestionando lo fácil
    // cuando añado un actor copio su armadura, equipo y suit de equipo
    // la armadura sólo va a ser cuando sea un teniente, pero hay que tenerlo en cuenta

    // cuando saco al actor, debo sacar eso mismo: armaduras, equipos y suit que corresponden
    // a ese actor. o a esa instancia del actor, por lo que debo guardarme no sólo el ID del 
    // actor que estoy añadiendo sino algo que los identifique. Por ejemplo tengo dos actores
    // distintos (no debería poner dos actores iguales en un swarm... ) pero que tengan el mismo
    // equipo... tendría ID's diferentes? (si es de un compendio o lista?)

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

    const actor = await fromUuid(data.uuid);
    if (!actor) return super._onDrop(event);

    // Solo se aceptan pilotos de tipo teniente (para personas) y vehículo
    // Cualquier otro actor se rechaza y se CANCELA el drop (no es un item).
    if (!["teniente", "vehiculo"].includes(actor.type)) {
      ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.soloMiembrosTenienteVehiculo"));
      return;
    }

        // Valor por defecto de una protección en DATOS planos (no en definiciones de
    // schema). NO se usa Ad6_Proteccion() aquí porque esa función devuelve objetos
    // de campo de Foundry (StringField/NumberField/ArrayField/SchemaField), es
    // decir la DEFINICIÓN del schema, no los valores inicializados que produciría
    // el DataModel al instanciarla dentro de un SchemaField.
    const nuevaProteccionVacia = () => ({
      tipo: "",
      valor: 0,
      restante: 0,
      resiste: 0,
      ablativa: false,
      resistencias: [
        { descriptor: "Ad6.TipoAtaque.energia", adicional: 0 },
        { descriptor: "Ad6.TipoAtaque.noMelee", adicional: 0 },
        { descriptor: "Ad6.TipoAtaque.frio", adicional: 0 },
        { descriptor: "Ad6.TipoAtaque.ligero", adicional: 0 },
        { descriptor: "Ad6.TipoAtaque.area", adicional: 0 }
      ]
    });

    // Construir el miembro de la formación con datos planos ya resueltos (igual que
    // haría el DataModel al instanciar Ad6_MiembroEnjambre() dentro de su schema).
    const nuevoMiembro = {
      identificador: actor.id,
      nombre: actor.name,
      img: actor.img,
      cantidad: 0,
      armaduraPrincipal: nuevaProteccionVacia(),
      armaduraSecundaria: nuevaProteccionVacia(),
      estructura: 0,
      tipo: ""
    };


    
        if(actor.type=="teniente")
    {
      // --- Armadura "de a pie" del teniente: item equipado + armadura de especie.
      // La combinación (sumar campo a campo, resistencias por descriptor, elegir
      // el tipo mayor y conservar los de tipo distinto en "extras") está
      // FACTORIZADA en combinarArmaduras() para no duplicar la lógica. Se reusa
      // también en la aplicación de daño a principal/teniente.
      const protecciones = [];
      const principalPersonal = actor.items.filter(function(item){return item.type=="armadura"}).find(i =>((i.system.equipada)&&(!i.system.armadura.ablativa)));
      if(principalPersonal)
      {
        protecciones.push(foundry.utils.deepClone(principalPersonal).system.armadura);
      }
      // armadura de base que pueda tener la especie
      protecciones.push(actor.system.heridasParams.armadura);
      // La armadura principal del miembro es la combinación (base + extras).
      // Los "extras" (tipo distinto) se guardan como armaduraSecundaria para no
      // perderlos, junto con el escudo ablativo que pueda llevar.
      const combinada = combinarArmaduras(protecciones);

      nuevoMiembro.armaduraPrincipal = {
         tipo: combinada.tipo ?? ""
        ,valor: combinada.valor
        ,restante: combinada.restante
        ,resiste: combinada.resiste
        ,ablativa: false
        ,resistencias: combinada.resistencias
      };

      // ahora poner el escudo si es que lo tiene (armadura ablativa equipada)
      const secundariaTeniente = actor.items.filter(function(item){return item.type=="armadura"}).find(i =>((i.system.equipada)&&(i.system.armadura.ablativa)));
      if(secundariaTeniente)
      {
        nuevoMiembro.armaduraSecundaria = foundry.utils.deepClone(secundariaTeniente).system.armadura;
        nuevoMiembro.armaduraSecundaria.valor = Func.aproximar(nuevoMiembro.armaduraSecundaria.valor/3);
        nuevoMiembro.armaduraSecundaria.restante = Func.aproximar(nuevoMiembro.armaduraSecundaria.restante/3);
      }
      else if (combinada.extras && combinada.extras.length > 0)
      {
        // No hay escudo: guardamos el primer "extra" (p. ej. la armadura de
        // especie de tipo distinto) como secundaria para poder mostrarla.
        const ex = combinada.extras[0];
        nuevoMiembro.armaduraSecundaria.tipo = ex.tipo ?? "";
        nuevoMiembro.armaduraSecundaria.valor = ex.valor;
        nuevoMiembro.armaduraSecundaria.restante = ex.restante;
        nuevoMiembro.armaduraSecundaria.resiste = ex.resiste;
        nuevoMiembro.armaduraSecundaria.resistencias = ex.resistencias;
      }

      // calcular la estructura
      const valorHeridas = actor.system.heridasParams.valorHeridas;
      let unitario = 0;
      switch(valorHeridas)
      {
        case "L": unitario = 1; nuevoMiembro.tipo="L"; break;
        case "M": unitario = 1; nuevoMiembro.tipo = "M"; break;
        default:
          nuevoMiembro.tipo ="L";
          unitario = Number(valorHeridas.replace(/l/gi, ""));
          break;
      }
      //nuevoMiembro.estructura = Math.ceil(actor.system.heridas.filter(h => h.visible).length * unitario/3);
      nuevoMiembro.estructura = Func.aproximar(actor.system.heridas.filter(h => h.visible).length * unitario/3);
    }
    else // es un vehículo
    {
      //nuevoMiembro.estructura = Math.ceil(actor.system.estructura.maximo/3);
      nuevoMiembro.estructura = Func.aproximar(actor.system.estructura.maximo/3);
      nuevoMiembro.tipo = actor.items.filter(function(item){return item.type=="armadura"}).find(i => i.name === "Blindaje").system.armadura.tipo;
      nuevoMiembro.armaduraPrincipal = foundry.utils.deepClone(actor.items.filter(function(item){return item.type=="armadura"}).find(i => i.name === "Blindaje")).system.armadura;
      const secundariavehiculo = actor.items.filter(function(item){return item.type=="armadura"}).find(i => i.name !== "Blindaje");
      if(secundariavehiculo)
        {
          nuevoMiembro.armaduraSecundaria = foundry.utils.deepClone(secundariavehiculo).system.armadura;
          nuevoMiembro.armaduraSecundaria.valor = Func.aproximar(nuevoMiembro.armaduraSecundaria.valor/3);
                    nuevoMiembro.armaduraSecundaria.restante = Func.aproximar(nuevoMiembro.armaduraSecundaria.restante/3);
          }
    }
    this.actor.system.formacion.push(nuevoMiembro);
    this.agregarUpdates("system.formacion", this.actor.system.formacion);
    await this.actualizar();
        // añadir las armas, armaduras y equipment suites del actor al escuadrón.
    // El id del actor se guarda dentro del idPadre de cada objeto copiado
    // (procesarAnadirItem lo añade a la lista o lo reutiliza si ya existe uno igual)

    let lista = actor.items.filter(i => ["equipo","suitEquipo"].includes(i.type));

    let itemsActuales = this.actor.items.filter(i=>true);
    for(let j=0; j<lista.length;j++)
    {
      await this.procesarAnadirItem(itemsActuales,lista[j], actor.id);
    }
   // this.render();
  }

    static async _onBorrarMiembro(event,target)
   {
    const identificador = target.dataset.identificador;

    /*
      La ley de propiedad ahora es por lista: "idPadre" puede contener varios
      ids de actores separados por coma.
      - Si el objeto pertenece a VARIOS actores, solo hay que quitar este id
        de la lista (queda en el escuadrón por venir también de otro actor).
      - Si el objeto pertenecía SOLO a este actor, se elimina por completo.
    */
    const tipos = ["equipo","suitEquipo"];
    const items = this.actor.items.filter(i => tipos.includes(i.type));
    const aBorrar = [];
    for (const item of items) {
      const dueños = this.dividirIdPadres(item.system.idPadre);
      //console.log("dueños-->"+ dueños);
     // console.log("identi-->" + identificador);
      if (!dueños.includes(identificador)) continue; // este objeto no es de este actor
      if (dueños.length <= 1) {
        // es el único dueño → se elimina el objeto
        aBorrar.push(item.id);
      } else {
        // quedan otros dueños → solo se le quita este id a la lista
        const restantes = dueños.filter(id => id !== identificador);
       // console.log("restantes->" + restantes)
        await item.update({ "system.idPadre": restantes.join(",") });
      }
    }
  //  console.log(aBorrar);
    if (aBorrar.length) await this.actor.deleteEmbeddedDocuments("Item", aBorrar);

    // quitar la entrada de la formación y recalcular contadores
    this.actor.system.formacion = this.actor.system.formacion.filter(item => item.identificador !== identificador);
    this.agregarUpdates("system.formacion", this.actor.system.formacion);
//    this.actualizar();
    this.contarUnidades();
   }

  // sobreescribo el evento que se dispara en el change, para procesar que lo que voy a cambiar es del miembro de la formación
  // si y solo si tengo un campo que sea "miembro" que diga "S"
  async _onTextChange(event)
  {
        const miembro = event.target.dataset.miembro;
    if(miembro=="S") // estoy cambiando algo del miembro, como las unidades
    {
            const indice = event.target.dataset.id;
      const campo = event.target.dataset.campo;
      const valor = event.target.value;
      const formacion = this.actor.system.formacion;
      if (formacion && formacion[indice]) {
        formacion[indice][campo] = valor;
      }

      // Consignar la formación modificada y dejar que contarUnidades() sume
      // todo (formación + unidades + restantes) en UN solo actualizar().
      // (Hacer un actualizar() aquí y luego otro dentro de contarUnidades()
      // provocaba que el re-render intermedio perdiese el cálculo la 1ª vez.)
      await this.agregarUpdates("system.formacion", this.actor.system.formacion);
      await this.contarUnidades();
      this.updates = {};
    }
    else{
      // si no que siga su rumbo, por el tab equipo...
      super._onTextChange(event);
    }

  }

  async contarUnidades()
  {
      let total =0;
      
      for(let i=0; i<this.actor.system.formacion.length; i++)
      {
        // Número tolerante a cantidad vacía/indefinida para no propagar NaN
        total += Number(this.actor.system.formacion[i].cantidad || 0);
        
      }
      
      await this.agregarUpdates("system.unidades",total);
      await this.agregarUpdates("system.restantes",total);
      await this.actualizar();
  }

    // Convierte el contenido del campo idPadre (que ahora es una lista de ids de
  // actores separados por coma) en un array limpio de ids (sin vacíos ni duplicados).
  dividirIdPadres(campo)
  {
    if (!campo) return [];
    const lista = String(campo).split(",").map(s => s.trim()).filter(s => s);
    return [...new Set(lista)];
  }

  igualesPorTipo(item1, item2)
  {
    return(
         (item1.type===item2.type)
      && (item1.name===item2.name)
      && (item1.system.rango===item2.system.rango)
      && (item1.system.extendido===item2.system.extendido)
      && (item1.system.penetracion===item2.system.penetracion)
      && (item1.system.area===item2.system.area)
      && (item1.system.bocajarro===item2.system.bocajarro)
      && (item1.system.francotirador===item2.system.francotirador)
      && (item1.system.incendiaria===item2.system.incendiaria)
      && (item1.system.corrosiva===item2.system.corrosiva)
      && (item1.system.pesada===item2.system.pesada)
      && (item1.system.bloqueo===item2.system.bloqueo)
      && (item1.system.misiles===item2.system.misiles)
      && (item1.system.silenciosa==item2.system.silenciosa)
      && (item1.system.incendiaria===item2.system.incendiaria)
      && ( (item1.type === "equipo") ||
           ((item1.type==="suitEquipo") && (item1.system.usos.maximo==="∞"))
         )
    )
  }
  
    /*
    Añade un item proveniente de un actor miembro del escuadrón.
    - Si ya existe en el escuadrón un item "igual por tipo", NO se duplica:
      sólo se añade el id del nuevo actor a la lista "idPadre" del objeto existente.
    - Si no existe ninguno igual, se crea el item y su idPadre queda con el
      id del actor que lo aporta.
  */
  async procesarAnadirItem(itemsActuales, itemAnadir, idPadreNuevo)
  {
    const existeIgual = (itemsActuales && itemsActuales.length > 0)
        ? itemsActuales.find(it => this.igualesPorTipo(it, itemAnadir))
        : null;

    
    if (existeIgual) {
      // Reutilizar el objeto que ya está: añadir dueño a la lista sin duplicarlo.
      const dueños = this.dividirIdPadres(existeIgual.system.idPadre);
      if (!dueños.includes(idPadreNuevo)) {
        dueños.push(idPadreNuevo);
        await existeIgual.update({ "system.idPadre": dueños.join(",") });
      }
      return;
    }

    // No hay ninguno igual: se copia el item con su primer dueño.
    itemAnadir.system.idPadre = idPadreNuevo;
    itemAnadir.update({ "system.idPadre": idPadreNuevo});
    

    await this.actor.createEmbeddedDocuments("Item", [itemAnadir]);
  }
}
