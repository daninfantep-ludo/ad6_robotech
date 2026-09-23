const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

import {Ad6} from './config.mjs'

import {Ad6_ActorConflicto, Ad6_ActorPrincipal, Ad6_ActorTeniente, Ad6_ActorEnjambre, Ad6_ActorVehiculo} from '../model/actores.mjs' 
import {Ad6_Habilidad, Ad6_Talento, Ad6_Equipo, Ad6_Armadura, Ad6_Hardware, Ad6_SuitEquipo, Ad6_PerfilVelocidad, Ad6_Localizacion, Ad6_Upgrade} from '../model/items.mjs' 

import {Ad6_HojaActorConflicto} from './actor/ad6_hojaActorConflicto.mjs'
import {Ad6_HojaActorPrincipal} from './actor/ad6_hojaActorPrincipal.mjs'
import {Ad6_HojaActorTeniente} from './actor/ad6_hojaActorTeniente.mjs'
import {Ad6_HojaActorEnjambre} from './actor/ad6_hojaActorEnjambre.mjs'
import {Ad6_HojaActorVehiculo} from './actor/ad6_hojaActorVehiculo.mjs'

import { Ad6_HojaItem } from "./item/ad6_hojaItem.mjs";
import * as ServicioAsistencia from "./chat/ad6_servicioAsistencia.mjs";
import * as ServicioCombate from "./combate/ad6_servicioCombate.mjs";
import * as ServicioIniciativa from "./combate/ad6_servicioIniciativa.mjs";
import * as ServicioFases from "./combate/ad6_servicioFases.mjs";
import * as TrackerFases from "./combate/ad6_trackerFases.mjs";
import * as ReglasTurno from "./combate/ad6_reglasTurno.mjs";
import * as RepresentacionEnjambre from "./token/ad6_representacionEnjambre.mjs";


class Ad6_App extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      handler: Ad6_App.myFormHandler,
      submitOnChange: false,
      closeOnSubmit: false
    },
     actions: {
      myAction: Ad6_App.myAction
    }
  }

  static PARTS = {
    header: { template: '' },
    tabs: { template: '' },
    description: { template: '' },
    foo: { template: '' },
    bar: { template: '' },
  }

  static async myFormHandler(event, form, formData) {
    // Do things with the returned FormData
  }
    static myAction(event, target) {
    // Acción de ejemplo: `this` es la instancia concreta de la aplicación.
  }
}

