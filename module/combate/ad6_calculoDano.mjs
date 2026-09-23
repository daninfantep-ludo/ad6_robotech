/**
 * Cálculo de DAÑO y ABSORCIÓN (módulo PURO, sin estado ni documentos)
 * ============================================================================
 * Todo lo de aquí son FUNCIONES PURAS que trabajan sobre VALORES (números,
 * letras y objetos planos simples), NO sobre estructuras del encuentro ni
 * documentos de Foundry. Esto permite reutilizar el mismo mecanismo de cálculo
 * desde cualquier parte del código (ventana de combate, aplicación de daño a un
 * actor, futuros casos como enjambres, etc.).
 *
 * ESCALAS DE DAÑO: cada escala es 10 veces la anterior.
 *   L (Ligero)  <  M (Mecha)  <  N (Naval)
 *   1 N = 10 M      1 M = 10 L
 *
 * Todo el código y los comentarios están en castellano a propósito.
 */

import { t } from './ad6_log.mjs';

// ---------------------------------------------------------------------------
// Escalas
// ---------------------------------------------------------------------------

/**
 * "Peso" de cada escala para poder ORDENARLAS y compararlas.
 * Cuanto mayor, más "grande" es la escala. L < M < N.
 * @type { {[k:string]: number} }
 */
export const PESO_ESCALA = { L: 1, M: 2, N: 3 };

/** Factor de conversión entre escalas contiguas (1 N = 10 M, 1 M = 10 L). */
export const FACTOR_ESCALA = 10;

/**
 * Normaliza el texto de una escala a una de las tres letras canónicas "L","M","N".
 * Acepta también los valores localizados de config ("Ad6.Escalas.N") o vacío.
 * @param {string} tipo
 * @returns {"L"|"M"|"N"|null}
 */
export function normalizarEscala(tipo)
{
  if (tipo === undefined || tipo === null) return null;
  const s = String(tipo).trim().toUpperCase();
  if (s === "L" || s === "M" || s === "N") return s;
  // Valores tipo "Ad6.Escalas.N" o "Ligera"/"Mecha"/"Naval".
  const m = s.match(/([LMN])$/);
  if (m) return m[1];
  if (s.startsWith("LIG")) return "L";
  if (s.startsWith("MEC")) return "M";
  if (s.startsWith("NAV")) return "N";
  return null;
}

/**
 * Diferencia de escalas (de mayor a menor): cuántas "decenas" hay de diferencia.
 * Ej.: N respecto a M -> 1; N respecto a L -> 2; M respecto a M -> 0.
 * Devuelve null si alguna escala no es válida.
 * @returns {number|null}
 */
export function diferenciaEscalas(tipoMayor, tipoMenor)
{
  const a = PESO_ESCALA[normalizarEscala(tipoMayor)];
  const b = PESO_ESCALA[normalizarEscala(tipoMenor)];
  if (a === undefined || b === undefined) return null;
  return a - b;
}

/**
 * Convierte una cantidad de daño de una escala a otra. SOLO tiene sentido subir
 * de escala con múltiplos completos (1 N = 10 M). Hacia abajo siempre es exacto.
 * Devuelve un número NO redondeado (el llamador decide qué hacer con el resto).
 *
 * @param {number} cantidad
 * @param {"L"|"M"|"N"} tipoOrigen
 * @param {"L"|"M"|"N"} tipoDestino
 * @returns {number}
 */
export function convertirEscala(cantidad, tipoOrigen, tipoDestino)
{
  const dif = diferenciaEscalas(tipoOrigen, tipoDestino); // origen - destino
  if (dif === null) return Number(cantidad) || 0;
  // Subir de escala (origen mayor que destino) -> multiplica; bajar -> divide.
  return (Number(cantidad) || 0) * Math.pow(FACTOR_ESCALA, dif);
}

// ---------------------------------------------------------------------------
// Parseo del daño de un arma ("1M", "3xL", "5xL", "M", "1xN", ...)
// ---------------------------------------------------------------------------

/**
 * Interpreta el texto de DAÑO de un arma y devuelve { cantidad, tipo }.
 *   cantidad = puntos de daño de ese tipo POR CADA ÉXITO.
 *   tipo     = "L" | "M" | "N".
 *
 * Formatos admitidos (todos significan lo mismo por familia):
 *   - "M", "1M", "1xM"        -> { cantidad: 1, tipo: "M" }
 *   - "3xL", "3L", "3 L"      -> { cantidad: 3, tipo: "L" }
 *   - "1N", "1xN"             -> { cantidad: 1, tipo: "N" }
 * La letra de la escala es OBLIGATORIA; si no se encuentra, devuelve null.
 *
 * @param {string} texto
 * @returns { {cantidad:number, tipo:"L"|"M"|"N"} | null }
 */
export function parseDano(texto)
{
  if (texto === undefined || texto === null) return null;
  const s = String(texto).trim().toUpperCase();
  if (s === "" || s === "—" || s === "-") return null;

  // Cantidad: número opcional al principio seguido (o no) de "x".
  // Tipo: la letra L/M/N en cualquier parte (típicamente al final).
  const mCant = s.match(/(\d+)\s*[X]?/);
  const cantidad = mCant ? parseInt(mCant[1], 10) : 1;

  const mTipo = s.match(/[LMN](?![A-Z])/g);
  if (!mTipo || mTipo.length === 0) return null;
  // Nos quedamos con la ÚLTIMA letra de escala que aparezca (robusto ante textos raros).
  const tipo = mTipo[mTipo.length - 1];

  return { cantidad, tipo };
}

// ---------------------------------------------------------------------------
// Reparto de la defensa entre las armas (fuego concentrado / múltiples armas)
// ---------------------------------------------------------------------------

