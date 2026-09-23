/**
 * Cálculo de DAÑO a un ENJAMBRE (módulo PURO, sin estado ni documentos)
 * ============================================================================
 * Un ENJAMBRE (actor type "enjambre") agrupa unidades IDÉNTICAS en su
 * "formación" (system.formacion = array de Ad6_MiembroEnjambre). Cada miembro:
 *   - cantidad          : nº de unidades de ese tipo.
 *   - armaduraPrincipal : Ad6_Proteccion (ARMADURA: absorbe daño, NO se consume).
 *   - armaduraSecundaria: Ad6_Proteccion (escudo de PRIMERA imputación; CADA
 *                         unidad tiene SU PROPIO escudo).
 *   - estructura / tipo : estructura POR UNIDAD, en la escala "tipo" (L/M/N).
 *
 * REGLA CLAVE (acordada):
 *   Al enjambre NO se le consume NADA (ni armadura, ni escudo, ni estructura).
 *   Todas las unidades son idénticas y están "enteras" o "derrotadas" (sin
 *   estado intermedio). Por eso el coste de destruir UNA unidad es un valor FIJO
 *   (su "vida" total) y el cálculo se reduce a una DIVISIÓN ENTERA:
 *
 *       unidadesDestruidas = min( cantidad, floor( dañoTotal / costeUnidad ) )
 *
 * La ARMADURA principal SÍ se aplica (resistencias por descriptor y penetración,
 * esta SOLO si la escala de la armadura coincide con la del daño), pero como no
 * se consume su valor efectivo se calcula UNA vez por miembro y se suma al
 * coste. El ESCUDO se suma también una vez (cada unidad lo tiene completo).
 *
 * ESCALA DE REFERENCIA DEL CÁLCULO (importante):
 *   Para comparar daño y coste NO se fuerza todo a L. Se toma como referencia
 *   la ESCALA DE LA ARMADURA PRINCIPAL del miembro objetivo (si no tiene
 *   armadura, la de su estructura). Así el log y la división entera se expresan
 *   en la MISMA escala que el blanco (p.ej. daño 3M vs coste 30M -> 0 unidades,
 *   en vez de hablar de "30L ÷ 30L"). Esto es más legible y evita residuos
 *   artificiales de escala.
 *
 * Todo el código y los comentarios están en castellano a propósito.
 */

import * as Calculo from './ad6_calculoDano.mjs';
import { t, anidar } from './ad6_log.mjs';

/**
 * FORMATEA una cantidad (que puede quedar con decimales en su escala, p.ej.
 * 1.5M al sumar 1M + 5L) como TEXTO de escalas mixtas SIN decimales, p.ej.
 * "1M + 5L". Internamente el cálculo puede usar el número con decimales; esto
 * es SOLO presentación, para el log.
 *
 * Funciona apoyándose en Calculo.sumarDanos(), que agrupa de 10 en 10 y
 * devuelve pares enteros; así "1.5M" -> [{1,"M"},{5,"L"}] -> "1M + 5L".
 *
 * @param {number} valor  cantidad en la escala indicada (admite decimales).
 * @param {"L"|"M"|"N"} escala
 * @returns {string}
 */
export function formatearEnEscala(valor, escala)
{
  const v = Number(valor) || 0;
  if (v === 0) return "0";
  // Si es entero en su escala, lo mostramos tal cual (más legible).
  if (Number.isInteger(v)) return `${v}${escala}`;
  // Con decimales: lo expresamos en escalas mixtas sin fracciones.
  return Calculo.formatearDano(Calculo.sumarDanos([{ cantidad: v, tipo: escala }]));
}

