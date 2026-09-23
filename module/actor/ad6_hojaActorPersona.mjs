import { Ad6_HojaActor } from './ad6_hojaActor.mjs';

export class Ad6_HojaActorPersona extends Ad6_HojaActor {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["my-system", "sheet", "actor"],
        position: {
      width: 600,
      height: 800
    },

    // Define the form parts that compose your sheet layout
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
       tirarDados: this._onTirarDados
      ,borrarTirada: this._onBorrarTirada      
      ,clickMejorado: this._onClickMejorado
      ,clickEndurecido1: this._onClickEndurecido1
      ,clickEndurecido2: this._onClickEndurecido2
      ,clickHerida: this._onClickHerida
      ,clickClon: this._onClickClon
      ,editarClones: this._onEditarClones


    }
  };

  
  static PARTS = {  // no importa porque este actor no se renderiza, lo tenemos para heredar métidos y factorizar código
    header: {
      template: "systems/ad6_robotech/templates/header.hbs"
    }};

  
  
  // para cambiar el estado de las heridas de los clones. (principal y teniente)
  static async _onClickClon(event,target)
  {
    const indice = Number(target.dataset.indice);
    const actor = this.actor;
    let siguiente =-1;
    const clones = foundry.utils.deepClone(
      actor.system.clones ?? []
    );
    const heridas = clones[indice].heridas;
    siguiente = (heridas + 3) % 4;
    clones[indice].heridas = siguiente;

    this.agregarUpdates("system.clones", clones);
    this.actualizar();
  }

  static async _onEditarClones(event,target)
  {
    const actor = this.actor;

    const clones = foundry.utils.deepClone(
      actor.system.clones ?? []
    );

    const content = await foundry.applications.handlebars.renderTemplate(
          "systems/ad6_robotech/templates/dialogo/editarClones.hbs", { clones });

    new foundry.applications.api.DialogV2({
          window: {
            title: game.i18n.localize("Ad6.Mensajes.Clon.editar"),
            resizable: false
          },

          content,

    buttons: [
      {
        action: "guardar",
        label: game.i18n.localize("Ad6.Etiquetas.guardar"),
        icon: "fa-solid fa-floppy-disk",
        default: true,

        callback: async (event, button, dialog) => {
          const form = button.form;

          const nombreClon1 = form.elements["nombreClon1"].value.trim();
          const nombreClon2 = form.elements["nombreClon2"].value.trim();
          const heridasClon1 = form.elements["heridasClon1"].value.trim();
          const heridasClon2 = form.elements["heridasClon2"].value.trim();
          await actor.update({
            "system.clones.0.nombre": nombreClon1,
            "system.clones.0.heridas": heridasClon1,
            "system.clones.1.nombre": nombreClon2,
            "system.clones.1.heridas": heridasClon2
          });

          ui.notifications.info(
            game.i18n.localize("Ad6.Mensajes.Clon.actualizados")
          );

          return true;
        }
      },

      {
        action: "cancelar",
        label: game.i18n.localize("Ad6.Etiquetas.cancelar"),
        icon: "fa-solid fa-xmark"
      }
    ]
  }).render({
    force: true
  });

  }


  /** @override */
  async _onDrop(event) {
    // Si el drop es un item de tipo "upgrade" (Mejora), se añade al actor y se
    // EQUIPA automáticamente (la gestión vive en la base, compartida con el
    // vehículo). En cualquier otro caso, comportamiento nativo.
    if (await this._gestionarDropUpgrade(event)) return;
    return super._onDrop(event);
  }

  // esto se dispara cuando cambia el formulario (duh!)
  // para cambiar las cosas cuando se cambia la raza (principal y teniente)
  _onChangeForm(formConfig, event) {
    const target = event.target;

    // si el target que genera el change tiene el tag de abajo
    // que yo lo puse en el select de especie
    if (target.matches("[data-especie-select]")) {
        // reseteo las heriadas para que no se joda
        // por algún error
        this._onChangeEspecie(target.value);
    }

    return super._onChangeForm(formConfig, event);
  } 

  // Resetea el tema de las heridas y el resiste propio de las heridas
  // para su valor original según especie

  setearHeridas(heridas,visibles)
  {
    for(let i = 0; i < heridas.length; i++)
    {
      heridas[i].marcado = false;
      heridas[i].visible = visibles.includes(i);
    }
  }
  // Función que hace la pega de cambiar la especie (el onChangeForm detecta y levanta esto)
  async _onChangeEspecie(especie)
  {
    const actor = this.actor;
    const heridas = foundry.utils.deepClone(
      actor.system.heridas ?? []
    );
    let visibles;
    /* cosas comunes reseteo común al cambiar especie */
    actor.system.heridasParams.armadura.resiste = 0;
    actor.system.heridasParams.mejorado = false;
    actor.system.heridasParams.endurecido.nivel1 = false;
    actor.system.heridasParams.endurecido.nivel2 = false;
    // esto en preparación por si es necesario, y para estandarizar el código
    const resistencias = foundry.utils.deepClone(
      actor.system.heridasParams.armadura.resistencias
    );
    actor.system.heridasParams.armadura.valor="0";
    actor.system.heridasParams.armadura.restante="0";
    for(let i =0; i < resistencias.length; i++)
    {
         resistencias[i].adicional = 0;
    }

    /* cosas específicas de cada especie */
    switch(especie)
    {
      case "humano": 
      case "tiresio": 
      case "invid": 
      case "praxiana":
      case "peryton":
        actor.system.heridasParams.valorHeridas = "L";
        visibles = [3,4,5];
        break;
      case "zentraedi": 
        actor.system.heridasParams.valorHeridas = "5L";
        visibles = [3,4,5];
      break;
      case "spheris": 
        actor.system.heridasParams.valorHeridas = "3L";
        actor.system.heridasParams.armadura.valor ="3";
        actor.system.heridasParams.armadura.restante ="3";
        actor.system.heridasParams.armadura.tipo ="L";

        resistencias[0].adicional = 2;
        actor.system.heridasParams.armadura.resiste = 1;
        visibles = [3,4,5];
        break;
      case "garuda": 
        visibles = [4,5];
        actor.system.heridasParams.valorHeridas = "L";  
        break;
      case "karbarrano": 
        actor.system.heridasParams.valorHeridas = "L";
        actor.system.heridasParams.armadura.valor ="1";
        actor.system.heridasParams.armadura.restante ="1";
        actor.system.heridasParams.armadura.tipo ="L";
        actor.system.heridasParams.armadura.resiste = 1;
        visibles = [2,3,4,5,6];
        break;
      case "haydonita":
        visibles = [3,4,5];
        actor.system.heridasParams.valorHeridas = "L";
        actor.system.heridasParams.armadura.valor ="3";
        actor.system.heridasParams.armadura.restante ="3";
        actor.system.heridasParams.armadura.tipo ="L";
        actor.system.heridasParams.armadura.resiste = 1;
        break;
    }

    // setear las heridas dependiendo de los datos
    this.setearHeridas(heridas,visibles);

    // Actualizar datos    
    this.agregarUpdates("system.heridas",heridas);
    this.agregarUpdates("system.heridasParams.valorHeridas",actor.system.heridasParams.valorHeridas);
    this.agregarUpdates("system.heridasParams.armadura.resiste",actor.system.heridasParams.armadura.resiste);
    this.agregarUpdates("system.heridasParams.armadura",actor.system.heridasParams.armadura);
    this.agregarUpdates("system.heridasParams.mejorado",actor.system.heridasParams.mejorado);
    this.agregarUpdates("system.heridasParams.endurecido.nivel1",actor.system.heridasParams.endurecido.nivel1);
    this.agregarUpdates("system.heridasParams.endurecido.nivel2",actor.system.heridasParams.endurecido.nivel2);
    this.agregarUpdates("system.heridasParams.armadura.armadura",actor.system.heridasParams.armadura.armadura);
    this.agregarUpdates("system.heridasParams.armadura.resistencias",resistencias);
    this.actualizar();
  }

  // acción de clickear en una herida propio de actor principal y teniente y teniente
  static async _onClickHerida(event,target)
  {
    event.preventDefault();
    const indice = Number(target.dataset.indice);
    const actor = this.actor;
    const heridas = foundry.utils.deepClone(
        actor.system.heridas ?? []
    );
    heridas[indice].marcado = !heridas[indice].marcado;
    this.agregarUpdates("system.heridas",heridas);
    this.actualizar();
  }

  // acción de pinchar en mejorado (heridas) propio de actor principal y teniente
  static async _onClickMejorado(event,target)
  {
    
    const actor = this.actor;
    const valor = target.dataset.valor;   
    const heridas = foundry.utils.deepClone(
      actor.system.heridas ?? []
    );
    
    heridas[0].marcado = false;   
    heridas[0].visible = (valor=="false");
    this.agregarUpdates("system.heridas",heridas);
    this.actualizar();
  }