/**
 * Reparte los ÉXITOS DE DEFENSA entre las armas de un ataque, según la regla:
 *   "se anulan primero los éxitos del arma que MÁS daño hace".
 *
 * El daño de un arma, a efectos de ORDENAR, es su daño potencial POR ÉXITO
 * (cantidad * peso de escala), de modo que 3L > 2L y 3M > 2M, y además 1M > 9L
 * (una escala superior siempre supera a cualquier cantidad de la inferior). Para
 * comparar ENTRE escalas se usa la equivalencia 1 N = 10 M y 1 M = 10 L.
 *
 * Nota: en el juego el fuego concentrado solo cruza una escala (L->M o M->N),
 * así que en la práctica todas las armas comparten escala; aun así la función
 * es general.
 *
 * @param {Array<{ dano: {cantidad:number, tipo:string}, exitos:number }>} armas
 *        Lista de armas (se trabaja sobre COPIAS; no muta la entrada).
 * @param {number} exitosDefensa  Éxitos de defensa a repartir.
 * @returns {Array<{ dano:object, exitos:number, exitosNetos:number }>}
 *          Copia de cada arma con sus "exitosNetos" (exitos - anulados por la defensa).
 */
export function repartirDefensaEntreArmas(armas, exitosDefensa)
{
  const copia = (armas ?? []).map(a => ({
     dano:   a.dano
    ,exitos: Number(a.exitos) || 0
    ,exitosNetos: Number(a.exitos) || 0   // se irá reduciendo
  }));

  let defensaRestante = Math.max(0, Number(exitosDefensa) || 0);
  if (defensaRestante <= 0) return copia;

  // Índices de armas ordenados de MAYOR a MENOR daño potencial por éxito.
  // El "desempate" estable conserva el orden original (índice ascendente).
  const indices = copia
    .map((a, i) => ({ i, peso: _pesoDanoPorExito(a.dano) }))
    .sort((x, y) => (y.peso - x.peso) || (x.i - y.i))
    .map(x => x.i);

  // Se consume la defensa contra las armas en ese orden, anulando 1 éxito por
  // cada punto de defensa, hasta agotar la defensa o los éxitos del arma.
  for (const i of indices)
  {
    if (defensaRestante <= 0) break;
    const arma = copia[i];
    const anulados = Math.min(arma.exitosNetos, defensaRestante);
    arma.exitosNetos -= anulados;
    defensaRestante  -= anulados;
  }

  return copia;
}

/**
 * "Peso" del daño de un arma por éxito, para ordenarlas al repartir defensa.
 * Se expresa en la unidad más pequeña posible: cantidad * 10^(pesoEscala-1).
 * Ej.: {3,"L"} -> 3 ; {2,"M"} -> 20 ; {1,"N"} -> 100.
 */
function _pesoDanoPorExito(dano)
{
  if (!dano) return 0;
  const cantidad = Number(dano.cantidad) || 0;
  const peso = PESO_ESCALA[normalizarEscala(dano.tipo)] ?? 0;
  return cantidad * Math.pow(FACTOR_ESCALA, Math.max(0, peso - 1));
}

// ---------------------------------------------------------------------------
// Daño potencial y suma de daños
// ---------------------------------------------------------------------------

/**
 * Daño POTENCIAL de un arma = (cantidad por éxito) * (éxitos netos).
 * Devuelve un objeto de daño { cantidad, tipo } con esa cantidad total.
 *
 * @param { {cantidad:number, tipo:string} } dano   daño por éxito del arma.
 * @param {number} exitosNetos  éxitos que quedan tras la defensa.
 * @returns { {cantidad:number, tipo:string} | null }
 */
export function danoPotencial(dano, exitosNetos)
{
  if (!dano) return null;
  const total = (Number(dano.cantidad) || 0) * (Number(exitosNetos) || 0);
  if (total <= 0) return { cantidad: 0, tipo: normalizarEscala(dano.tipo) };
  return { cantidad: total, tipo: normalizarEscala(dano.tipo) };
}

/**
 * Suma una lista de daños de distinto tipo en un único resultado compuesto,
 * aprovechando que cada escala es 10x la anterior. El total se expresa de la
 * forma "grande" posible (se agrupan de a 10 para subir de escala) y se
 * devuelve como LISTA de pares, de mayor a menor escala, p. ej.:
 *   [{cantidad:1, tipo:"M"}, {cantidad:3, tipo:"L"}].
 *
 * @param {Array<{cantidad:number, tipo:string}>} lista
 * @returns {Array<{cantidad:number, tipo:"L"|"M"|"N"}>}
 */
export function sumarDanos(lista)
{
  // Acumulamos todo en la escala MÁS PEQUEÑA (L) como unidad común.
  let totalL = 0;
  for (const d of (lista ?? []))
  {
    if (!d) continue;
    const tipo = normalizarEscala(d.tipo);
    if (!tipo) continue;
    totalL += convertirEscala(Number(d.cantidad) || 0, tipo, "L");
  }

  // Repartimos de mayor a menor escala.
  const resultado = [];
  const orden = ["N", "M", "L"];
  let resto = totalL;
  for (let i = 0; i < orden.length; i++)
  {
    const tipo = orden[i];
    if (tipo === "L")
    {
      if (resto > 0) resultado.push({ cantidad: resto, tipo: "L" });
      break;
    }
    // Cuánto vale "1" de esta escala en L.
    const valor = convertirEscala(1, tipo, "L");
    const cantidad = Math.floor(resto / valor);
    if (cantidad > 0)
    {
      resultado.push({ cantidad, tipo });
      resto -= cantidad * valor;
    }
  }
  return resultado;
}

/**
 * Formatea un resultado de daño (lista de pares o par suelto) como texto legible.
 * Ej.: "1M + 3L"  |  "2N"  |  "0".
 * @param {Array|object} dano
 * @returns {string}
 */
export function formatearDano(dano)
{
  const lista = Array.isArray(dano) ? dano : (dano ? [dano] : []);
  const partes = lista
    .filter(d => d && Number(d.cantidad) > 0)
    .map(d => `${Number(d.cantidad)}${normalizarEscala(d.tipo) ?? "?"}`);
  return partes.length ? partes.join(" + ") : "0";
}

/**
 * CALCULA EL DAÑO BASE DE UN ATAQUE (aún sin aplicar a ningún objetivo).
 * Encapsula TODO el mecanismo:
 *   1) Reparte los éxitos de defensa entre las armas (anulando primero las más
 *      dañinas).
 *   2) Calcula el daño potencial de cada arma (daño por éxito * éxitos netos).
 *   3) Suma los daños de todas las armas en un resultado compuesto.
 *
 * Recibe SOLO valores/objetos planos: no conoce el encuentro ni los documentos.
 *
 * @param {Array<{
 *    danoTexto:string,        // daño del arma tal cual ("1M","3xL","M",...)
 *    exitos:number,           // éxitos de ataque asignados a esa arma
 *    nombre?:string           // (opcional) para el detalle
 * }>} armas
 * @param {number} exitosDefensa  éxitos de defensa a repartir.
 * @returns {{
 *   armas: Array<{ nombre:string, dano:object, exitos:number, exitosNetos:number,
 *                  potencial:object }>,
 *   total: Array<{cantidad:number, tipo:string}>,
 *   totalTexto: string,
 *   detalle: string[]
 * }}
 */