/* esto sirve para cambiar el aspecto de los mensajes del chat */
Hooks.on("renderChatLog", (app, html) => {
    html.classList.add("ad6-chat-log");
});


  Hooks.once("init", function(){

 

      console.log("AD6 Robotech - Cargando Hooks Once Init")
      CONFIG.Ad6 = Ad6;

      // Definición de los datamodels
      CONFIG.Actor.dataModels.principal = Ad6_ActorPrincipal;
      CONFIG.Actor.dataModels.teniente = Ad6_ActorTeniente;
      CONFIG.Actor.dataModels.enjambre = Ad6_ActorEnjambre;
      CONFIG.Actor.dataModels.vehiculo = Ad6_ActorVehiculo;
      CONFIG.Actor.dataModels.conflicto = Ad6_ActorConflicto;
            CONFIG.Item.dataModels.habilidad = Ad6_Habilidad;
      CONFIG.Item.dataModels.equipo = Ad6_Equipo;
      CONFIG.Item.dataModels.suitEquipo = Ad6_SuitEquipo;
      CONFIG.Item.dataModels.talento = Ad6_Talento;
      CONFIG.Item.dataModels.armadura = Ad6_Armadura;
      CONFIG.Item.dataModels.perfilVelocidad = Ad6_PerfilVelocidad;
            CONFIG.Item.dataModels.localizacion = Ad6_Localizacion;
      CONFIG.Item.dataModels.hardware = Ad6_Hardware;
      CONFIG.Item.dataModels.upgrade = Ad6_Upgrade;



      // Registro de las hojas para cada clase

      const DocumentSheetConfig = foundry.applications.apps.DocumentSheetConfig;
      DocumentSheetConfig.registerSheet(Actor, "ad6_robotech", Ad6_HojaActorConflicto , { types: ["conflicto"], makeDefault: true });
      DocumentSheetConfig.registerSheet(Actor, "ad6_robotech", Ad6_HojaActorVehiculo , { types: ["vehiculo"], makeDefault: true });
      DocumentSheetConfig.registerSheet(Actor, "ad6_robotech", Ad6_HojaActorPrincipal, { types: ["principal"], makeDefault: true });
      DocumentSheetConfig.registerSheet(Actor, "ad6_robotech", Ad6_HojaActorEnjambre, { types: ["enjambre"], makeDefault: true });
      DocumentSheetConfig.registerSheet(Actor, "ad6_robotech", Ad6_HojaActorTeniente, { types: ["teniente"], makeDefault: true });

      
      // Registro de las hojas para cada item
      DocumentSheetConfig.registerSheet(Item, "ad6_robotech", Ad6_HojaItem, { makeDefault: true });

      // Carga de los templates
      foundry.applications.handlebars.loadTemplates({
         "hojaHabilidad": "systems/ad6_robotech/templates/item/hojaHabilidad.hbs"
        ,"hojaTalento": "systems/ad6_robotech/templates/item/hojaTalento.hbs"
        ,"hojaEquipo": "systems/ad6_robotech/templates/item/hojaEquipo.hbs"
        ,"hojaSuitEquipo": "systems/ad6_robotech/templates/item/hojaSuitEquipo.hbs"
        ,"hojaArmadura" : "systems/ad6_robotech/templates/item/hojaArmadura.hbs"
        ,"hojaGenerico": "systems/ad6_robotech/templates/item/hojaGenerico.hbs"
        ,"hojaHardware": "systems/ad6_robotech/templates/item/hojaHardware.hbs"        
                ,"hojaLocalizacion": "systems/ad6_robotech/templates/item/hojaLocalizacion.hbs"
        ,"hojaPerfilVelocidad": "systems/ad6_robotech/templates/item/hojaPerfilVelocidad.hbs"
        ,"hojaUpgrade": "systems/ad6_robotech/templates/item/hojaUpgrade.hbs"                                
        // Parciales SOLO LECTURA de la hoja de UPGRADE: muestran las listas de
        // armaduras / equipos / suities con el mismo aspecto que tabEquipo.hbs,
        // pero sin edición ni botones (el upgrade sólo se CONSTRUYE por drag&drop).
                ,"parcialUpgradeLecturaArmadura": "systems/ad6_robotech/templates/item/parcialUpgradeLecturaArmadura.hbs"
        ,"parcialUpgradeLecturaEquipo": "systems/ad6_robotech/templates/item/parcialUpgradeLecturaEquipo.hbs"
        ,"parcialUpgradeLecturaHardwares": "systems/ad6_robotech/templates/item/parcialUpgradeLecturaHardwares.hbs"
        ,"parcialUpgradeLecturaTalento": "systems/ad6_robotech/templates/item/parcialUpgradeLecturaTalento.hbs"
        ,"parcialUpgradeLecturaElemento": "systems/ad6_robotech/templates/item/parcialUpgradeLecturaElemento.hbs"
        ,"parcialEstres": "systems/ad6_robotech/templates/actor/parcialEstres.hbs"
        ,"parcialHeridas": "systems/ad6_robotech/templates/actor/parcialHeridas.hbs"
        ,"parcialContextoGeneral": "systems/ad6_robotech/templates/actor/parcialContextoGeneral.hbs"
        ,"parcialHeaderEquipos": "systems/ad6_robotech/templates/actor/parcialHeaderEquipos.hbs"
        ,"parcialCuerpoEquipos": "systems/ad6_robotech/templates/actor/parcialCuerpoEquipos.hbs"
        ,"parcialTirada": "systems/ad6_robotech/templates/actor/parcialTirada.hbs"
        ,"parcialTiradaBoton": "systems/ad6_robotech/templates/actor/parcialTiradaBoton.hbs"
        ,"appAsistencia": "systems/ad6_robotech/templates/asistencia/appAsistencia.hbs"
        ,"parcialHeroico": "systems/ad6_robotech/templates/actor/parcialHeroico.hbs"
        ,"parcialEmergenteConfiguracion": "systems/ad6_robotech/templates/actor/parcialEmergenteConfiguracion.hbs"
        ,"parcialEmergenteVehiculo": "systems/ad6_robotech/templates/actor/parcialEmergenteVehiculo.hbs"
        ,"parcialEmergenteEstructura": "systems/ad6_robotech/templates/actor/parcialEmergenteEstructura.hbs"
        ,"tenienteHexHabilidad": "systems/ad6_robotech/templates/actor/tenienteHexHabilidad.hbs"
        ,"tabTalentos": "systems/ad6_robotech/templates/actor/tabTalentos.hbs"
        ,"tabElementos": "systems/ad6_robotech/templates/actor/tabElementos.hbs"
        ,"parcialContenidoElementos":"systems/ad6_robotech/templates/actor/parcialContenidoElementos.hbs"
        ,"parcialContenidoTalentos":"systems/ad6_robotech/templates/actor/parcialContenidoTalentos.hbs"
        ,"parcialContenidoSuitEquiposPersonales":"systems/ad6_robotech/templates/actor/parcialContenidoSuitEquiposPersonales.hbs"
        ,"parcialRetrato": "systems/ad6_robotech/templates/actor/parcialRetrato.hbs"
        ,"parcialResistencias": "systems/ad6_robotech/templates/actor/parcialResistencias.hbs"
        ,"parcialPiloto": "systems/ad6_robotech/templates/actor/parcialPiloto.hbs"
        ,"tabHabilidades": "systems/ad6_robotech/templates/actor/tabHabilidades.hbs"
        ,"tenienteTabHabilidades": "systems/ad6_robotech/templates/actor/tenienteTabHabilidades.hbs"
        ,"ninguno": "systems/ad6_robotech/templates/actor/ninguno.hbs"
        ,"parcialEmergenteEstres": "systems/ad6_robotech/templates/actor/parcialEmergenteEstres.hbs"
        ,"parcialContenidoEstres": "systems/ad6_robotech/templates/actor/parcialContenidoEstres.hbs"
        ,"parcialMaxValor": "systems/ad6_robotech/templates/actor/parcialMaxValor.hbs"
        ,"parcialHardwares": "systems/ad6_robotech/templates/actor/parcialHardwares.hbs"
        ,"parcialEquipo": "systems/ad6_robotech/templates/item/parcialEquipo.hbs"
        ,"parcialSistemas": "systems/ad6_robotech/templates/actor/parcialSistemas.hbs"
                ,"parcialTenienteHabilidades": "systems/ad6_robotech/templates/actor/parcialTenienteHabilidades.hbs"
        ,"vehiculoHabilidadesTripulacion": "systems/ad6_robotech/templates/actor/vehiculoHabilidadesTripulacion.hbs"
        ,"appCombate": "systems/ad6_robotech/templates/combate/appCombate.hbs"
        ,"parcialArmaAtaque": "systems/ad6_robotech/templates/combate/parcialArmaAtaque.hbs"
        ,"parcialEmergenteUpgrades": "systems/ad6_robotech/templates/actor/parcialEmergenteUpgrades.hbs"
        
        
    });
      // por qué no necesito registrar los templates de los dialog?

  // Funciones de nivel de presentación 
   Handlebars.registerHelper("enriquecer",function(t){
    return TextEditor.enrichHTML(t, {async:true});
   });

   Handlebars.registerHelper("and", function(a, b) {
      return a && b;     
   });
   
   Handlebars.registerHelper("or", function(a, b) {
      return a || b;     
   });
   Handlebars.registerHelper("eq", function(a, b) {
    return a === b;
   });

    Handlebars.registerHelper("neq", function(a, b) {
     return a !== b;
    });

    // Comparación numérica <= (útil para "miembro sin unidades", cantidad <= 0).
    Handlebars.registerHelper("lte", function(a, b) {
     return (Number(a) || 0) <= (Number(b) || 0);
    });


      Handlebars.registerHelper("novac", function(a) {
    return ((a!=="0")&&(a!=="")&&(a!==null));
   });

   // ¿La ruta de imagen es una de las de por DEFECTO de Foundry (sin valor
   // real)? Sirve para, por ejemplo, no mostrar el icono genérico del item
   // ("item-bag") ni el token genérico ("mystery-man"). Se compara por sufijo
   // para tolerar rutas con almacenamiento por delante. Vacío también cuenta.
   Handlebars.registerHelper("esImgDefecto", function(src)
   {
      const s = (src ?? "").toString().trim().toLowerCase();
      if (s === "") return true;
      return s.endsWith("icons/svg/item-bag.svg")
          || s.endsWith("icons/svg/mystery-man.svg");
   });

   // función para transformar el color de las heridas del clon tiresio
   // que es lo que guardo en el datamodel en un número

   Handlebars.registerHelper("cambiaClon", function(a)
   {
      var res="";
      switch(a)
      {
        case 3: res = "blanco"; break;
        case 2: res = "verde"; break;
        case 1: res = "ambar"; break;
        case 0: res = "rojo"; break;
      }
  
      return res;
   });
   // funcion para quitar el porcentaje del botón de motores del los vehículos y aplicar clases de color
   Handlebars.registerHelper("quitarPorcentaje", function(value) {
    if (typeof value === 'string') {
        return value.replace('%', '').trim();
    }
    return value;
  });
   // estas función lo que hace es tomar el tipo de heridasParams.valorHeridas del actor
   // y determinar qué clase le va para hexágono interior, desde nada a L a M 
   Handlebars.registerHelper("leeHex", function(a)
   {
      var res = "";
      switch(a)
      {
        case "L": res = ""; break;
        case "M": res = "hex-interior-m"; break;
        default: res = "hex-interior-l"; break;
      }
      return res;
   });

    // Helper (SOLO PRESENTACIÓN): texto de DESCRIPTORES de un arma/equipo.
  // En el DataModel Ad6_Equipo, "descriptores" es un GETTER (campo derivado que
  // NO se persiste), así que NO está presente en una COPIA PLANA (item.toObject())
  // como las que guarda un upgrade. Este helper reconstruye el MISMO texto desde
  // los flags booleanos, para poder mostrarlo en la hoja de un upgrade (y en
  // cualquier otro sitio que trabaje con copias planas).
  // Recibe directamente el "system" de la copia (plano).
  Handlebars.registerHelper("descriptoresArma", function(system) {
    if (!system) return "";
    let resultado = "";
    if (system.extendido)    { resultado += " [E]"; }
    if (system.agua)         { resultado += " [W]"; }
    if (system.bocajarro)    { resultado += " [M]"; }
    if (system.francotirador){ resultado += " [S]"; }
    if (system.incendiaria)  { resultado += " [In]"; }
    if (system.corrosiva)    { resultado += " [Co]"; }
    if (system.pesada)       { resultado += " [Bu]"; }
    if (system.bloqueo)      { resultado += " [Pr]"; }
    if (system.misiles)      { resultado += " [Ms]"; }
    if (system.silenciosa)   { resultado += " [Q]"; }
    return resultado.trim();
  });

  // esta función me ayuda a traducir las escalas a letras, para en el tabEquipo
  // mostrar L/M/N en lugar de las palabras del idioma json. No lo cambio todo porque
  // en la de vehículo y en la hoja de equipo es más legible la palabra que la inicial
    Handlebars.registerHelper("escalaLetra", function(value) {
  const mapa = {
    "ligera": "L",
    "mecha": "M",   // ajusta las claves según tu config
    "naval": "N"
  };
  return mapa[value] || value;
});

  // Helper (SOLO PRESENTACIÓN): clase del icono FontAwesome de una RESISTENCIA
  // de armadura, según su DESCRIPTOR (los definidos en Ad6.TipoAtaque.*).
  // Se resuelve POR DESCRIPTOR (no por índice) para ser robusto ante cualquier
  // reordenación del array de resistencias (p.ej. combinarArmaduras reconstruye
  // el array desde un Map y puede cambiar el orden). Si el descriptor no se
  // reconoce, devuelve una cadena vacía (no pinta icono).
  Handlebars.registerHelper("iconoResistencia", function(descriptor) {
    const mapa = {
       "Ad6.TipoAtaque.energia": "fa-solid fa-bolt"
      ,"Ad6.TipoAtaque.noMelee": "fa-solid fa-handshake-slash"
      ,"Ad6.TipoAtaque.frio":    "fa-solid fa-snowflake"
      ,"Ad6.TipoAtaque.ligero":  "fa-solid fa-feather-pointed"
      ,"Ad6.TipoAtaque.area":    "fa-solid fa-border-none"
    };
    return mapa[descriptor] || "";
  });

  // Helper (SOLO PRESENTACIÓN): etiqueta localizada del TÍTULO de una
  // resistencia, según su DESCRIPTOR. Reutiliza la clave "corta" equivalente a
  // las ya existentes (adicAntiEnergia/adicNoMelee/adicFrio) para las dos
  // nuevas (adicLigero/adicArea).
  Handlebars.registerHelper("etiquetaResistencia", function(descriptor) {
    const mapa = {
       "Ad6.TipoAtaque.energia": "Ad6.Etiquetas.adicAntiEnergia"
      ,"Ad6.TipoAtaque.noMelee": "Ad6.Etiquetas.adicNoMelee"
      ,"Ad6.TipoAtaque.frio":    "Ad6.Etiquetas.adicFrio"
      ,"Ad6.TipoAtaque.ligero":  "Ad6.Etiquetas.adicLigero"
      ,"Ad6.TipoAtaque.area":    "Ad6.Etiquetas.adicArea"
    };
    return game.i18n.localize(mapa[descriptor] || "");
  });

    Handlebars.registerHelper("calcularVelocidad", function(velocidad,motores)
  {
      if((velocidad===undefined)||(motores===undefined)) return;

      let resultado = velocidad;
      let valorMotores = Number(motores.replace('%', '').trim());             
      // Busca el primer número en la cadena
      const regex = /^([^\d]*)(\d+)(.*)$/;
      const match = velocidad.match(regex);
      
      if (match) {
        let antes = match[1];
        let numero = parseInt(match[2])
        
        numero = Math.floor(numero*valorMotores/100);
        let despues = match[3]
        resultado = antes + numero + " " + despues;
      }
      return resultado;
  });

                        // Helper: ¿esta tirada es "atacable"? (muestra el botón de ataque)
   //   true si la tirada está en la fase "operacionesAtacar", o si está en la
   //   superfase "operaciones" con sinergia (reparte éxitos).
   //   Requiere éxitos disponibles: sin ellos no hay nada que asignar, así que
   //   no se muestran ni Atacar ni Fuego concentrado.
   //   OJO: el SIGNIFICADO de la acción lo da "faseOriginal" (subfase de origen),
   //   NO "fase" (que tras ACELERAR apunta a la subfase de la macrofase destino).
   //   Así una acción de cinemática acelerada a operaciones NO se convierte en
   //   ataque. Si no hay "faseOriginal" (tiradas antiguas), se usa "fase".
   Handlebars.registerHelper("botonAtaque", function(t)
   {
      if (!t) return false;
      const exitos = Number(t.exitos ?? 0);
      if (exitos <= 0) return false;
      const faseOrigen = t.faseOriginal || t.fase;
      if (faseOrigen === "operacionesAtacar") return true;
      if (t.superFase === "operaciones" && t.sinergia === true) return true;
      return false;
   });

      // Helper: ¿esta tirada puede "PRESTAR DEFENSA"? Muestra el botón del
   // escudo. true si la tirada está en la fase "operacionesDefender" (con
   // éxitos disponibles) o si está en la superfase "operaciones" con sinergia
   // (resto reutilizable), y tiene al menos 1 éxito.
   //   Igual que botonAtaque, usa "faseOriginal" (significado real de la acción)
   //   con fallback a "fase" para tiradas antiguas.
      Handlebars.registerHelper("botonDefensa", function(t)
   {
      if (!t) return false;
      const exitos = Number(t.exitos ?? 0);
      if (exitos <= 0) return false;
      const faseOrigen = t.faseOriginal || t.fase;
      if (faseOrigen === "operacionesDefender") return true;
      if (t.superFase === "operaciones" && t.sinergia === true) return true;
      return false;
   });

   // Helper (SOLO PRESENTACIÓN): ¿debe MOSTRARSE el nombre del arma de una tirada?
   // No afecta a cómo se almacena nada: solo decide si el popup pinta el nombre.
   // Reglas:
   //   - Suit de equipo (arma.clase === "suitEquipo"): SIEMPRE.
   //   - Equipo/arma normal (arma.clase === "equipo"): solo en acciones de ataque
   //     o redirección, es decir:
   //         * subfase "operacionesAtacar"     -> sí
   //         * subfase "operacionesRedirigir"  -> sí
   //         * superfase "operaciones" con sinergia -> sí
   //     (En "operacionesDefender" NO, y en ninguna otra subfase/macrofase tampoco.)
   // Si la tirada no tiene arma con nombre, devuelve false (nada que mostrar).
   Handlebars.registerHelper("mostrarNombreArma", function(t)
   {
      if (!t) return false;
      const arma = t.arma;
      if (!arma) return false;
      if ((arma.nombre ?? "") === "") return false;   // sin arma, nada que mostrar

            // Suit de equipo -> se muestra siempre.
      if (arma.clase === "suitEquipo") return true;

      // Equipo (arma normal) -> solo ataque/redirigir o "operaciones" con sinergia.
      // Usa "faseOriginal" (significado real) con fallback a "fase" (antiguas).
      const faseOrigen = t.faseOriginal || t.fase;
      if (faseOrigen === "operacionesAtacar")     return true;
      if (faseOrigen === "operacionesRedirigir")  return true;
      if (t.superFase === "operaciones" && t.sinergia === true) return true;

      return false;
   });

      // Arrancamos el servicio de Asistencia: registra los hooks que abren/refrescan
   // la ventana compartida de Asistencia cuando cambian los pools.
   ServicioAsistencia.inicializarServicioAsistencia();

            // Arrancamos el servicio de Combate: hooks que abren/refrescan las ventanas
   // de ataque/defensa cuando se difunde un encuentro.
   ServicioCombate.inicializarServicioCombate();

      // Arrancamos el servicio de Iniciativa: mantiene sincronizado el estado
   // "derrotado" del combatiente con las reglas del sistema (fuera de combate).
      ServicioIniciativa.inicializarServicioIniciativa();





                        // Arrancamos el servicio de Fases: mantiene los Combatants de FASE
   // (una fila por tirada fijada) reconciliados con los slots de tirada
   // (tirada1/tirada2/tirada3).
   ServicioFases.inicializarServicioFases();

      // Arrancamos la presentación del tracker: oculta las filas de presencia y
      // decora las de fase (icono de macrofase, éxitos/sinergia y botones).
      TrackerFases.inicializarTrackerFases();

      // Reglas de TURNO: los botones de turno del tracker recorren la lista de
      // presencias, pero al llegar al final NO saltan de asalto (hacen wrap); el
      // asalto solo avanza con los botones de asalto. Se parchean únicamente
      // nextTurn/previousTurn del documento Combat (no nextRound/previousRound).
      ReglasTurno.inicializarReglasTurno();

   // Arrancamos la representación gráfica de los ENJAMBRES en el canvas: en
   // lugar del token por defecto, pinta una imagen-token por cada unidad de la
   // formación (tomada del TOKEN del actor referenciado), en una rejilla
   // aleatoria centrada en la huella del token.
   RepresentacionEnjambre.inicializarRepresentacionEnjambre();

});

