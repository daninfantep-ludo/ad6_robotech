import {Ad6_HojaActor} from './ad6_hojaActor.mjs'

/*
 * Hoja del actor de tipo "conflicto".
 *
 * Pantalla con TRES partes:
 *   - conflictoVitales : datos principales del conflicto (vitales).
 *   - tirada           : reutiliza el partial parcialTirada.hbs (misma cabecera
 *                        de tirada que el resto de actores: selects tipo/fase,
 *                        dados, botón tirar y botón borrar tirada).
 *   - notas            : partial parcialNotas.hbs, que ABSORBE el alto sobrante
 *                        de la ventana (scoped a .ad6-conflicto, ver CSS).
 *
 * Hereda de Ad6_HojaActor (la base), que ya aporta:
 *   - _onTirarDados / _onBorrarTirada (actions tirarDados / borrarTirada)
 *   - _prepareContext (config, system, tiradasFijadas, bloquearFase, tabs...)
 *   - el registro de los listeners .change / .chk-change
 * No necesita ninguna de las acciones específicas de "persona"
 * (heridas, clones, mejorado...), por eso NO hereda de Ad6_HojaActorPersona.
 */
export class Ad6_HojaActorConflicto extends Ad6_HojaActor
{
  static DEFAULT_OPTIONS = {
    // La clase "ad6-conflicto" permite aplicar estilos ESPECÍFICOS de esta hoja
    // (p. ej. que el panel de tirada no se estire) sin afectar al resto.
     classes: ["my-system", "sheet", "actor", "ad6-conflicto"]
    ,position: {
      width: 500,
      height: 600
    }
    ,form: {
      submitOnChange: true,
      closeOnSubmit: false
    }
  };

  /** @override */
  static PARTS = {
    conflictoVitales: {
      template: "systems/ad6_robotech/templates/actor/conflictoVitales.hbs"
    }
    // La tirada usa un WRAPPER propio (conflictoTirada.hbs) que envuelve el
    // partial compartido parcialTirada.hbs y permite ajustar su alto SOLO aquí.
    ,tirada: {
      template: "systems/ad6_robotech/templates/actor/conflictoTirada.hbs"
    }
    ,notas: {
      template: "systems/ad6_robotech/templates/actor/parcialNotas.hbs"
    }};
}