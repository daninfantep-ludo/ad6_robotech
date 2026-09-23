/**
 * Helpers de LOG ESTRUCTURADO (módulo neutro)
 * ============================================================================
 * El log del combate ya NO guarda strings "cocinados" en un idioma concreto:
 * guarda ESTRUCTURAS que se localizan AL PINTAR (en el cliente que muestra la
 * ventana). Así, un mismo encuentro difundido por chat puede verse en el idioma
 * de cada jugador, y los módulos de CÁLCULO PURO siguen sin depender de
 * game.i18n.
 *
 * Formas de una entrada de log:
 *   { clave: "Ad6.Log.xxx", datos: {...} }   -> FRASE localizable (se formatea).
 *   { texto: "1M + 3L" }                      -> NOTACIÓN fija (NO se traduce).
 *
 * Las funciones t()/lit() son PURAS (no tocan game.i18n): solo construyen el
 * objeto. La traducción real ocurre en resolverEntrada(), que SÍ usa game.i18n
 * y se invoca desde la capa de presentación (render / portapapeles).
 *
 * REGLA sobre los datos: si un valor de `datos` es un string que empieza por
 * "Ad6." se considera una CLAVE i18n (p. ej. "Ad6.TipoAtaque.energia") y se
 * localiza antes de interpolar. Así las escalas/descriptores que se CONCATENAN
 * dentro de frases pueden viajar como claves y resolverse en el idioma del
 * cliente que pinta.
 */

/**
 * Construye una entrada de log LOCALIZABLE (frase).
 * @param {string} clave   clave i18n (p. ej. "Ad6.Log.armaduraBase").
 * @param {object} [datos] valores a interpolar en la plantilla.
 * @returns {{clave:string, datos:object}}
 */
export function t(clave, datos)
{
  return { clave, datos: datos ?? {} };
}

/**
 * Construye una entrada de log LITERAL (notación de juego, NO se traduce).
 * @param {string} texto
 * @returns {{texto:string}}
 */
export function lit(texto)
{
  return { texto: String(texto ?? "") };
}

/**
 * Añade (o incrementa) el nivel de SANGRÍA de una entrada sin mutarla.
 * Acepta strings legacy (los convierte a {texto}).
 * @param {*} e
 * @param {number} [niveles=1]
 * @returns {object}
 */
export function anidar(e, niveles = 1)
{
  const base = (e === null || e === undefined)
    ? { texto: "" }
    : (typeof e === "string" ? { texto: e } : e);
  return { ...base, sangria: (Number(base.sangria) || 0) + niveles };
}

/**
 * ¿Es una entrada estructurada (objeto) o un string legacy?
 * @param {*} e
 * @returns {boolean}
 */
export function esEntrada(e)
{
  return (e !== null) && (typeof e === "object");
}

/**
 * Localiza los VALORES de `datos` que sean claves i18n (empiezan por "Ad6.").
 * No muta el objeto original.
 * @param {object} datos
 * @returns {object}
 */
export function datosLocalizados(datos)
{
  if (!datos) return {};
  const res = {};
  for (const [k, v] of Object.entries(datos))
  {
    if (v !== null && typeof v === "object")
    {
      // Valor ANIDADO con forma de entrada de log: lo resolvemos a texto.
      res[k] = resolverEntrada(v);
    }
    else if (typeof v === "string" && v.startsWith("Ad6."))
    {
      // Clave i18n (p. ej. "Ad6.TipoAtaque.energia"): se localiza.
      res[k] = game.i18n.localize(v);
    }
    else
    {
      res[k] = v;
    }
  }
  return res;
}

/**
 * Resuelve una entrada de log a TEXTO PLANO en el idioma del cliente actual.
 * Acepta:
 *   - string legacy          -> se devuelve tal cual.
 *   - { clave, datos }       -> game.i18n.format(clave, datos localizados).
 *   - { texto }              -> el texto literal.
 *   - null/undefined         -> "".
 *
 * @param {*} e
 * @returns {string}
 */
export function resolverEntrada(e)
{
  if (e === null || e === undefined) return "";
  if (typeof e === "string") return e;
  if (e.clave) return game.i18n.format(e.clave, datosLocalizados(e.datos));
  return String(e.texto ?? "");
}

