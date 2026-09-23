import {Ad6_HojaActorPersona} from './ad6_hojaActorPersona.mjs'
import {Ad6} from '../config.mjs'
import * as Func from '../../model/funciones.mjs'

export class Ad6_HojaActorTeniente extends Ad6_HojaActorPersona
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
      width: 750,
      height: 560
    }

    ,form: {
      closeOnSubmit: false,
      submitOnChange: true
    }

  };

  static PARTS = {
    vitales: {
       template: "systems/ad6_robotech/templates/actor/tenienteVitales.hbs"
    }
    ,tirada:
    {
      template: "systems/ad6_robotech/templates/actor/tenienteTiradaHeridas.hbs"
    }
    ,tabs: 
    {
        template: "systems/ad6_robotech/templates/actor/principalTabsNavegacion.hbs"
    }
    ,habilidades: {
        template: "systems/ad6_robotech/templates/actor/tenienteTabHabilidades.hbs",
        scrollable: [".tab-content"]
    }
    ,equipo: {
        template: "systems/ad6_robotech/templates/actor/tabEquipo.hbs",
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
                { id: "equipo", label: "Equipo" },
                { id: "notas", label: "Notas" }
            ],
            initial: "habilidades"
        }
    };

  // esto se dispara cuando cambia el formulario (duh!)
  // para cambiar las cosas cuando se cambia el tipo de Teniente
  _onChangeForm(formConfig, event) {
    const target = event.target;

    // si el target que genera el change tiene el tag de abajo
    // que yo lo puse en el select de tipo de teniente
    if (target.matches("[data-tipoTeniente-select]")) {

        this._onChangeTipoTeniente(this.actor.system.carrera, target.value);
    }
    if (target.matches("[data-carreraTeniente-select]")) {

        this._onChangeTipoTeniente(target.value, this.actor.system.tipoTeniente);
    }

    return super._onChangeForm(formConfig, event);
  } 

  async _onChangeTipoTeniente(carrera,teniente)
  {
    // cambia el elemento
    this.agregarUpdates("system.elemento",game.i18n.format(foundry.utils.getProperty(Ad6,"TenienteElemento." + carrera)));
    // cambia los valores
    let cadena = "Tenientes." + teniente + "." + carrera;
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




}