/**
 * COSTE TOTAL DE DESTRUIR UNA UNIDAD de un miembro de la formación, expresado
 * en la ESCALA DE REFERENCIA del propio miembro (la de su armadura principal;
 * si no la tiene, la de su estructura). Junto con su desglose para el log.
 *
 * El coste es simplemente la suma de lo que hay que "atravesar" (nada se
 * consume aquí):
 *   1) armaduraSecundaria (escudo), si tiene restante > 0.
 *   2) armaduraPrincipal EFECTIVA (base + resistencias − penetración aplicable).
 *   3) estructura (en la escala miembro.tipo).
 *
 * Todos los sumandos se convierten a la ESCALA DE REFERENCIA para poder comparar
 * contra el daño (también llevado a esa misma escala).
 *
 * @param {object} miembro    Miembro de la formación (Ad6_MiembroEnjambre plano).
 * @param {object} atributos  { danoEnergia, danoMelee, danoLigero, tieneArea,
 *                              tipoDano, penetracionFinal }.
 * @returns {{
 *   coste:number,                // coste total por unidad, en escala "escala"
 *   escudoCoste:number,          // aporte del escudo (escala)
 *   armaduraCoste:number,        // aporte de la armadura efectiva (escala)
 *   estructuraCoste:number,      // aporte de la estructura (escala)
 *   escala:"L"|"M"|"N",          // escala de referencia del cálculo
 *   tipoEstructura:"L"|"M"|"N",  // escala de la estructura
 *   tipoArmadura:string|null,    // escala de la armadura principal (o null)
 *   tipoEscudo:string|null,      // escala del escudo (o null)
 *   armaduraDetalle:object|null, // salida de calcularArmaduraEfectiva (o null)
 *   detalle:string[]
 * }}
 */
export function costeUnidadMiembro(miembro, atributos = {})
{
  const detalle = [];
  const tipoEstructura = Calculo.normalizarEscala(miembro?.tipo) ?? "L";

  // --- Armadura principal EFECTIVA (no se consume) ---
  const armadura = miembro?.armaduraPrincipal ?? {};
  // El cálculo espera la armadura sobre "restante". En el miembro la armadura no
  // se consume: usamos su "restante" y, si viniera vacío, caemos a "valor".
  const valorArmadura = (Number(armadura.restante) || 0) > 0
    ? Number(armadura.restante)
    : (Number(armadura.valor) || 0);

  let armaduraValor = 0;
  let tipoArmadura = null;
  let armaduraDetalle = null;

  if (valorArmadura > 0 && Calculo.normalizarEscala(armadura.tipo))
  {
    const proteccion = {
       tipo: armadura.tipo
      ,restante: valorArmadura
      ,resiste: Number(armadura.resiste) || 0
      ,ablativa: armadura.ablativa === true
      ,resistencias: armadura.resistencias ?? []
    };
    armaduraDetalle = Calculo.calcularArmaduraEfectiva(proteccion, atributos);
    tipoArmadura = armaduraDetalle.tipo;
    if (tipoArmadura) armaduraValor = Number(armaduraDetalle.armaduraFinal) || 0;
  }

  // --- ESCALA DE REFERENCIA: la de la armadura principal; si no, la estructura ---
  const escala = tipoArmadura ?? tipoEstructura;

  // --- 1) Escudo / armadura secundaria (primera imputación) ---
  const escudo = miembro?.armaduraSecundaria ?? {};
  const tipoEscudo = Calculo.normalizarEscala(escudo.tipo);
  const escudoRestante = Number(escudo.restante) || 0;
  let escudoCoste = 0;
  if (escudoRestante > 0 && tipoEscudo)
  {
    escudoCoste = Calculo.convertirEscala(escudoRestante, tipoEscudo, escala);
    detalle.push(t("Ad6.Log.escudo", { valor: escudoRestante, escala: tipoEscudo }));
  }

  // --- 2) Armadura principal efectiva (a la escala de referencia) ---
  let armaduraCoste = 0;
  if (tipoArmadura)
  {
    armaduraCoste = Calculo.convertirEscala(armaduraValor, tipoArmadura, escala);
    detalle.push(t("Ad6.Log.armaduraEfectivaConDetalle", {
       valor: armaduraValor
      ,escala: tipoArmadura
      ,detalle: (armaduraDetalle?.bonos
          ? t("Ad6.Log.armaduraEfectivaDetalle", {
               base: armaduraDetalle.base
              ,escala: tipoArmadura
              ,bonos: armaduraDetalle.bonos
              ,penetracion: (armaduraDetalle.penetracionAplicada
                  ? t("Ad6.Log.armaduraEfectivaDetallePen", { penetracion: armaduraDetalle.penetracionAplicada })
                  : "")
            })
          : "")
    }));
  }
  else
  {
    detalle.push(t("Ad6.Log.sinArmaduraPrincipal"));
  }

  // --- 3) Estructura (por unidad, en su escala) ---
  const estructura = Number(miembro?.estructura) || 0;
  const estructuraCoste = Calculo.convertirEscala(estructura, tipoEstructura, escala);
  detalle.push(t("Ad6.Log.estructura", { valor: estructura, escala: tipoEstructura }));

  const coste = escudoCoste + armaduraCoste + estructuraCoste;
  detalle.push(t("Ad6.Log.costePorUnidad", {
     escudo:      formatearEnEscala(escudoCoste, escala)
    ,armadura:    formatearEnEscala(armaduraCoste, escala)
    ,estructura:  formatearEnEscala(estructuraCoste, escala)
    ,total:       formatearEnEscala(coste, escala)
  }));

  return {
     coste
    ,escudoCoste
    ,armaduraCoste
    ,estructuraCoste
    ,escala
    ,tipoEstructura
    ,tipoArmadura
    ,tipoEscudo
    ,armaduraDetalle
    ,detalle
  };
}