export function calcularDanoAtaque(armas, exitosDefensa)
{
  const detalle = [];

  // Normalizamos cada arma al par { dano:{cantidad,tipo}, exitos }.
  const preparadas = (armas ?? []).map((a, i) => ({
     nombre: (a.nombre ?? `Arma ${i + 1}`)
    ,danoTexto: a.danoTexto ?? ""
    ,dano: parseDano(a.danoTexto)
    ,exitos: Number(a.exitos) || 0
  }));

  // 1) Reparto de la defensa (sobre copias; no muta la entrada).
  const repartidas = repartirDefensaEntreArmas(
     preparadas.map(p => ({ dano: p.dano, exitos: p.exitos }))
    ,exitosDefensa
  );

  // 2) + 3) Potencial por arma y suma.
  const armasRes = [];
  const listaDanos = [];
  for (let i = 0; i < preparadas.length; i++)
  {
    const p = preparadas[i];
    const r = repartidas[i];
    const potencial = p.dano ? danoPotencial(p.dano, r.exitosNetos) : null;

    if (p.dano)
    {
      detalle.push(t("Ad6.Log.danoArmaDetalle", {
         nombre:    p.nombre
        ,dano:      formatearDano(p.dano)
        ,exitos:    r.exitosNetos
        ,potencial: formatearDano(potencial)
      }));
    }
    else
    {
      detalle.push(t("Ad6.Log.armaSinDano", { nombre: p.nombre }));
    }

    if (potencial) listaDanos.push(potencial);
    armasRes.push({
       nombre: p.nombre
      ,dano: p.dano
      ,exitos: r.exitos
      ,exitosNetos: r.exitosNetos
      ,potencial: potencial ?? { cantidad: 0, tipo: null }
    });
  }

  const total = sumarDanos(listaDanos);
  return {
     armas: armasRes
    ,total
    ,totalTexto: formatearDano(total)
    ,detalle
  };
}

// ---------------------------------------------------------------------------
// Armadura efectiva del objetivo
// ---------------------------------------------------------------------------

/**
 * Resistencia concreta de una protección por su descriptor (energía, noMelee...).
 * @param {object} proteccion  Ad6_Proteccion (objeto plano).
 * @param {string} descriptor  valor de Ad6.TipoAtaque.*
 * @returns {number}
 */
export function resistenciaDe(proteccion, descriptor)
{
  const arr = proteccion?.resistencias ?? [];
  const r = arr.find(r => r && r.descriptor === descriptor);
  return Number(r?.adicional) || 0;
}

/**
 * Calcula la ARMADURA EFECTIVA de una protección frente a un ataque concreto.
 * Pasos:
 *   1) base = restante de la protección (el tipo lo da proteccion.tipo).
 *   2) Si el arma es de ENERGÍA (danoEnergia) y la protección tiene resistencia
 *      a la energía, se SUMA ese adicional.
 *   3) Si la protección tiene resistencia "noMelee" y el arma NO es melee, se
 *      SUMA ese adicional.
 *   3b) Si el arma es de daño LIGERO en origen (danoLigero) y la protección
 *      tiene resistencia "ligero", se SUMA ese adicional.
 *   3c) Si el arma tiene campo de ÁREA no vacío (tieneArea) y la protección
 *      tiene resistencia "area", se SUMA ese adicional.
 *   4) Penetración: si y solo si el TIPO de la armadura coincide con el tipo de
 *      daño del arma, se reduce la armadura en penetracionFinal; además el
 *      "resiste" de la armadura reduce primero la penetración (mínimo 0).
 *
 * Devuelve un desglose para poder explicarlo en el log.
 *
 * @param {object} proteccion    Ad6_Proteccion (restante, tipo, resiste, resistencias).
 * @param {object} ataque        { danoEnergia, danoMelee, danoLigero, tieneArea,
 *                                 tipoDano, penetracionFinal }.
 * @returns {{
 *   tipo:string|null, base:number, bonos:number, armaduraBruta:number,
 *   penetracionAplicada:number, armaduraFinal:number, penetracionAplicable:boolean,
 *   detalle:string[]
 * }}
 */