// --------------------------------------------------------------------------
// PERMITIR A JUGADORES ARRASTRAR SUS PROPIOS ACTORES DESDE EL SIDEBAR
// --------------------------------------------------------------------------
// En Foundry v14 ya NO existe DragDrop._canDrag (el controller tiene ahora
// can(action, selector) + permissions, y _handleDragStart). Pero el bloqueo
// real es más simple: el ActorDirectory solo marca `draggable` la fila del
// actor cuando el usuario es GM. Sin ese atributo, el navegador NI SIQUIERA
// inicia el dragstart, así que ningún hook de Foundry llega a evaluarse.
//
// Solución (sin parchear prototipos ni tocar el core): tras cada render del
// directorio, marcamos como `draggable` las filas de los actores de los que
// el usuario es dueño (isOwner) y adjuntamos, en fase de CAPTURA, el relleno
// del dataTransfer con el payload {type:"Actor", uuid} que Foundry lee al
// soltar. Con esto, un jugador puede arrastrar su personaje hasta la hoja de
// un vehículo (cuyo _onDrop ya acepta data.type === "Actor").
Hooks.on("renderActorDirectory", (app, html) =>
{
  // Normalizamos el contenedor raíz (distintas versiones dan HTMLElement,
  // jQuery o una colección).
  const root = (html instanceof HTMLElement)
    ? html
    : (app?.element ?? html?.[0] ?? null);
  if (!root) return;

  root.querySelectorAll(".directory-item[data-entry-id]").forEach(row =>
  {
    const actor = game.actors?.get(row.dataset.entryId);
    // Solo hacemos arrastrables los actores que el usuario PUEDE editar/posee.
    if (!actor || !actor.isOwner) return;

    row.setAttribute("draggable", "true");

    // Evita duplicar el listener si el directorio se re-renderiza.
    if (row.dataset.ad6Draggable === "1") return;
    row.dataset.ad6Draggable = "1";

    // En CAPTURA: rellenamos el dataTransfer antes de que el controller de
    // Foundry lo lea (su _handleDragStart hace stopPropagation si ya hay
    // items, de modo que garantizamos que el drop se dispare).
        row.addEventListener("dragstart", (ev) =>
    {
      const payload = { type: "Actor", uuid: actor.uuid };
      const json = JSON.stringify(payload);
      ev.dataTransfer.effectAllowed = "copyMove";
      ev.dataTransfer.setData("text/plain", json);
      // Algunas versiones de Foundry leen este formato alternativo:
      ev.dataTransfer.setData("application/json", json);
    }, true);
  });
});