// acción de pinchar en endurecido1 (heridas) propio de actor principal y teniente
  static async _onClickEndurecido1(event,target)
  {
    const actor = this.actor;
    const valor = target.dataset.valor;  
    const heridas = foundry.utils.deepClone(
      actor.system.heridas ?? []
    );
    const resistencias = foundry.utils.deepClone(
      actor.system.heridasParams.armadura.resistencias
    );
    if(valor=="false") // cuando es false por algún motivo, está pulsado
    {
      switch(actor.system.especie)
      {
        case "humano":    // primer nivel 2 heridas brawl nuevas
        case "tiresio": 
        case "garuda":
        case "peryton":
        case "praxiana":
        {
          heridas[1].marcado = false; heridas[1].visible = true;
          heridas[2].marcado = false; heridas[2].visible = true;
          break;
        }
        case "zentraedi": // una herida brawl más, y una armadura 2L (reloaded)
        {
          heridas[2].marcado = false; heridas[2].visible = true;
          actor.system.heridasParams.armadura.valor ="2";
          actor.system.heridasParams.armadura.restante ="2";
          actor.system.heridasParams.armadura.tipo ="L";

          break;
        }
        case "invid":
        case "karbarrano":
        {
          actor.system.heridasParams.armadura.resiste++;          
          break;
        }
        case "spheris":{
          heridas[2].marcado = false; heridas[2].visible = true;
          heridas[6].marcado = false; heridas[6].visible = true;
          break;
        }
        case "haydonita":
        {
          
          actor.system.heridasParams.armadura.valor ="5";
          actor.system.heridasParams.armadura.restante ="5";
          actor.system.heridasParams.armadura.tipo ="L";

          break;
        }

      }
    }
    else
    {
      switch(actor.system.especie)
      {
        case "humano":    // primer nivel 2 heridas brawl nuevas
        case "tiresio": 
        case "garuda":
        case "peryton":
        case "praxiana":
        {
          heridas[1].marcado = false; heridas[1].visible = false;
          heridas[2].marcado = false; heridas[2].visible = false;
          break;
          
        }
        case "zentraedi": // una herida brawl más, y le quitamos la armadura
        {
          heridas[2].marcado = false; heridas[2].visible = false;
          actor.system.heridasParams.armadura.valor ="0";
          actor.system.heridasParams.armadura.restante ="0";
          actor.system.heridasParams.armadura.tipo =""

          break;
        }
        case "invid":
        case "karbarrano":
        {
          actor.system.heridasParams.armadura.resiste--;          
          break;
        }
        case "spheris":{
          heridas[2].marcado = false; heridas[2].visible = false;
          heridas[6].marcado = false; heridas[6].visible = false;
          break;
        }        
        case "haydonita":
        {
          actor.system.heridasParams.armadura.valor ="3";
          actor.system.heridasParams.armadura.restante ="3";
          actor.system.heridasParams.armadura.tipo ="L";

          break;
        }
        
      }
    }
    this.agregarUpdates("system.heridas",heridas);
    this.agregarUpdates("system.heridasParams.armadura.resiste",actor.system.heridasParams.armadura.resiste);
    this.agregarUpdates("system.heridasParams.armadura",actor.system.heridasParams.armadura);
    this.actualizar();
  }