export function calcularArmaduraEfectiva(proteccion, ataque = {})
{
  const detalle = [];
  const tipoArm = normalizarEscala(proteccion?.tipo);
  const base = Number(proteccion?.restante) || 0;
  detalle.push(t("Ad6.Log.armaduraBase", { base, escala: tipoArm ?? "" }));

  let bonos = 0;

  // 2) Energía
  if (ataque.danoEnergia === true)
  {
    const rEnergia = resistenciaDe(proteccion, "Ad6.TipoAtaque.energia");
    if (rEnergia !== 0)
    {
      bonos += rEnergia;
      detalle.push(t("Ad6.Log.resistenciaEnergia", { cantidad: rEnergia }));
    }
  }

  // 3) No-Melee (si el arma NO es melee)
  if (ataque.danoMelee !== true)
  {
    const rNoMelee = resistenciaDe(proteccion, "Ad6.TipoAtaque.noMelee");
    if (rNoMelee !== 0)
    {
      bonos += rNoMelee;
      detalle.push(t("Ad6.Log.resistenciaNoMelee", { cantidad: rNoMelee }));
    }
  }

  // 3b) Ligero: SOLO si el daño del arma es de escala L EN ORIGEN (el tipo
  //     NATURAL del arma, no el tipo del daño total tras sumar). El llamador
  //     marca "danoLigero" a partir del daño propio del arma (parseDano).
  if (ataque.danoLigero === true)
  {
    const rLigero = resistenciaDe(proteccion, "Ad6.TipoAtaque.ligero");
    if (rLigero !== 0)
    {
      bonos += rLigero;
      detalle.push(t("Ad6.Log.resistenciaLigero", { cantidad: rLigero }));
    }
  }

  // 3c) Área: SIEMPRE que el arma causante tenga su campo "area" distinto de
  //     vacío (B1, L100, C...). El llamador marca "tieneArea".
  if (ataque.tieneArea === true)
  {
    const rArea = resistenciaDe(proteccion, "Ad6.TipoAtaque.area");
    if (rArea !== 0)
    {
      bonos += rArea;
      detalle.push(t("Ad6.Log.resistenciaArea", { cantidad: rArea }));
    }
  }

  const armaduraBruta = base + bonos;

  // 4) Penetración: solo si coinciden los TIPOS de armadura y de daño.
  const tipoDano = normalizarEscala(ataque.tipoDano);
  const penetracionAplicable = (tipoArm !== null)
    && (tipoDano !== null)
    && (tipoArm === tipoDano);

  let penetracionAplicada = 0;
  if (penetracionAplicable)
  {
    let pen = Number(ataque.penetracionFinal) || 0;
    const resiste = Number(proteccion?.resiste) || 0;
    if (resiste > 0)
    {
      const penTras = Math.max(0, pen - resiste);
      detalle.push(t("Ad6.Log.penetracionReducida", { pen, resiste, penTras }));
      pen = penTras;
    }
    if (pen > 0)
    {
      penetracionAplicada = pen;
      detalle.push(t("Ad6.Log.penetracionAplicada", { pen }));
    }
    else if (pen === 0 && resiste === 0 && (Number(ataque.penetracionFinal) || 0) === 0)
    {
      detalle.push(t("Ad6.Log.sinPenetracion"));
    }
  }
  else
  {
    detalle.push(t("Ad6.Log.penetracionNoAplicable"));
  }

  const armaduraFinal = Math.max(0, armaduraBruta - penetracionAplicada);
  detalle.push(t("Ad6.Log.armaduraEfectiva", { valor: armaduraFinal, escala: tipoArm ?? "" }));

  return {
     tipo: tipoArm
    ,base
    ,bonos
    ,armaduraBruta
    ,penetracionAplicada
    ,armaduraFinal
    ,penetracionAplicable
    ,detalle
  };
}

// ---------------------------------------------------------------------------
// Aplicación del daño sobre ARMADURA y ESTRUCTURA (comparando escalas)
// ---------------------------------------------------------------------------

/**
 * "Absorbe" una cantidad de daño (en su escala) contra una reserva (armadura o
 * estructura) que tiene su propia escala, aplicando la regla de comparación:
 *
 *   - Misma escala: 1 punto de daño resta 1 punto de reserva (uno a uno).
 *   - Daño de escala MAYOR que la reserva: cada 10 puntos de daño hacen 1 de
 *     reserva (los múltiplos completos; el resto se pierde).
 *       Ej.: 22 de daño M contra 1 N -> "pasan" 12 M (se consume 1 N = 10 M).
 *   - Daño de escala MENOR que la reserva: como cada punto de reserva vale más,
 *     1 punto de reserva consume 10 de daño. (En la práctica no ocurre por las
 *     reglas, pero se contempla de forma coherente.)
 *
 * NO se contempla el caso "reserva menor que daño dentro de la misma escala con
 * sobrante que suba de escala": dentro de una misma escala el sobrante queda en
 * esa escala (así lo describe el enunciado: solo cuentan los 10 completos).
 *
 * @param {number} cantidadDano       daño total (en la escala "tipoDano").
 * @param {"L"|"M"|"N"} tipoDano       escala del daño.
 * @param {number} valorReserva       puntos de reserva disponibles.
 * @param {"L"|"M"|"N"} tipoReserva    escala de la reserva.
 * @returns {{
 *   reservaConsumida:number, dañoRestante:number, reservaRestante:number,
 *   destruida:boolean, detalle:string
 * }}
 *   reservaConsumida  puntos de reserva que se consumen (misma escala reserva).
 *   dañoRestante      daño que SOBRA, expresado en la escala del DAÑO.
 *   reservaRestante   reserva que queda (misma escala reserva).
 *   destruida         true si la reserva llega a 0 y aún quedaba daño "por encima".
 */
export function absorberDano(cantidadDano, tipoDano, valorReserva, tipoReserva)
{
  const dano = Math.max(0, Number(cantidadDano) || 0);
  const reserva = Math.max(0, Number(valorReserva) || 0);
  const tD = normalizarEscala(tipoDano);
  const tR = normalizarEscala(tipoReserva);

  if (dano <= 0 || reserva <= 0)
  {
    return {
       reservaConsumida: 0
      ,dañoRestante: dano
      ,reservaRestante: reserva
      ,destruida: false
      ,detalle: t("Ad6.Log.nadaQueAbsorber")
    };
  }

  const dif = diferenciaEscalas(tD, tR); // daño - reserva
  if (dif === 0)
  {
    // Misma escala: uno a uno.
    const consumida = Math.min(reserva, dano);
    const restante  = reserva - consumida;
    const sobraDano = dano - consumida;
    return {
       reservaConsumida: consumida
      ,dañoRestante: sobraDano
      ,reservaRestante: restante
      ,destruida: (restante <= 0) && (sobraDano > 0)
      ,detalle: t("Ad6.Log.reservaAbsorbe1a1", { consumida })
    };
  }

  if (dif > 0)
  {
    // Daño de escala MAYOR que la reserva: 1 punto de daño vale 10^dif puntos de
    // la reserva. Expresamos el daño en la escala de la reserva y aplicamos 1 a 1.
    //   Ej.: daño 2N contra reserva 5M -> 2N = 20M -> consume 5M y sobran 15M
    //   (expresado de vuelta en N: 1.5N). Aquí devolvemos el sobrante en daño pero
    //   lo más útil es la reserva consumida.
    const factor = Math.pow(FACTOR_ESCALA, dif);     // p. ej. 10
    const danoEnEscalaReserva = dano * factor;
    const reservaConsumida = Math.min(reserva, danoEnEscalaReserva);
    const restante = reserva - reservaConsumida;
    // Sobrante expresado de nuevo en la escala del daño.
    const sobraEnReserva = danoEnEscalaReserva - reservaConsumida;
    const sobraDano = sobraEnReserva / factor;
    return {
       reservaConsumida
      ,dañoRestante: sobraDano
      ,reservaRestante: restante
      ,destruida: (restante <= 0) && (reservaConsumida > 0)
      ,detalle: t("Ad6.Log.reservaEscalaMayor", {
         tD
        ,factor
        ,tR
        ,enReserva: danoEnEscalaReserva
        ,consumida: reservaConsumida
        ,sobra: sobraDano
      })
    };
  }

  // dif < 0: daño de escala MENOR que la reserva -> 1 de reserva = 10 de daño.
  // Cada punto de reserva "cuesta" `factor` puntos de daño. La reserva limita
  // cuánto se puede consumir: si solo hay 1 punto de reserva, el daño consume
  // 1 (no 2), y el RESTO PASA (no se pierde por consumir más de lo disponible).
  //   Ej.: armadura 1N contra 22M -> consume 1N (=10M) y pasan 12M.
  const factor = Math.pow(FACTOR_ESCALA, -dif);
  // Cuántos puntos de reserva PODRÍA mermar el daño (múltiplos completos).
  const reservaConsumible = Math.floor(dano / factor);
  // Pero nunca más que la reserva disponible.
  const reservaConsumida = Math.min(reserva, reservaConsumible);
  // El daño efectivamente consumido depende de la reserva consumida.
  const dañoConsumido = reservaConsumida * factor;
  const sobraDano = dano - dañoConsumido;
  const restante = reserva - reservaConsumida;
  return {
     reservaConsumida
    ,dañoRestante: sobraDano
    ,reservaRestante: restante
    ,destruida: (restante <= 0) && (reservaConsumida > 0)
    ,detalle: t("Ad6.Log.reservaEscalaMenor", {
       tR
      ,factor
      ,tD
      ,consumida: reservaConsumida
      ,sobra: sobraDano
    })
  };
}

