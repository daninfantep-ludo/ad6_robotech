import {Ad6_HojaActorPersona} from './ad6_hojaActorPersona.mjs'

export class Ad6_HojaActorConflicto extends Ad6_HojaActorPersona
{
/** @override */
  static PARTS = {
    header: {
      template: "systems/ad6_robotech/templates/conflicto.hbs"
    }};
}