/**
 * DAÑO TOTAL (lista de pares {cantidad,tipo}) expresado en la escala indicada
 * (la escala de referencia del miembro). Simple acumulado, sin normalizar a
 * pares, para poder comparar de forma directa contra el coste por unidad.
 * @param {Array<{cantidad:number, tipo:string}>} listaDanos
 * @param {"L"|"M"|"N"} escala
 * @returns {number}
 */
export function danoTotalEnEscala(listaDanos, escala)
{
  const T = Calculo.normalizarEscala(escala) ?? "L";
  let total = 0;
  for (const d of (listaDanos ?? []))
  {
    if (!d) continue;
    const t = Calculo.normalizarEscala(d.tipo);
    if (!t) continue;
    total += Calculo.convertirEscala(Number(d.cantidad) || 0, t, T);
  }
  return total;
}

/**
 * DESTRUYE unidades COMPLETAS de UN miembro de la formación a partir de un daño
 * COMPUESTO. Como nada se consume dentro de una unidad y todas son idénticas, el
 * número de bajas es una DIVISIÓN ENTERA:
 *
 *   unidades = min( cantidad, floor( dañoTotal / costeUnidad ) )
 *
 * El daño y el coste se miden en la ESCALA DE REFERENCIA del miembro (la de su
 * armadura principal), de modo que la comparación se hace en la misma escala
 * que el blanco. El daño SOBRANTE que no completa el coste de una nueva unidad
 * se devuelve para el siguiente miembro (expresado como par, en la escala de
 * referencia, para no perder información: el sobrante es un residuo < coste).
 *
 * @param {Array<{cantidad:number, tipo:string}>} danoLista
 * @param {object} miembro    Miembro de la formación.
 * @param {object} atributos  { danoEnergia, danoMelee, danoLigero, tieneArea,
 *                              tipoDano, penetracionFinal }.
 * @returns {{
 *   unidades:number,          // unidades destruidas de este miembro
 *   danoConsumido:number,     // daño consumido por las bajas (escala ref.)
 *   danoRestante:Array,       // daño sobrante (lista de pares) para el siguiente
 *   coste:object,             // salida de costeUnidadMiembro
 *   detalle:string[]
 * }}
 */
export function unidadesDestruidasDeMiembro(danoLista, miembro, atributos = {})
{
  const detalle = [];
  const coste = costeUnidadMiembro(miembro, atributos);
  const cantidad = Math.max(0, Number(miembro?.cantidad) || 0);

  const escala = coste.escala;
  const total = danoTotalEnEscala(danoLista, escala);

  if (coste.coste <= 0 || cantidad <= 0 || total <= 0)
  {
    return {
       unidades: 0
      ,danoConsumido: 0
      ,danoRestante: Calculo.sumarDanos(danoLista ?? [])
      ,coste
      ,detalle
    };
  }

  // Bajas por división ENTERA, limitadas por las unidades presentes.
  let unidades = Math.floor(total / coste.coste);
  if (unidades > cantidad) unidades = cantidad;

  const danoConsumido = unidades * coste.coste;
  const restante = total - danoConsumido;
  const danoRestante = restante > 0 ? Calculo.sumarDanos([{ cantidad: restante, tipo: escala }]) : [];

  detalle.push(t("Ad6.Log.divisionUnidades", {
     dano:     formatearEnEscala(total, escala)
    ,coste:    formatearEnEscala(coste.coste, escala)
    ,unidades
    ,sobrante: (restante > 0 ? t("Ad6.Log.divisionUnidadesSobrante", { sobrante: formatearEnEscala(restante, escala) }) : "")
  }));

  return { unidades, danoConsumido, danoRestante, coste, detalle };
}