/**
 * CONDICIÓN DE BORDE: daño de escala N contra una reserva de escala L la
 * destruye inmediatamente (una sola aplicación), aunque sea por área.
 * @returns {boolean}
 */
export function destruccionInmediata(tipoDano, tipoReserva)
{
  const tD = normalizarEscala(tipoDano);
  const tR = normalizarEscala(tipoReserva);
  return (tD === "N") && (tR === "L");
}

/**
 * Imputa un daño COMPUESTO (lista de pares) a UN pool de reserva (una estructura
 * adicional, escudo, etc.) que tiene su PROPIO tipo, aplicando las reglas de
 * imputación con división ENTERA (sin decimales) y decidiendo qué PASA al
 * siguiente pool y qué se PIERDE.
 *
 * DIFERENCIA clave con absorberDanoCompuesto: aquí un daño de escala MENOR que
 * el pool que NO alcanza a consumir 1 punto se PIERDE (no pasa) SIEMPRE QUE EL
 * POOL SIGA EN PIE (no agotado); pero si el pool queda AGOTADO, todo el sobrante
 * PASA al siguiente pool. Así se refleja:
 *   - escudo M de 2, daño 2M+2L -> el 2M agota el escudo, el 2L PASA a estructura.
 *   - escudo M de 2, daño 1M+5L -> el 1M deja el escudo con 1; el 5L no alcanza
 *     a 1M y el escudo NO se agotó -> el 5L SE PIERDE.
 *   - escudo L de 5, daño 2M (=20L) -> consume 5L (agota el escudo) y los 15L
 *     PASAN a la estructura (expresados en la escala del pool, L).
 *
 * @param {Array<{cantidad:number, tipo:string}>} listaDanos
 * @param {string} tipoPool
 * @param {number} valorPool
 * @returns {{
 *   reservaConsumida:number, reservaRestante:number,
 *   pasan: Array<{cantidad:number, tipo:string}>,
 *   perdido: Array<{cantidad:number, tipo:string}>,
 *   destruida:boolean, detalle:string[]
 * }}
 *   "pasan" va expresado en la escala del pool (o en la del par si no hubo que
 *   expandirlo). "perdido" es daño descartado contra este pool.
 */
export function imputarAPool(listaDanos, tipoPool, valorPool)
{
  const detalle = [];
  const tR = normalizarEscala(tipoPool);

  let reserva = Math.max(0, Number(valorPool) || 0);
  const reservaInicial = reserva;
  const pasan = [];
  const perdido = [];

  // Pares ordenados de MAYOR a MENOR escala.
  const pares = (listaDanos ?? [])
    .filter(d => d && (Number(d.cantidad) || 0) > 0)
    .map(d => ({ cantidad: Number(d.cantidad) || 0, tipo: normalizarEscala(d.tipo) }))
    .filter(d => d.tipo !== null)
    .sort((a, b) => PESO_ESCALA[b.tipo] - PESO_ESCALA[a.tipo]);

  for (const par of pares)
  {
    // Si el pool ya está agotado, TODO lo que quede pasa al siguiente pool.
    if (reserva <= 0)
    {
      pasan.push(par);
      continue;
    }

    const dif = PESO_ESCALA[par.tipo] - PESO_ESCALA[tR]; // par - pool

    if (dif === 0)
    {
      // Misma escala: 1 a 1.
      const absorbe = Math.min(par.cantidad, reserva);
      reserva -= absorbe;
      const sobra = par.cantidad - absorbe;
      if (sobra > 0) pasan.push({ cantidad: sobra, tipo: par.tipo });
      detalle.push(t("Ad6.Log.imputado1a1", { absorbe, tipo: par.tipo }));
    }
    else if (dif < 0)
    {
      // Daño de escala MENOR que el pool: cada 1 de pool = 10^(-dif) del daño.
      const factor = Math.pow(FACTOR_ESCALA, -dif);
      const puntosPosibles = Math.floor(par.cantidad / factor);
      const absorbe = Math.min(puntosPosibles, reserva);
      reserva -= absorbe;
      const consumido = absorbe * factor;
      const sobra = par.cantidad - consumido;
      if (sobra > 0)
      {
        if (reserva <= 0)
        {
          // El pool se agotó: el sobrante PASA al siguiente pool.
          pasan.push({ cantidad: sobra, tipo: par.tipo });
          detalle.push(t("Ad6.Log.consumeYAgota", { absorbe, tR, consumido, tipo: par.tipo }));
        }
        else
        {
          // El pool sigue en pie y el daño no alcanza a 1 punto: SE PIERDE.
          perdido.push({ cantidad: sobra, tipo: par.tipo });
          detalle.push(t("Ad6.Log.noAlcanza1YPerdido", { cantidad: par.cantidad, tipo: par.tipo, tR, reserva }));
        }
      }
      else
      {
        detalle.push(
          (absorbe > 0)
            ? t("Ad6.Log.imputadoConDetalle", { cantidad: par.cantidad, tipo: par.tipo, absorbe, tR })
            : t("Ad6.Log.imputado", { cantidad: par.cantidad, tipo: par.tipo })
        );
      }
    }
    else
    {
      // Daño de escala MAYOR que el pool: se EXPANDE a la escala del pool (para
      // no generar decimales) y se imputa 1 a 1.
      const factor = Math.pow(FACTOR_ESCALA, dif);
      const danoEnPool = par.cantidad * factor;
      const absorbe = Math.min(danoEnPool, reserva);
      reserva -= absorbe;
      const sobraEnPool = danoEnPool - absorbe;
      if (sobraEnPool > 0) pasan.push({ cantidad: sobraEnPool, tipo: tR });
      detalle.push(t("Ad6.Log.consumeExpandido", { cantidad: par.cantidad, tipo: par.tipo, enPool: danoEnPool, tR, absorbe }));
    }
  }

  return {
     reservaConsumida: reservaInicial - reserva
    ,reservaRestante: reserva
    ,pasan: sumarDanos(pasan)          // normalizado a pares (p.ej. 32L -> 3M + 2L)
    ,perdido: sumarDanos(perdido)      // normalizado a pares
    ,destruida: (reserva <= 0) && (reservaInicial > 0)
    ,detalle
  };
}