// --------------------------------------------------------------------------
// TODOS LOS ACTORES NUEVOS NACEN CON TOKEN VINCULADO (actorLink = true)
// --------------------------------------------------------------------------
// Regla del sistema: la ficha del token y la ficha de la lista de actores deben
// ser LA MISMA (una única fuente de verdad). Esto es imprescindible para el
// estado de ronda compartido (tiradas, defensas, encuentros de combate): si un
// token NO está vinculado, al abrir su ficha desde el token se trabaja sobre un
// Actor SINTÉTICO con su propio delta, y los cambios no llegan al actor del
// mundo. Forzando actorLink=true en la creación, todos los actores (a mano,
// desde compendio, por importación o duplicando) nacen ya vinculados.
//
// Se hace en preCreateActor (se dispara en TODO Actor.create, incluidos los del
// compendio drag-drop) para que sea el valor por defecto del sistema sin tener
// que tocar cada DataModel. Respetamos un valor explícito si ya viniera dado.
Hooks.on("preCreateActor", (actor, data, options, userId) =>
{
    // Los ENJAMBRES nacen con un token cuadrado anclado en (0,0) en la ficha
  // prototipo (3x3 de partida; el tamaño real 3x3/5x5 se fija al crear el token
  // en escena, según el número de unidades de la formación).
  if (data?.type === "enjambre")
  {
    actor.updateSource({
      "prototypeToken.width": 3,
      "prototypeToken.height": 3,
      "prototypeToken.texture.anchorX": 0,
      "prototypeToken.texture.anchorY": 0
    });
  }

  // Si quien crea ya fijó actorLink explícitamente, lo respetamos.
  const yaDefinido = foundry.utils.getProperty(data, "prototypeToken.actorLink");
  if (yaDefinido !== undefined) return;

  actor.updateSource({ "prototypeToken.actorLink": true });
});