// acción de pinchar en endurecido2 (heridas) propio de actor principal y teniente
  static async _onClickEndurecido2(event,target)
  {
    const actor = this.actor;
    const valor = target.dataset.valor;  
    const heridas = foundry.utils.deepClone(
      actor.system.heridas ?? []
    );
    const resistencias = foundry.utils.deepClone(
      actor.system.heridasParams.armadura.resistencias
    );    
    if(valor=="false") // cuando es false por algún motivo, está pulsado
    {
      switch(actor.system.especie)
      {
        case "humano": // segundo nivel una herida C
        case "tiresio": 
        case "praxiana":
        case "peryton":
        {
          heridas[6].marcado = false; heridas[6].visible = true;
          break;
        }
        case "karbarrano":
        {
          heridas[1].marcado = false; heridas[1].visible = true;
          break;
        }        
        case "garuda": // un nivel de C y resistencia 1 al frío
        {
          heridas[6].marcado = false; heridas[6].visible = true;
          resistencias[2].adicional = 1;
          break;          
        }
        case "spheris": // +1 resist +1 armadura
        {
          actor.system.heridasParams.armadura.resiste++;
          actor.system.heridasParams.armadura.valor ="4";
          actor.system.heridasParams.armadura.restante ="4";
          actor.system.heridasParams.armadura.tipo ="L";
          break;
        }
        case "zentraedi": // cambiar las heridas a tipo mecha
        {
          actor.system.heridasParams.valorHeridas = "M";
          break;
        }
        case "invid": // +1 resist
        {
          actor.system.heridasParams.armadura.resiste++;          
          break;
        }
        case "haydonita":
        {
          actor.system.heridasParams.armadura.resiste += 2;
          break;
        }

      }
    }
    else
    {
      switch(actor.system.especie)
      {
        case "humano": // se saca la herida C adicional
        case "tiresio": 
        case "praxiana":
        case "peryton":
        {
          heridas[6].marcado = false; heridas[6].visible = false;
          break;
        }
        case "karbarrano":  // se saca la herida adicional
        {
          heridas[1].marcado = false; heridas[1].visible = false;
          break;
        }        
        case "garuda": // se saca la herida crítica y la resistencia al frío
        {
          heridas[6].marcado = false; heridas[6].visible = false;
          resistencias[2].adicional = 0;
          break;          
        }
        case "spheris": // -1 resist -1 armadura
        {
          actor.system.heridasParams.armadura.resiste--;
                    actor.system.heridasParams.armadura.valor ="3";
          actor.system.heridasParams.armadura.restante ="3";
          actor.system.heridasParams.armadura.tipo ="L";

          break;
        }
        case "zentraedi": // cambiar las heridas a tipo L de nuevo
        {
          actor.system.heridasParams.valorHeridas = "5L";
          break;
        }
        case "invid": // -1 resist
        {
          actor.system.heridasParams.armadura.resiste--;          
          break;
        }
        case "haydonita":
        {
          actor.system.heridasParams.armadura.resiste -= 2;
          break;
        }

      }      
    }
    this.agregarUpdates("system.heridas",heridas);
    this.agregarUpdates("system.heridasParams.armadura",actor.system.heridasParams.armadura);
    this.agregarUpdates("system.heridasParams.armadura.resiste",actor.system.heridasParams.armadura.resiste);
    this.agregarUpdates("system.heridasParams.valorHeridas",actor.system.heridasParams.valorHeridas);
    this.agregarUpdates("system.heridasParams.armadura.resistencias",resistencias);

    this.actualizar();
  }




}