/**
 * Reduce un daño COMPUESTO al que realmente es APLICABLE a una estructura de
 * escala `tipoEstructura`, descartando los residuos que NO completan al menos
 * 1 punto de esa escala (la estructura no se fracciona).
 *
 * Ejemplos:
 *   - daño "2M + 5L" contra estructura M -> "2M" (los 5L no completan 1M).
 *   - daño "1N + 2M" contra estructura N -> "1N" (los 2M no completan 1N).
 *   - daño "2M" contra estructura L -> "2M" (20L; el daño M sí quita estructura L).
 *
 * @param {Array<{cantidad:number, tipo:string}>} listaDanos
 * @param {string} tipoEstructura
 * @returns {Array<{cantidad:number, tipo:string}>} daño efectivo (en pares).
 */
export function danoImputableAEscala(listaDanos, tipoEstructura)
{
  const T = normalizarEscala(tipoEstructura);
  const pares = (listaDanos ?? [])
    .filter(d => d && (Number(d.cantidad) || 0) > 0)
    .map(d => ({ cantidad: Number(d.cantidad) || 0, tipo: normalizarEscala(d.tipo) }))
    .filter(d => d.tipo !== null);
  if (pares.length === 0 || !T) return [];

  // Escala mínima presente (entre el daño y la estructura).
  let tMin = T;
  for (const p of pares)
  {
    if (PESO_ESCALA[p.tipo] < PESO_ESCALA[tMin]) tMin = p.tipo;
  }

  // Total en la escala mínima.
  let totalMin = 0;
  for (const p of pares) totalMin += p.cantidad * Math.pow(FACTOR_ESCALA, PESO_ESCALA[p.tipo] - PESO_ESCALA[tMin]);

  // Puntos ENTEROS que completan de la escala de la estructura.
  const factor = Math.pow(FACTOR_ESCALA, PESO_ESCALA[T] - PESO_ESCALA[tMin]);
  const puntosT = Math.floor(totalMin / factor);
  if (puntosT <= 0) return [];

  // Devolvemos esos puntos en la escala de la estructura, normalizados a pares.
  return sumarDanos([{ cantidad: puntosT, tipo: T }]);
}

/**
 * Absorbe un daño COMPUESTO (lista de pares {cantidad,tipo}) contra una ARMADURA
 * de una escala concreta.
 *
 * CONCEPTO CLAVE (¡importante!): la ARMADURA es una RESTA FIJA, NO un pool que
 * se consume. Se aplica UNA sola vez: "restante = daño − armadura". No hay
 * "puntos de armadura" que se vayan gastando entre pares; la armadura siempre
 * está entera (salvo que la penetración la haya reducido antes de entrar aquí).
 *
 * Para restar hay que llevar TODO a una escala COMÚN. Como cada escala es 10x la
 * anterior, se normaliza el daño compuesto y la armadura a la escala MÍNIMA
 * presente (entre el daño y la armadura). Así NO aparecen decimales:
 *   - 15L vs 1M -> 15L y 10L -> sobran 5L.
 *   - 15L vs 2M -> 15L y 20L -> 20L >= 15L -> no pasa nada.
 *   - 25L vs 2M -> 25L y 20L -> sobran 5L.
 *   -  4L vs 1M ->  4L y 10L -> no pasa nada.
 *   -  2M vs 1L -> (escala mínima L) 20L y 1L -> sobran 19L.
 *
 * El sobrante se devuelve RACIONALIZADO a pares (lo más "grande" posible), p.ej.
 * 19L. El TIPO EFECTIVO del daño que pasa es el del daño; el llamador decide
 * cómo seguir (estructura para vehículos, heridas para personas). NO colapsamos
 * a un tipo "dominante": si el daño era 2M vs 1L, el sobrante sigue siendo una
 * cantidad expresada en L, pero conceptualmente "viene de un daño M".
 *
 * @param {Array<{cantidad:number, tipo:string}>} listaDanos
 * @param {string} tipoReserva    escala de la armadura (L/M/N).
 * @param {number} valorReserva   valor de la armadura en su escala.
 * @returns {{
 *   reservaConsumida:number, reservaRestante:number,
 *   pasan: Array<{cantidad:number, tipo:string}>,
 *   destruida:boolean, detalle:string[]
 * }}
 *   reservaConsumida  daño (en escala mínima) que la armadura "para". Informativo.
 *   reservaRestante   valor de la armadura tras la resta (la armadura NO se
 *                     consume: si absorbió todo el daño, sigue con su valor).
 *   pasan             daño SOBRANTE ya racionalizado a pares (escala natural).
 */