// Refuerzo para actores ANTIGUOS (creados antes de esta regla): al arrastrar un
// actor a la escena se crea el Token desde su prototypeToken. Si ese prototipo
// aún tiene actorLink=false, forzamos el vínculo en el token recién creado para
// que también esos actores funcionen con una única fuente de verdad.
Hooks.on("preCreateToken", (tokenDoc, data, options, userId) =>
{
  // Solo tocamos tokens de escena que apunten a un Actor (no tiles/etc.).
  if (!tokenDoc.actorId && !tokenDoc.actor) return;

    // Los tokens de ENJAMBRE se crean con huella NxN (3x3 si <=9 unidades, 5x5 si
  // >=10) y anclados en (0,0), sea cual sea el prototypeToken del actor. Así su
  // representación (una casilla por unidad) encaja exacta en la huella.
  const esEnjambre = tokenDoc.actor?.type === "enjambre";
  if (esEnjambre)
  {
    const total = (tokenDoc.actor?.system?.formacion ?? [])
      .reduce((s, m) => s + (Number(m?.cantidad) || 0), 0);
    const lado = (total >= 10) ? 5 : 3;

    tokenDoc.updateSource({
      width: lado,
      height: lado,
      "texture.anchorX": 0,
      "texture.anchorY": 0
    });
  }

  const yaDefinido = foundry.utils.getProperty(data, "actorLink");
  if (yaDefinido !== undefined) return;

  tokenDoc.updateSource({ actorLink: true });
});
