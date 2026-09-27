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

  /**
   * Sincroniza la cantidad de DADOS del actor con el VALOR del conflicto.
   *
   * Regla: cada vez que cambia system.valor en el panel de Vitales, system.dados
   * (que es lo que muestra el parcial de Tirada) pasa a valer EXACTAMENTE lo mismo.
   *
   * Se engancha en _onChangeForm (se dispara con el cambio de cualquier campo del
   * formulario, gracias a submitOnChange). Para el campo "system.valor" NO se
   * delega en super: se escribe valor y dados en un ÚNICO update (un solo
   * re-render). La sincronización queda AISLADA a esta hoja y no afecta a ningún
   * otro tipo de actor.
   *
   * @override
   */
  _onChangeForm(formConfig, event) {
    const target = event?.target;

    // ¿Es el campo "valor" del conflicto? (input name="system.valor")
    const esValor = target?.name === "system.valor";

    if (esValor) {
      // Normalizamos a número (el input llega como string; vacío -> null).
      const crudo = target.value;
      const nuevo = (crudo === "" || crudo === null || crudo === undefined)
        ? null
        : Number(crudo);

      // Guardamos valor + dados en UNA sola operación (un único re-render) y
      // evitamos el submit nativo de este campo, que haría un update aparte.
      // Importante: NO llamamos a super() en este caso para no duplicar el
      // guardado de system.valor.
      this.actor.update({
         "system.valor": nuevo
        ,"system.dados": nuevo
      });
      return;
    }

    // Cualquier otro campo: comportamiento normal del formulario.
    return super._onChangeForm(formConfig, event);
  }
}