export function absorberDanoCompuesto(listaDanos, tipoReserva, valorReserva)
{
  const detalle = [];
  const tR = normalizarEscala(tipoReserva);
  const valorArm = Math.max(0, Number(valorReserva) || 0);

  // Pares válidos del daño (cantidad > 0 y escala conocida).
  const pares = (listaDanos ?? [])
    .filter(d => d && (Number(d.cantidad) || 0) > 0)
    .map(d => ({ cantidad: Number(d.cantidad) || 0, tipo: normalizarEscala(d.tipo) }))
    .filter(d => d.tipo !== null);

  // Sin daño -> nada que absorber.
  if (pares.length === 0)
  {
    return {
       reservaConsumida: 0
      ,reservaRestante: valorArm
      ,pasan: []
      ,destruida: false
      ,detalle
    };
  }

  // Sin armadura -> pasa todo el daño tal cual (racionalizado).
  if (!tR || valorArm <= 0)
  {
    return {
       reservaConsumida: 0
      ,reservaRestante: 0
      ,pasan: sumarDanos(pares)
      ,destruida: false
      ,detalle
    };
  }

  // Escala MÍNIMA común entre el daño y la armadura (para no perder precisión).
  let tMin = tR;
  for (const p of pares)
  {
    if (PESO_ESCALA[p.tipo] < PESO_ESCALA[tMin]) tMin = p.tipo;
  }

  // Daño y armadura expresados en la escala mínima (enteros).
  let danoMin = 0;
  for (const p of pares)
  {
    danoMin += p.cantidad * Math.pow(FACTOR_ESCALA, PESO_ESCALA[p.tipo] - PESO_ESCALA[tMin]);
  }
  const armaduraMin = valorArm * Math.pow(FACTOR_ESCALA, PESO_ESCALA[tR] - PESO_ESCALA[tMin]);

  // RESTA FIJA. Si la armadura cubre todo el daño -> no pasa nada.
  const sobranteMin = danoMin - armaduraMin;

  if (sobranteMin <= 0)
  {
    detalle.push(t("Ad6.Log.armaduraCubreTodo", { dano: danoMin, armadura: armaduraMin }));
    return {
       reservaConsumida: danoMin          // informativo: la armadura "para" todo
      ,reservaRestante: valorArm          // la armadura NO se consume
      ,pasan: []
      ,destruida: false
      ,detalle
    };
  }

  // Sobrante: lo devolvemos RACIONALIZADO a pares desde la escala mínima.
  detalle.push(t("Ad6.Log.armaduraResta", { dano: danoMin, armadura: armaduraMin, sobra: sobranteMin }));

  return {
     reservaConsumida: armaduraMin        // informativo: daño que la armadura paró
    ,reservaRestante: valorArm            // la armadura NO se consume
    ,pasan: sumarDanos([{ cantidad: sobranteMin, tipo: tMin }])
    ,destruida: false
    ,detalle
  };
}

// ---------------------------------------------------------------------------
// Combinación de ARMADURAS (item equipado + armadura de especie, etc.)
// ---------------------------------------------------------------------------

/**
 * Resistencias "vacías" por defecto (objeto PLANO, NO definición de schema).
 * Se usa para tener SIEMPRE la misma forma de resistencias al combinar.
 */
function _resistenciasVacias()
{
  return [
     { descriptor: "Ad6.TipoAtaque.energia", adicional: 0 }
    ,{ descriptor: "Ad6.TipoAtaque.noMelee", adicional: 0 }
    ,{ descriptor: "Ad6.TipoAtaque.frio", adicional: 0 }
    ,{ descriptor: "Ad6.TipoAtaque.ligero", adicional: 0 }
    ,{ descriptor: "Ad6.TipoAtaque.area", adicional: 0 }
  ];
}

/**
 * COMBINA VARIAS protecciones (armaduras) en UNA sola, sumando campo a campo:
 *   - "restante" y "valor": suma de todas.
 *   - "resiste": suma de todas.
 *   - "ablativa": OR (si alguna es ablativa, la combinada lo es).
 *   - "resistencias": suma por DESCRIPTOR IGUAL (energía + energía, etc.).
 *   - "tipo": se queda con la ESCALA MAYOR (L<M<N). Si hay tipos distintos, el
 *     de menor escala NO se pierde: se devuelve en "extras" como una protección
 *     aparte en su escala, para que el cálculo la trate escalonadamente.
 *     EJ.: 1M + 1L -> base 1M (tipo M) + extra 1L.
 *
 * IMPORTANTE: estas protecciones son ARMADURAS (todas del mismo "tipo" de cosa:
 * blindaje del item, armadura de especie...). NO es el caso de los "escudos
 * ablativos" tipo brazos del Salamander, que van por otro camino (estructuras
 * adicionales del vehículo).
 *
 * @param {Array<object>} protecciones  Lista de Ad6_Proteccion planas.
 * @returns {{
 *   tipo:string|null, restante:number, valor:number, resiste:number,
 *   ablativa:boolean, resistencias:Array<{descriptor:string, adicional:number}>,
 *   extras:Array<object>,          // protecciones "menores" (tipo distinto al mayor)
 *   detalle:string[]
 * }}
 */