/**
 * RESUELVE el daño sobre TODOS los miembros de una formación, en el ORDEN DE
 * ÍNDICES que se le pase (el llamador es quien BAR AJA/DETERMINA el orden).
 * El daño SOBRANTE de un miembro pasa al siguiente; si un miembro se queda sin
 * unidades, todo lo que sobra sigue pasando.
 *
 * NO muta nada: devuelve una lista de resultados por índice y el detalle para el
 * log. Es el llamador quien decide cómo y qué escribir en el documento.
 *
 * @param {Array<{cantidad:number, tipo:string}>} danoLista  daño base completo.
 * @param {Array<object>} formacion       miembros (system.formacion).
 * @param {Array<number>} ordenIndices     índices en el orden de resolución.
 * @param {object} atributos              atributos del ataque.
 * @returns {{
 *   resultados: Array<{ indice:number, nombre:string, cantidad:number,
 *                        unidades:number, cantidadFinal:number,
 *                        danoConsumido:number, escala:string, detalle:string[] }>,
 *   danoSobrante: Array<{cantidad:number, tipo:string}>,
 *   detalle: string[]
 * }}
 */
export function resolverFormacion(danoLista, formacion, ordenIndices, atributos = {})
{
  const resultados = [];
  const detalle = [];
  let danoActual = Calculo.sumarDanos(danoLista ?? []);

  for (const indice of (ordenIndices ?? []))
  {
    const miembro = formacion?.[indice];
    if (!miembro) continue;

    const cantidad = Math.max(0, Number(miembro.cantidad) || 0);
    const nombre = miembro.nombre ?? `Miembro ${indice + 1}`;

    // Un miembro con 0 unidades se IGNORA por completo: como si no existiera.
    // No recibe daño ni genera ninguna línea de reporte. El daño sigue pasando
    // intacto al siguiente miembro.
    if (cantidad <= 0) continue;

    const res = unidadesDestruidasDeMiembro(danoActual, miembro, atributos);
    const cantidadFinal = cantidad - res.unidades;

    detalle.push(t("Ad6.Log.miembroCabecera", { nombre, cantidad }));
    for (const linea of res.coste.detalle) detalle.push(anidar(linea, 1));
    for (const linea of res.detalle) detalle.push(anidar(linea, 1));
    if (res.unidades > 0)
    {
      detalle.push(anidar(t("Ad6.Log.unidadesDestruidas", { unidades: res.unidades, cantidad, quedan: cantidadFinal }), 1));
    }
    else
    {
      detalle.push(anidar(t("Ad6.Log.sinBajas"), 1));
    }

    resultados.push({
       indice
      ,nombre
      ,cantidad
      ,unidades: res.unidades
      ,cantidadFinal
      ,danoConsumido: res.danoConsumido
      ,escala: res.coste.escala
      ,detalle: [...res.coste.detalle, ...res.detalle]
    });

    // El sobrante pasa al siguiente miembro.
    danoActual = res.danoRestante;
    if (danoActual.length === 0) detalle.push(anidar(t("Ad6.Log.noQuedaDano"), 1));
  }

  return { resultados, danoSobrante: danoActual, detalle };
}

/**
 * BAR AJA una lista de índices (Fisher-Yates) usando Math.random, para el orden
 * ALEATORIO de imputación entre miembros (sin determinismo, por acuerdo).
 * @param {number} n  número de índices (0..n-1).
 * @returns {number[]}
 */
export function ordenAleatorio(n)
{
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  for (let i = idx.length - 1; i > 0; i--)
  {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = idx[i];
    idx[i] = idx[j];
    idx[j] = tmp;
  }
  return idx;
}