export function combinarArmaduras(protecciones)
{
  const detalle = [];
  const lista = (protecciones ?? []).filter(p => p && (Number(p.restante) || 0) >= 0);

  if (lista.length === 0)
  {
    return {
       tipo: null, restante: 0, valor: 0, resiste: 0, ablativa: false,
       resistencias: _resistenciasVacias(), extras: [], detalle: [t("Ad6.Log.sinArmaduras")]
    };
  }

  // Suma simple de campos numéricos.
  let restante = 0, valor = 0, resiste = 0, ablativa = false;
  for (const p of lista)
  {
    restante += Number(p.restante) || 0;
    valor    += Number(p.valor) || 0;
    resiste  += Number(p.resiste) || 0;
    if (p.ablativa === true) ablativa = true;
  }

  // Resistencias: suma por descriptor IGUAL (unión de descriptores).
  const acumulado = new Map();  // descriptor -> adicional
  for (const p of lista)
  {
    for (const r of (p.resistencias ?? []))
    {
      if (!r) continue;
      const d = r.descriptor ?? "";
      acumulado.set(d, (acumulado.get(d) ?? 0) + (Number(r.adicional) || 0));
    }
  }
  const resistencias = [...acumulado.entries()].map(([descriptor, adicional]) => ({ descriptor, adicional }));

  // Tipo: nos quedamos con la ESCALA MAYOR.
  const escalaDe = (p) => { const t = normalizarEscala(p?.tipo); return t ? PESO_ESCALA[t] : 0; };
  let mayor = null;
  for (const p of lista) if (mayor === null || escalaDe(p) > escalaDe(mayor)) mayor = p;
  const tipo = mayor ? normalizarEscala(mayor.tipo) : null;

  // Extras: protecciones cuyo tipo DIFIERE del mayor y aportaban valor > 0.
  const extras = [];
  for (const p of lista)
  {
    if (p === mayor) continue;
    const t = normalizarEscala(p.tipo);
    if (t === tipo) continue;                       // mismo tipo: ya sumado
    if ((Number(p.restante) || 0) <= 0) continue;   // sin valor: no aporta
    extras.push({
       tipo: t ?? tipo
      ,restante: Number(p.restante) || 0
      ,valor: Number(p.valor) || 0
      ,resiste: Number(p.resiste) || 0
      ,ablativa: p.ablativa === true
      ,resistencias: p.resistencias ?? []
    });
    detalle.push(t("Ad6.Log.armaduraExtra", { valor: Number(p.restante) || 0, escala: t ?? "?" }));
  }

  return {
     tipo
    ,restante
    ,valor
    ,resiste
    ,ablativa
    ,resistencias
    ,extras
    ,detalle
  };
}

// ---------------------------------------------------------------------------
// HERIDAS (aplicación de daño a actores a pie: principal / teniente)
// ---------------------------------------------------------------------------

/**
 * Interpreta el texto del VALOR DE CADA HERIDA de un actor ("valorHeridas"):
 *   - "L"   -> { cantidad: 1, tipo: "L" }
 *   - "5L"  -> { cantidad: 5, tipo: "L" }
 *   - "M"   -> { cantidad: 1, tipo: "M" }
 *   - "1M"  -> { cantidad: 1, tipo: "M" }
 *   - "3L", "1N", etc.
 * Devuelve null si no se reconoce (vacío, guion...).
 *
 * @param {string} texto
 * @returns { {cantidad:number, tipo:"L"|"M"|"N"} | null }
 */
export function parseValorHerida(texto)
{
  if (texto === undefined || texto === null) return null;
  const s = String(texto).trim().toUpperCase();
  if (s === "" || s === "—" || s === "-") return null;

  // Cantidad opcional al principio; la escala es la letra L/M/N.
  const mCant = s.match(/(\d+)/);
  const cantidad = mCant ? parseInt(mCant[1], 10) : 1;

  const mTipo = s.match(/[LMN](?![A-Z])/g);
  if (!mTipo || mTipo.length === 0) return null;
  const tipo = mTipo[mTipo.length - 1];

  return { cantidad, tipo };
}

/**
 * Calcula CUÁNTAS HERIDAS COMPLETAS se marcan al aplicar un daño que TRASPASA
 * (ya descontada la armadura) a un actor a pie.
 *
 * El valor de CADA herida viene de "valorHeridas" (p.ej. 5L, M, L...). Solo se
 * marcan heridas COMPLETAS: el daño que no complete una herida se pierde.
 *
 * Reglas (ejemplos del enunciado):
 *   - valor 5L, daño 6L  -> 1 herida (el 1L sobrante se pierde).
 *   - valor 5L, daño 4L  -> 0 heridas.
 *   - valor L,  daño 3L  -> 3 heridas.
 *   - valor M,  daño 7L  -> 0 heridas (7L < 1M=10L).
 *   - valor M,  daño 11L -> 1 herida (11L completa 1M).
 *   - valor M,  daño 1M  -> 1 herida.
 *
 * @param {Array<{cantidad:number, tipo:string}>} danoLista  daño que traspasa.
 * @param {{cantidad:number, tipo:"L"|"M"|"N"}} valorHerida
 * @returns {{
 *   heridas:number,                 // nº de heridas COMPLETAS a marcar
 *   danoTotalEnEscalaHerida:number, // daño total expresado en la escala de la herida
 *   restante:number                 // daño sobrante en la escala de la herida (se pierde)
 * }}
 */
export function heridasAImputar(danoLista, valorHerida)
{
  const vh = valorHerida;
  if (!vh || !vh.tipo || (Number(vh.cantidad) || 0) <= 0)
  {
    return { heridas: 0, danoTotalEnEscalaHerida: 0, restante: 0 };
  }

  const tHerida = normalizarEscala(vh.tipo);
  const pares = (danoLista ?? [])
    .filter(d => d && (Number(d.cantidad) || 0) > 0)
    .map(d => ({ cantidad: Number(d.cantidad) || 0, tipo: normalizarEscala(d.tipo) }))
    .filter(d => d.tipo !== null);

  if (pares.length === 0) return { heridas: 0, danoTotalEnEscalaHerida: 0, restante: 0 };

  // Escala MÍNIMA presente (entre el daño y la herida) para no perder precisión.
  let tMin = tHerida;
  for (const p of pares) if (PESO_ESCALA[p.tipo] < PESO_ESCALA[tMin]) tMin = p.tipo;

  let totalMin = 0;
  for (const p of pares) totalMin += p.cantidad * Math.pow(FACTOR_ESCALA, PESO_ESCALA[p.tipo] - PESO_ESCALA[tMin]);

  // Valor de UNA herida, en la escala mínima.
  const valorHeridaEnMin = (Number(vh.cantidad) || 0) * Math.pow(FACTOR_ESCALA, PESO_ESCALA[tHerida] - PESO_ESCALA[tMin]);

  // Nº de heridas COMPLETAS (división entera).
  const heridas = Math.floor(totalMin / valorHeridaEnMin);
  const restanteEnMin = totalMin - heridas * valorHeridaEnMin;

  // Devolvemos el total y el restante en la escala de la HERIDA.
  const aEscalaHerida = Math.pow(FACTOR_ESCALA, PESO_ESCALA[tMin] - PESO_ESCALA[tHerida]);
  return {
     heridas
    ,danoTotalEnEscalaHerida: totalMin * aEscalaHerida
    ,restante: restanteEnMin * aEscalaHerida
  };
}
