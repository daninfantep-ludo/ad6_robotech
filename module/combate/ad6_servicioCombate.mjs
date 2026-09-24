/**
 * Servicio de Combate
 * ============================================================================
 * Encapsula TODA la lógica del flujo de "Ataque y Defensa" (sin el cálculo
 * real del daño, que queda para una fase posterior). Mantiene una estructura
 * de "ENCUENTROS" (encounters) que representa cada ataque abierto.
 *
 * PATRÓN DE SINCRONIZACIÓN (heredado del Servicio de Asistencia):
 *   El estado de los encuentros NO vive en ningún documento. Vive en un estado
 *   global por cliente (game.ad6_encuentros). La sincronización entre clientes
 *   se hace con "mensajes-aviso" de chat que llevan un flag con un SNAPSHOT del
 *   encuentro. Así:
 *     - Ningún cliente escribe documentos ajenos => sin problemas de permisos.
 *     - Funciona igual para jugadores y para el GM.
 *   Los avisos no tienen contenido visible y se ocultan del log con el hook
 *   renderChatMessageHTML (clase .ad6-asistencia-aviso, reutilizada).
 *
 * IMPORTANTE (alcance de esta fase):
 *   Se gestionan: selección de objetivos, reparto de éxitos de ataque y
 *   defensa, y el intercambio "A<->D" a través del encuentro. Al resolverse el
 *   encuentro (ataque confirmado + todos los defensores confirmados) se CALCULA
 *   el daño y, según el tipo de objetivo, se APLICA o se INFORMA (ver
 *   _resolverDanoDeObjetivo). Todo el MECANISMO DE CÁLCULO vive, puro y
 *   reutilizable, en ad6_calculoDano.mjs.
 *
 * Todo el código y los comentarios están en castellano a propósito.
 */

import { Ad6_AppCombate } from './ad6_appCombate.mjs';
import * as Calculo from './ad6_calculoDano.mjs';
import * as CalculoEnjambre from './ad6_calculoEnjambre.mjs';
import { t, lit } from './ad6_log.mjs';
import { SLOTS_TIRADA } from '../../model/funciones.mjs';

const ID_FLAG = "ad6-robotech";          // namespace de flags del sistema (compartido)
const AVISO_COMBATE = "combateEncuentro"; // clave del flag para los avisos de combate

// Clave del flag en un Combatant de FASE. Los Combatants de fase son los que
// representan una TIRADA fijada (una por slot tirada1/tirada2/tirada3) y son los
// ÚNICOS que se muestran en el combat tracker. Los Combatants de "presencia" (los
// que el GM añade arrastrando tokens) NO se muestran, pero son los que definen
// "quién está en la liza" para la selección de objetivos.
export const FLAG_COMBATANT_FASE = "combateFase";

/**
 * ¿Es este Combatant un "Combatant de fase" (una tirada fijada) y no un
 * Combatant de "presencia" (un actor en la liza)?
 *
 * Los de fase llevan el flag FLAG_COMBATANT_FASE en el namespace del sistema.
 * La presencia NO lleva ese flag.
 *
 * Se exporta porque lo usan varios módulos (objetivos, orquestador y render).
 * @param {Combatant} combatant
 * @returns {boolean}
 */
export function esCombatantDeFase(combatant)
{
  return !!combatant?.flags?.[ID_FLAG]?.[FLAG_COMBATANT_FASE];
}

// ---------------------------------------------------------------------------
// Estado global por cliente
// ---------------------------------------------------------------------------

/**
 * Estructura: game.ad6_encuentros = { [encuentroId]: { ...snapshot... } }
 *
 * Cada encuentro:
 * {
 *    id                 : uuid propio del encuentro
 *    invocadorUserId     : id del usuario que pulsó "abrir ataque"
 *    atacanteUuid        : uuid del actor atacante
 *    atacanteId          : id del actor atacante
 *    atacanteNombre      : nombre completo del atacante
 *    atacanteImg         : img del atacante
 *    slotAtacante        : "tirada1" | "tirada2" | "tirada3"
 *    faseOrigen          : subfase (p.ej. "operacionesAtacar") de la tirada origen
 *    superFase           : "operaciones" (u otra)
 *    sinergia            : bool (define si el ataque puede repartir éxitos)
 *    armas               : [ { clase, nombre, datos,         copia de la tirada origen
 *                              actorUuid, actorId, actorNombre,  dueño del arma
 *                              slot,                       tiradaN de ese dueño
 *                              exitosTirada,               máximo asignable de esa arma
 *                              exitosAtaque,               lo asignado por el atacante
 *                              principal } ]               true si es el arma propia del atacante
 *                          ^ Un encuentro puede tener VARIAS armas: la propia del
 *                            atacante (principal) más las que otros actores le
 *                            "prestan" para el FUEGO CONCENTRADO. Los éxitos de
 *                            ataque viven AHORA por arma (no en la raíz).
 *    ataqueConfirmado    : bool
 *    objetivos           : [ { actorUuid, actorId, nombre, img } ]
 *    defensas            : { [actorIdDefensor]: {
 *                              actorUuid, actorId, nombre, img, confirmado,
 *                              fuentes: [ {              ^ colección de FUENTES
 *                                 actorUuid, actorId, actorNombre, img,
 *                                 slot,                  tiradaN del dueño,
 *                                 fuente,                "operacionesDefender"
 *                                                        | "operacionesSinergia",
 *                                 disponible,            máximo de esa fuente,
 *                                 exitosDefensa,         lo tomado de ella,
 *                                 propia                 true = del defensor
 *                              } ]                       (las demás son PRESTADAS)
 *                          } }
 *                          ^ indexado por actorId (SIN puntos) para que no se
 *                            trocee al pasar por expandObject/setProperty.
 *                            La propia + las prestadas (prestarDefensa) se
 *                            reparten de forma independiente, cada una con su
 *                            propio máximo.
 *    log                 : [ entradaLog, ... ]  // log ESTRUCTURADO (se localiza
 *                                                // al pintar). Cada entrada:
 *                                                //   { clave, datos, nivel?, sangria? } (frase)
 *                                                //   { texto, nivel?, sangria? } (notación fija)
 *                                                // "nivel": titulo|destruido|aplicar|sinDano
 *                                                // "sangria": nº de niveles de indentación
 *    estado              : "abierto" | "resuelto" | "cerrado"
 * }
 */
function encuentros()
{
  if (!game.ad6_encuentros) game.ad6_encuentros = {};
  return game.ad6_encuentros;
}

/** Emite un aviso al usuario. */
function avisar(texto)
{
  ui.notifications.warn(texto);
}

// ---------------------------------------------------------------------------
// Helpers de resolución de contexto
// ---------------------------------------------------------------------------

/**
 * Devuelve los actores que están en el combate actual de la escena activa.
 * Si no hay combate, devuelve lista vacía.
 * (Se mantiene por compatibilidad; el buscador usa catalogoObjetivos()).
 * @returns {Actor[]}
 */
export function actoresDelCombate()
{
  const combat = game.combat;
  if (!combat) return [];
  const res = [];
  for (const c of combat.combatants)
  {
    // Normalizamos al actor del mundo (los combatientes pueden referir al
    // actor sintético del token).
    const a = _normalizarActorDelMundo(c.actor);
    if (a && !res.some(x => x.uuid === a.uuid)) res.push(a);
  }
  return res;
}

/**
 * Catálogo de posibles OBJETIVOS de ataque.
 *
 * Regla (acordada): SOLO se puede atacar a quien ESTÁ PRESENTE EN EL COMBATE.
 * Se toman los combatientes del combate activo (game.combat), normalizados al
 * actor del mundo. Un actor que exista en el directorio pero NO esté en el
 * combate NO es seleccionable como blanco.
 *
 * Si no hay combate activo, el catálogo queda vacío (no hay a quién atacar).
 *
 * Excluye al actor indicado (normalmente el propio atacante).
 * @param {string} [excluirUuid]
 * @returns {Actor[]}
 */
export function catalogoObjetivos(excluirUuid = null)
{
  const res = [];
  const vistos = new Set();

  const meter = (ref) => {
    const a = _normalizarActorDelMundo(ref);
    if (!a) return;
    if (excluirUuid && a.uuid === excluirUuid) return;
    if (vistos.has(a.uuid)) return;
    vistos.add(a.uuid);
    res.push(a);
  };

  // Combatientes del combate activo (los que están realmente "en la liza").
  for (const a of objetivosDelCombate()) meter(a);

  return res;
}

/**
 * Devuelve los ACTORES del combate activo que son objetivos válidos:
 * normalizados al actor del mundo y EXCLUYENDO:
 *   - los Combatants de FASE (tiradas fijadas): son presentación, no presencia.
 *   - los Combatants de PRESENCIA marcados como DERROTADOS (un enemigo fuera de
 *     combate no debería ser blanco).
 *
 * Regla CLAVE: "estar en la liza" = tener un Combatant de PRESENCIA. Las
 * tiradas fijadas (Combatants de fase) NO determinan quién es atacable.
 *
 * Es la base del catálogo de objetivos; mantener aquí la regla de "quién es
 * un blanco válido" evita duplicarla y deja un único sitio que tocar.
 *
 * @returns {Actor[]}
 */
function objetivosDelCombate()
{
  const combat = game.combat;
  if (!combat) return [];

  const res = [];
  for (const c of combat.combatants)
  {
    // Los Combatants de FASE no cuentan como presencia: se ignoran.
    if (esCombatantDeFase(c)) continue;

    // Los combatientes derrotados no son blanco válido.
    if (c.defeated === true) continue;

    const a = _normalizarActorDelMundo(c.actor);
    if (a && !res.some(x => x.uuid === a.uuid)) res.push(a);
  }
  return res;
}

/**
 * Resuelve los objetivos INICIALES a partir de las marcas de objetivo
 * (targeted) de la escena activa, hechas por el propio usuario que invoca.
 * Se deduplica por actorUuid.
 *
 * IMPORTANTE: la MISMA regla que en el buscador -> SOLO cuentan los actores que
 * están presentes en el combate activo. Si el jugador marcó (targeted) un token
 * que no está en el combate, se ignora.
 * @returns {Actor[]}
 */
export function objetivosIniciales()
{
  // Set de uuids "en liza" para comprobar pertenencia al combate.
  const enCombate = new Set(objetivosDelCombate().map(a => a.uuid));

  const res = [];
  const tokens = Array.from(game.user?.targets ?? []);
  for (const tok of tokens)
  {
    // game.user.targets puede contener placeables Token o TokenDocument según
    // la versión. Resolvemos el Actor de forma defensiva y, sobre todo, nos
    // aseguramos de quedarnos con el ACTOR (uuid "Actor.*"), nunca con el token
    // ni con la escena.
    const actor = _actorDeObjetivo(tok);
    if (!actor) continue;
    if (!enCombate.has(actor.uuid)) continue;   // no está en el combate -> fuera
    if (res.some(x => x.uuid === actor.uuid)) continue;
    res.push(actor);
  }
  return res;
}

/**
 * Dado un elemento de game.user.targets (placeable Token, TokenDocument o ya
 * un Actor), devuelve SIEMPRE el ACTOR DEL MUNDO al que apunta, o null.
 *
 * OJO: en Foundry v13/v14, tok.actor de un token de escena devuelve el ACTOR
 * SINTÉTICO del token, cuyo uuid es compuesto:
 *     Scene.<sceneId>.Token.<tokenId>.Actor.<actorId>
 * Ese uuid NO es estable entre clientes y no coincide con el del actor del
 * mundo ("Actor.<actorId>"). Por eso NORMALIZAMOS siempre al actor del mundo.
 */
function _actorDeObjetivo(tok)
{
  if (!tok) return null;

  // 1) Si ya es un Actor, lo tomamos tal cual.
  let actor = (tok.documentName === "Actor") ? tok : null;

  // 2) Placeable Token: su TokenDocument trae "actorId".
  if (!actor && tok.document?.actorId != null)
  {
    actor = game.actors?.get(tok.document.actorId) ?? null;
  }

  // 3) TokenDocument directo: también trae "actorId".
  if (!actor && tok.actorId != null)
  {
    actor = game.actors?.get(tok.actorId) ?? null;
  }

  // 4) Último recurso: si hemos obtenido un actor (aunque sea sintético),
  //    normalizamos su uuid quitándole el prefijo de token/escena.
  if (!actor && tok.actor) actor = _normalizarActorDelMundo(tok.actor);

  return actor ? _normalizarActorDelMundo(actor) : null;
}

/**
 * Normaliza cualquier referencia de actor al ACTOR DEL MUNDO.
 *   - "Actor.<id>"                        -> se queda igual.
 *   - "Scene.<s>.Token.<t>.Actor.<id>"    -> "Actor.<id>" (actor del mundo).
 * Devuelve el Actor del mundo o null si no se puede resolver.
 * @param {Actor|object} ref
 * @returns {Actor|null}
 */
function _normalizarActorDelMundo(ref)
{
  if (!ref) return null;
  const uuid = ref.uuid ?? "";

  // Ya es un actor del mundo.
  if (uuid.startsWith("Actor."))
  {
    return game.actors?.get(ref.id) ?? ref;
  }

  // Actor sintético de token: "...Actor.<id>" al final.
  const m = uuid.match(/Actor\.([A-Za-z0-9]+)$/);
  if (m)
  {
    return game.actors?.get(m[1]) ?? null;
  }

  return null;
}

/**
 * Extrae el id de un actor desde un uuid de Actor del mundo ("Actor.<id>").
 * Devuelve null si no encaja.
 */
function _idDesdeUuid(uuid)
{
  if (typeof uuid !== "string") return null;
  const m = uuid.match(/^Actor\.([A-Za-z0-9]+)$/);
  return m ? m[1] : null;
}

/**
 * Devuelve la entrada de defensa de un defensor, aceptando TANTO el actorId
 * (clave del diccionario) COMO el uuid completo ("Actor.<id>"). Así los
 * llamadores pueden pasar cualquiera de los dos sin preocuparse.
 */
function _defensaDe(enc, ref)
{
  if (!enc?.defensas || !ref) return null;
  // 1) Directo por id (clave del diccionario).
  if (enc.defensas[ref]) return enc.defensas[ref];
  // 2) Si es un uuid "Actor.<id>", probamos por su id.
  const id = _idDesdeUuid(ref);
  if (id && enc.defensas[id]) return enc.defensas[id];
  return null;
}

/**
 * Convierte un Actor en el objeto ligero que guardamos en objetivos.
 * SIEMPRE debe recibir un Actor del mundo (uuid "Actor.<id>").
 */
function _ref(actor)
{
  return {
     actorUuid: actor.uuid
    ,actorId:   actor.id
    ,nombre:    actor.name
    ,img:       actor.img
  };
}

/**
 * Lista de USUARIOS JUGADORES (no-GM) con permiso de PROPIETARIO (level>=3)
 * sobre el actor. Ignora el usuario "default" (que aplica a todos) porque no
 * representa a un dueño concreto.
 * @returns {User[]}
 */
function _duenosJugadores(actor)
{
  const res = [];
  if (!actor?.ownership) return res;
  // ownership: { [userId]: level }. level >= 3 (OWNER).
  for (const [userId, level] of Object.entries(actor.ownership))
  {
    if (userId === "default") continue;
    if (level < 3) continue;
    const u = game.users.get(userId);
    if (u && !u.isGM) res.push(u);
  }
  return res;
}

/**
 * Determina si el USUARIO ACTUAL debe ver la ventana de defensor del actor.
 *
 * Regla (acordada):
 *   - Hay dueño(s) jugador ACTIVO(s) (conectados) -> la ve(n) SOLO ese/los
 *     jugador(es). El GM NO la ve (aunque sea técnicamente owner).
 *   - NO hay dueño jugador, o ninguno está conectado -> la ve el GM
 *     (NPC del GM o jugador desconectado; el GM "juega consigo mismo").
 *
 * Nota: actor.isOwner NO sirve aquí porque es true también para el GM siempre.
 */
function _usuarioControlaActor(actor)
{
  if (!actor) return false;

  const duenos = _duenosJugadores(actor);
  const activos = duenos.filter(u => u.active === true);

  if (activos.length > 0)
  {
    // Hay dueños jugadores conectados: solo ellos ven la ventana.
    return activos.some(u => u.id === game.user.id);
  }

  // Sin dueños activos -> esta ventana corresponde al GM.
  return game.user.isGM;
}

// ---------------------------------------------------------------------------
// API de creación / consulta de encuentros
// ---------------------------------------------------------------------------

/**
 * Crea un nuevo encuentro a partir de una tirada del atacante y lo difunde.
 *
 * @param {Actor}  atacante  Actor que ataca.
 * @param {string} slot      "tirada1" | "tirada2" | "tirada3".
 * @param {object} tirada    El objeto system[slot] del atacante (ya leído).
 * @returns {string} id del encuentro creado.
 */
export async function crearEncuentro(atacante, slot, tirada)
{
  // Normalizamos SIEMPRE el atacante al actor del mundo (independiente de
  // tokens: si la hoja se abrió desde un token, esto lo resuelve).
  const actorAtacante = _normalizarActorDelMundo(atacante);
  if (!actorAtacante) return null;

  const id = foundry.utils.randomID();

  // El encuentro nace con UNA sola arma: la propia del atacante (principal).
  // Las armas "prestadas" para el fuego concentrado se añaden después con
  // prestarArma().
  const armaPrincipal = _refArmaDesdeTirada(actorAtacante, slot, tirada);

  const encuentro = {
     id:                    id
    ,invocadorUserId:       game.user.id
    ,atacanteUuid:          actorAtacante.uuid
    ,atacanteId:            actorAtacante.id
    ,atacanteNombre:        actorAtacante.name
    ,atacanteImg:           actorAtacante.img
    ,slotAtacante:          slot
    ,faseOrigen:            faseDeAccion(tirada)
    ,superFase:             tirada?.superFase ?? "ninguna"
    ,sinergia:              tirada?.sinergia === true
    ,armas:                 [armaPrincipal]
    ,ataqueConfirmado:      false
    ,objetivos:             objetivosIniciales().map(_ref)
    ,defensas:              {}
    ,log:                   []
    ,estado:                "abierto"
  };

  // Pre-cargamos la línea de defensa de cada objetivo (con su fuente de éxitos).
  for (const obj of encuentro.objetivos)
  {
    _inicializarDefensa(encuentro, obj.actorUuid);
  }

  encuentros()[id] = encuentro;

  // Difundimos el encuentro a todos (crea las ventanas que correspondan).
  await _difundir(id);

  return id;
}

/**
 * Construye la entrada de ARMA de un encuentro a partir de una tirada.
 * La usan tanto crearEncuentro (arma principal del atacante) como
 * prestarArma() (arma "prestada" por otro actor para el fuego concentrado).
 *
 * @param {Actor}  dueno   Actor dueño de esa arma (y de la tirada).
 * @param {string} slot    "tirada1" | "tirada2" | "tirada3" del dueño.
 * @param {object} tirada  El objeto system[slot] del dueño (ya leído).
 * @param {object} [opts]  { principal } (por defecto false).
 */
function _refArmaDesdeTirada(dueno, slot, tirada, opts = {})
{
  const arma = tirada?.arma ?? { clase: "", nombre: "", datos: {} };
  const exitos = Number(tirada?.exitos ?? 0);

  // PENETRACIÓN FINAL: se calcula AQUÍ, al construir el arma del encuentro, a
  // partir de la penetración del arma (system.penetracion del clon "datos").
  //   - vacío  -> 0     - "Pn" -> n     - "Pn|m" -> n (por defecto; el atacante
  //                                       podrá cambiarla con fijarPenetracionFinal)
  const pen = opcionesPenetracion(arma?.datos?.system?.penetracion);

  // DAÑO FINAL: mismo mecanismo que la penetración. Se calcula AQUÍ, al
  // construir el arma del encuentro, a partir del daño del arma
  // (system.dano del clon "datos"). El RECEPTOR (atacante) podrá cambiarlo
  // luego con fijarDanoFinal, igual que la penetración.
  //   - vacío  -> ""       - "3xL" -> "3xL"   - "L|2xL" -> "L" (por defecto)
  const dano = opcionesDano(arma?.datos?.system?.dano);

  return {
     clase:        arma.clase ?? ""
    ,nombre:       arma.nombre ?? ""
    ,datos:        foundry.utils.deepClone(arma.datos ?? {})
    ,actorUuid:    dueno.uuid
    ,actorId:      dueno.id
    ,actorNombre:  dueno.name
    ,slot:         slot
    ,exitosTirada: exitos
    // Las armas prestadas nacen sin éxitos asignados: las reparte el atacante.
    ,exitosAtaque: (opts.principal === true) ? _exitosAtaqueInicial(tirada) : 0
    ,principal:    opts.principal === true
    // Penetración final efectiva + catálogo de opciones posibles (para el select).
    ,penetracionFinal:    pen.valor
    ,penetracionOpciones: pen.opciones
    // Daño final efectivo + catálogo de opciones posibles (para el select).
    ,danoFinal:    dano.valor
    ,danoOpciones: dano.opciones
  };
}

/**
 * Interpreta el texto de penetración de un arma y devuelve sus opciones.
 * Formatos admitidos:
 *   - ""            (vacío)   -> opciones: []        valor: 0
 *   - "Pn"          (n natural) -> opciones: [n]      valor: n
 *   - "Pn|m"        (dos valores) -> opciones: [n, m]  valor: n  (por defecto el 1º)
 * Es tolerante: admite espacios, mayúsculas/minúsculas en la "P" y valores no
 * numéricos (se descartan; si no queda ninguno, valor 0).
 *
 * @param {string} texto
 * @returns { { opciones:number[], valor:number } }
 */
export function opcionesPenetracion(texto)
{
  const vacio = { opciones: [], valor: 0 };
  if (texto === undefined || texto === null) return vacio;

  let s = String(texto).trim();
  if (s === "" || s === "—" || s === "-") return vacio;

  // Quitamos un prefijo "P" inicial (con o sin espacios), si lo hay.
  s = s.replace(/^\s*[Pp]\s*/, "");

  // Separamos por "|" y nos quedamos con los números naturales.
  const opciones = s
    .split("|")
    .map(trozo => parseInt(String(trozo).trim(), 10))
    .filter(n => Number.isFinite(n) && n >= 0);

  if (opciones.length === 0) return vacio;

  return { opciones, valor: opciones[0] };
}

/**
 * Interpreta el texto de DAÑO de un arma y devuelve sus opciones. Es el
 * ESPEJO de opcionesPenetracion() para el daño.
 * Formatos admitidos:
 *   - ""             (vacío)     -> opciones: []              valor: ""
 *   - "3xL" / "M" / "1N"          -> opciones: ["3xL"]         valor: "3xL"
 *   - "L|2xL" / "M|2xL"          -> opciones: ["L","2xL"]     valor: "L" (el 1º)
 * Cada opción se VALIDA con Calculo.parseDano() (debe tener escala L/M/N); las
 * que no sean un daño válido se descartan. Si no queda ninguna, opciones [].
 *
 * @param {string} texto
 * @returns { { opciones:string[], valor:string } }
 */
export function opcionesDano(texto)
{
  const vacio = { opciones: [], valor: "" };
  if (texto === undefined || texto === null) return vacio;

  const s = String(texto).trim();
  if (s === "" || s === "—" || s === "-") return vacio;

  // Separamos por "|" y nos quedamos con las opciones que sean un daño VÁLIDO
  // (parseDano devuelve {cantidad,tipo} o null).
  const opciones = s
    .split("|")
    .map(trozo => String(trozo).trim())
    .filter(trozo => trozo !== "" && Calculo.parseDano(trozo) !== null);

  if (opciones.length === 0) return vacio;

  return { opciones, valor: opciones[0] };
}

/**
 * Daño RESUELTO de un arma del encuentro: la opción ELEGIDA (danoFinal) si
 * existe; si no, el daño crudo del arma (system.dano del clon "datos"). Es el
 * único punto que decide "qué daño se usa" en la cadena de cálculo, para que
 * TODAS las rutas (parseDano, _tipoDanoAtaque, danoLigero, daño base) usen la
 * misma notación.
 * @param {object} arma  Entrada de enc.armas.
 * @returns {string}
 */
function _danoResueltoDeArma(arma)
{
  const elegido = arma?.danoFinal;
  if (typeof elegido === "string" && elegido.trim() !== "") return elegido;
  return arma?.datos?.system?.dano ?? "";
}

/**
 * Éxitos asignados al ataque por defecto:
 *   - tirada operacionesAtacar SIN sinergia -> todos los éxitos (no editable).
 *   - tirada con sinergia -> 0 por defecto (el atacante reparte).
 */
function _exitosAtaqueInicial(tirada)
{
  const exitos = Number(tirada?.exitos ?? 0);
  if (tirada?.sinergia === true) return 0;
  if (faseDeAccion(tirada) === "operacionesAtacar") return exitos;
  return 0;
}

/**
 * Registra/actualiza los datos de defensa del actor defensor indicado dentro
 * del encuentro. La defensa de un defensor es una COLECCIÓN DE FUENTES
 * ("fuentes"): la suya propia (su tirada de operacionesDefender/operaciones con
 * sinergia) MÁS las que otros actores le hayan "prestado" con prestarDefensa().
 * Cada fuente trae sus propios éxitos disponibles y lo que el defensor toma de
 * ella. El defensor reparte libremente hasta el máximo de cada fuente.
 *
 * OJO: indexamos por actorId (id SIN puntos). NUNCA por uuid, porque un uuid
 * ("Actor.xxx") contiene puntos y al pasar por expandObject/setProperty se
 * trocearía en { Actor: { xxx: ... } }, rompiendo el diccionario.
 */
function _inicializarDefensa(encuentro, defensorUuid)
{
  const defensor = _normalizarActorDelMundo(fromUuidSync(defensorUuid));
  if (!defensor) return;

  // La entrada puede existir ya (p.ej. si se refresca); recreamos "fuentes"
  // conservando las que ya fueran PRESTADAS, pero refrescando la propia.
  const previa = encuentro.defensas[defensor.id];
  const prestadas = (previa?.fuentes ?? []).filter(f => f.propia !== true);

  const propia = _refFuenteDefensa(defensor, true);
  const fuentes = [];
  if (propia) fuentes.push(propia);
  fuentes.push(...prestadas);

  encuentro.defensas[defensor.id] = {
     actorUuid:        defensor.uuid
    ,actorId:          defensor.id
    ,nombre:           defensor.name
    ,img:              defensor.img
    ,fuentes:          fuentes
    ,confirmado:       previa?.confirmado === true
  };
}

/**
 * Construye la entrada de FUENTE de defensa que aporta un actor (él mismo como
 * defensor, o un tercero que le "presta" defensa).
 *
 * @param {Actor}  dueno   Actor dueño de la tirada/fuente (actor del mundo).
 * @param {boolean} propia true si es la fuente del PROPIO defensor.
 * @returns {object|null}  null si el dueño no tiene éxitos de defensa válidos.
 */
function _refFuenteDefensa(dueno, propia)
{
  const disp = _exitosDefensaDisponibles(dueno);
  if (disp.fuente === "ninguna" || disp.maximo <= 0) return null;

  return {
     actorUuid:     dueno.uuid
    ,actorId:       dueno.id
    ,actorNombre:   dueno.name
    ,img:           dueno.img
    ,slot:          disp.slot             // "tirada1" | "tirada2" | "tirada3"
    ,fuente:        disp.fuente           // "operacionesDefender" | "operacionesSinergia"
    ,disponible:    disp.maximo           // máximo que aporta esta fuente
    ,exitosDefensa: 0                     // lo que el defensor toma de ella
    ,propia:        propia === true
  };
}

/**
 * Suma de éxitos de defensa que el defensor ha tomado de TODAS sus fuentes.
 */
function _totalExitosDefensa(def)
{
  return (def?.fuentes ?? []).reduce((s, f) => s + Number(f.exitosDefensa ?? 0), 0);
}

/**
 * Suma de éxitos de defensa DISPONIBLES de todas las fuentes del defensor.
 */
function _totalDisponibleDefensa(def)
{
  return (def?.fuentes ?? []).reduce((s, f) => s + Number(f.disponible ?? 0), 0);
}

/**
 * Resumen serializable del estado de las fuentes de defensa, para comparar
 * "antes/después" y saber si algo cambió de verdad antes de difundir.
 */
function _resumenFuentesDefensa(def)
{
  return (def?.fuentes ?? [])
    .map(f => `${f.actorUuid}:${f.fuente}:${f.disponible}:${f.exitosDefensa}`)
    .join("|");
}

/**
 * Calcula los éxitos de defensa disponibles de un actor.
 * Devuelve { fuente, maximo, slot }:
 *   - fuente: "operacionesDefender" | "operacionesSinergia" | "ninguna"
 *   - maximo: éxitos que puede aportar
 *   - slot:   "tirada1" | "tirada2" | "tirada3" de donde salen (para poder consumir después)
 *
 * Reglas (prioridad):
 *   1) Una tirada en fase "operacionesDefender".
 *   2) Una tirada de operaciones con sinergia true (resto reutilizable).
 */
function _exitosDefensaDisponibles(defensor)
{
  const s = defensor.system;

  // Recorremos TODOS los slots de tirada (tirada1/tirada2/tirada3) en el orden
  // canónico. Construimos los pares [slot, tirada] una sola vez.
  const pares = SLOTS_TIRADA.map(slot => [slot, s?.[slot]]);

  // 1) Prioridad: una tirada en fase "operacionesDefender".
  for (const [slot, t] of pares)
  {
    if (faseDeAccion(t) === "operacionesDefender" && _esNumerico(t?.exitos))
    {
      return { fuente: "operacionesDefender", maximo: Number(t.exitos), slot };
    }
  }

  // 2) Tirada de operaciones con sinergia (resto reutilizable).
  for (const [slot, t] of pares)
  {
    if (t?.superFase === "operaciones" && t?.sinergia === true && _esNumerico(t.exitos))
    {
      return { fuente: "operacionesSinergia", maximo: Number(t.exitos), slot };
    }
  }

  return { fuente: "ninguna", maximo: 0, slot: null };
}

function _esNumerico(v)
{
  return typeof v === "number" && !Number.isNaN(v);
}

/** Devuelve el snapshot de un encuentro (o null). */
export function obtenerEncuentro(id)
{
  return encuentros()[id] ?? null;
}

/**
 * Devuelve la lista de encuentros VIVOS (estado != "cerrado"). Sirve para que
 * la ventana de fuego concentrado ofrezca como destino los ataques en curso.
 * @returns {object[]}
 */
export function encuentrosVivos()
{
  return Object.values(encuentros()).filter(e => e && e.estado !== "cerrado");
}

/**
 * Lista ligera de los encuentros vivos donde hay un ATACANTE, para el selector
 * del diálogo de FUEGO CONCENTRADO. Excluye opcionalmente al actor indicado
 * (normalmente el propio actor que presta el arma, para no añadirse a sí mismo).
 *
 * @param {string} [excluirAtacanteUuid]
 * @returns {Array<{ encuentroId, atacanteUuid, atacanteNombre, atacanteImg,
 *                   armaNombre, atacanteId }>}
 */
export function atacantesEnConflicto(excluirAtacanteUuid = null)
{
  const res = [];
  for (const enc of encuentrosVivos())
  {
    if (!enc?.atacanteUuid) continue;
    if (excluirAtacanteUuid && enc.atacanteUuid === excluirAtacanteUuid) continue;
    res.push({
       encuentroId:     enc.id
      ,atacanteUuid:    enc.atacanteUuid
      ,atacanteId:      enc.atacanteId
      ,atacanteNombre:  enc.atacanteNombre
      ,atacanteImg:     enc.atacanteImg
      // Nombre del arma principal (la del propio atacante) para dar contexto.
      ,armaNombre:      enc.armas?.[0]?.nombre ?? "—"
    });
  }
  return res;
}

/**
 * Lista ligera de los DEFENSORES de encuentros vivos, para el selector del
 * diálogo de PRESTAR DEFENSA. Reúne a TODOS los que figuran como objetivo
 * (defensor) en algún encuentro activo, sin duplicar (un mismo actor puede ser
 * defensor en varios encuentros). Excluye opcionalmente al actor indicado
 * (normalmente el propio actor que presta defensa, para no prestarse a sí mismo).
 *
 * @param {string} [excluirUuid]
 * @returns {Array<{ defensorUuid, defensorId, defensorNombre, defensorImg,
 *                   encuentroId, atacanteNombre }>}
 *          Si un defensor aparece en varios encuentros, se devuelve una fila
 *          por encuentro (el prestador debe elegir a QUÉ encuentro presta).
 */
export function defensoresEnConflicto(excluirUuid = null)
{
  const res = [];
  for (const enc of encuentrosVivos())
  {
    // Si el ataque ya está confirmado y ese defensor ya confirmó, no tiene
    // sentido prestarle defensa a posteriori.
    for (const obj of (enc.objetivos ?? []))
    {
      if (excluirUuid && obj.actorUuid === excluirUuid) continue;
      const def = _defensaDe(enc, obj.actorUuid);
      if (!def || def.confirmado === true) continue;
      res.push({
         encuentroId:     enc.id
        ,defensorUuid:    obj.actorUuid
        ,defensorId:      obj.actorId
        ,defensorNombre:  obj.nombre
        ,defensorImg:     obj.img
        ,atacanteNombre:  enc.atacanteNombre
      });
    }
  }
  return res;
}

/**
 * REFRESCA EN TIEMPO REAL la defensa de un actor en TODOS los encuentros vivos
 * en los que figure como defensor (objetivo).
 *
 * Caso de uso: al jugador defensor se le olvidó tirar por defensa. Cuando fija
 * (guarda) una tirada MÁS TARDE (p.ej. una tirada de "operacionesDefender" o de
 * operaciones con sinergia), su "disponible" en los encuentros que ya estaban
 * abiertos se quedó obsoleto (era 0 o el valor antiguo). Esta función recorre
 * todos los encuentros vivos donde ese actor es defensor, recalcula su fuente y
 * su disponible, y DIFUNDE cada encuentro que haya cambiado para que las
 * ventanas (atacante y defensor) se actualicen al instante.
 *
 * @param {Actor|string} actor Actor (o su uuid) cuya defensa hay que refrescar.
 * @returns {Promise<number>} nº de encuentros actualizados.
 */
export async function refrescarDefensaDeActor(actor)
{
  // Resolvemos SIEMPRE el actor del mundo. Si nos llega un Actor ya resuelto
  // (p.ej. la hoja abierta desde un TOKEN), _normalizarActorDelMundo lo lleva
  // al del mundo: así leemos/actualizamos la misma fuente que ven las ventanas.
  const a = (typeof actor === "string")
    ? _normalizarActorDelMundo(fromUuidSync(actor))
    : _normalizarActorDelMundo(actor);
  if (!a) return 0;

  let actualizados = 0;
  for (const enc of encuentrosVivos())
  {
    // ¿Participa este actor como DEFENSOR (objetivo) en el encuentro?
    const esObjetivo = (enc.objetivos ?? []).some(o => o.actorUuid === a.uuid);
    if (!esObjetivo) continue;

    const def = _defensaDe(enc, a.uuid);
    if (!def) continue;

    // Guardamos un "resumen" del estado anterior para saber si cambió algo de
    // verdad (fuente, máximo o éxitos tomados de cada fuente).
    const antes = _resumenFuentesDefensa(def);

    // Recalcula fuente + disponible de cada fuente (y recorta lo asignado si ya
    // no cabe) leyendo la tirada del actor del mundo (a), NO del re-resuelto.
    _refrescarDisponibleDefensaDeActor(enc, a.uuid, a);

    if (_resumenFuentesDefensa(def) !== antes)
    {
      await _difundir(enc.id);
      actualizados++;
    }
  }
  return actualizados;
}

// ---------------------------------------------------------------------------
// Mutaciones de un encuentro (las hace el cliente que tiene la ventana)
// ---------------------------------------------------------------------------

/**
 * Añade un objetivo al encuentro (dedupe por actorUuid). Devuelve true si
 * cambió algo.
 */
export async function anadirObjetivo(encuentroId, actor)
{
  const enc = encuentros()[encuentroId];
  if (!enc || !actor) return false;

  // Normalizamos SIEMPRE al actor del mundo (independiente de tokens).
  const objetivo = _normalizarActorDelMundo(actor);
  if (!objetivo) return false;

  if (enc.objetivos.some(o => o.actorUuid === objetivo.uuid)) return false;
  // No permitir atacarse a sí mismo.
  if (objetivo.uuid === enc.atacanteUuid) return false;
  // Solo se puede añadir como objetivo a quien ESTÁ en el combate activo.
  if (!objetivosDelCombate().some(a => a.uuid === objetivo.uuid)) return false;

  enc.objetivos.push(_ref(objetivo));
  _inicializarDefensa(enc, objetivo.uuid);

  await _difundir(encuentroId);
  return true;
}

/** Quita un objetivo del encuentro (y cierra su ventana de defensor). */
export async function quitarObjetivo(encuentroId, actorUuid)
{
  const enc = encuentros()[encuentroId];
  if (!enc) return false;
  const antes = enc.objetivos.length;
  enc.objetivos = enc.objetivos.filter(o => o.actorUuid !== actorUuid);
  // La defensa se indexa por actorId; calculamos ese id desde el uuid.
  const id = _idDesdeUuid(actorUuid);
  if (id) delete enc.defensas[id];
  if (enc.objetivos.length === antes) return false;

  await _difundir(encuentroId);
  return true;
}

/**
 * Fija los éxitos de ataque asignados a UNA arma concreta (por índice dentro
 * de enc.armas). Valida que no exceda el máximo asignable de esa arma.
 */
export async function fijarExitosAtaque(encuentroId, indice, valor)
{
  const enc = encuentros()[encuentroId];
  if (!enc || enc.ataqueConfirmado) return false;

  const arma = enc.armas?.[indice];
  if (!arma) return false;

  let v = Number(valor) || 0;
  if (v < 0) v = 0;
  if (v > arma.exitosTirada) v = arma.exitosTirada;

  arma.exitosAtaque = v;
  await _difundir(encuentroId);
  return true;
}

/**
 * Fija la PENETRACIÓN FINAL de UNA arma concreta (por índice dentro de
 * enc.armas). La usa el atacante cuando el arma tiene varias penetraciones
 * posibles ("Pn|m": decisiones narrativas). Solo admite valores que estén entre
 * las opciones de esa arma. Si el arma tiene una sola opción (o ninguna), no se
 * permite cambiarla.
 */
export async function fijarPenetracionFinal(encuentroId, indice, valor)
{
  const enc = encuentros()[encuentroId];
  if (!enc || enc.ataqueConfirmado) return false;

  const arma = enc.armas?.[indice];
  if (!arma) return false;

  const opciones = arma.penetracionOpciones ?? [];
  // Solo se puede elegir si hay MÁS DE UNA opción (formato "Pn|m").
  if (opciones.length <= 1) return false;

  const v = Number(valor);
  if (!opciones.includes(v)) return false;

  arma.penetracionFinal = v;
  await _difundir(encuentroId);
  return true;
}

/**
 * Fija el DAÑO FINAL de UNA arma concreta (por índice dentro de enc.armas).
 * Es el ESPEJO de fijarPenetracionFinal() para el daño: lo usa el RECEPTOR
 * (atacante) cuando el arma tiene varias notaciones posibles ("L|2xL"). Solo
 * admite valores que estén entre las opciones de esa arma. Si el arma tiene una
 * sola opción (o ninguna), no se permite cambiarla.
 */
export async function fijarDanoFinal(encuentroId, indice, valor)
{
  const enc = encuentros()[encuentroId];
  if (!enc || enc.ataqueConfirmado) return false;

  const arma = enc.armas?.[indice];
  if (!arma) return false;

  const opciones = arma.danoOpciones ?? [];
  // Solo se puede elegir si hay MÁS DE UNA opción (formato "L|2xL").
  if (opciones.length <= 1) return false;

  const v = String(valor);
  if (!opciones.includes(v)) return false;

  arma.danoFinal = v;
  await _difundir(encuentroId);
  return true;
}

/**
 * PRESTA un arma a un encuentro ajeno para el FUEGO CONCENTRADO.
 * El arma llega ya construida con _refArmaDesdeTirada(dueno, slot, tirada).
 * Se deduplica por (actorUuid + slot) para no añadir dos veces la misma tirada.
 * No se permite añadir si el ataque ya está confirmado.
 */
export async function prestarArma(encuentroId, armaRef)
{
  const enc = encuentros()[encuentroId];
  if (!enc || !armaRef) return false;
  if (enc.ataqueConfirmado) return false;

  // No duplicar la misma arma (mismo dueño + misma tirada).
  if (enc.armas.some(a => a.actorUuid === armaRef.actorUuid && a.slot === armaRef.slot)) return false;

  enc.armas.push({
     ...armaRef
    ,exitosAtaque: 0
    ,principal:    false
  });

  _log(enc, t("Ad6.Log.fuegoConcentrado", { actor: armaRef.actorNombre, arma: armaRef.nombre, exitos: armaRef.exitosTirada }));
  await _difundir(encuentroId);
  return true;
}

/**
 * PRESTA defensa a un defensor concreto de un encuentro. Registra una FUENTE
 * de defensa adicional (aportada por el actor que presta) en la colección
 * "fuentes" de ese defensor, para que el defensor pueda tomar de ella hasta su
 * máximo al repartir su defensa.
 *
 * @param {string} encuentroId
 * @param {string} defensorUuid    uuid del defensor que la recibe.
 * @param {object} fuenteRef       fuente ya construida con _refFuenteDefensa.
 * @returns {Promise<boolean>}     true si se añadió; false si no procedía.
 *
 * No se permite si el defensor ya confirmó su defensa. Se deduplica por
 * (actorUuid prestador + encuentro + defensor): no se presta dos veces la misma
 * fuente al mismo defensor.
 */
export async function prestarDefensa(encuentroId, defensorUuid, fuenteRef)
{
  const enc = encuentros()[encuentroId];
  if (!enc || !fuenteRef) return false;

  const def = _defensaDe(enc, defensorUuid);
  if (!def) return false;
  if (def.confirmado === true) return false;

  // No duplicar la misma fuente (mismo actor prestador) en ese defensor.
  if (def.fuentes.some(f => f.actorUuid === fuenteRef.actorUuid)) return false;

  def.fuentes.push({
     ...fuenteRef
    ,exitosDefensa: 0
    ,propia:        false
  });

  _log(enc, t("Ad6.Log.prestaDefensa", { actor: fuenteRef.actorNombre, exitos: fuenteRef.disponible, defensor: def.nombre }));
  await _difundir(encuentroId);
  return true;
}

/**
 * Confirma el ataque. A partir de aquí no se toca. Además CONSUME los éxitos
 * usados de la tirada del atacante (en SU propio actor, sin permisos cruzados).
 */
export async function confirmarAtaque(encuentroId)
{
  const enc = encuentros()[encuentroId];
  if (!enc || enc.ataqueConfirmado) return false;

  // Consumimos, arma a arma, los éxitos usados de la tirada de SU dueño.
  // Para el arma principal el dueño es el atacante (lo escribe su propio
  // cliente sin permisos cruzados); para las armas prestadas puede ser otro
  // actor (si este cliente no lo posee, _consumirExitosTirada lo ignora).
  for (const arma of (enc.armas ?? []))
  {
    await _consumirExitosTirada(arma.actorUuid, arma.slot, Number(arma.exitosAtaque ?? 0));
    _log(enc, t("Ad6.Log.ataqueUsa", { atacante: enc.atacanteNombre, exitos: arma.exitosAtaque ?? 0, arma: arma.nombre || "—", dueno: arma.actorNombre }));
  }

  // Refrescamos los disponibles de cada defensor: su tirada pudo cambiar entre
  // que se abrió el encuentro y ahora (agrupaciones, gastos, etc.).
  for (const obj of enc.objetivos)
  {
    _refrescarDisponibleDefensa(enc, obj.actorUuid);
  }

  enc.ataqueConfirmado = true;
  await _difundir(encuentroId);
  return true;
}

/** Suma de los éxitos de ataque asignados a TODAS las armas del encuentro. */
function _totalExitosAtaque(enc)
{
  return (enc?.armas ?? []).reduce((s, a) => s + Number(a.exitosAtaque ?? 0), 0);
}

/**
 * Recalcula el "disponible" y la "fuente" de defensa de un defensor a partir
 * de su estado actual (sin tocar lo que ya haya asignado si sigue siendo válido).
 */
function _refrescarDisponibleDefensa(enc, defensorUuid)
{
  const defensor = _normalizarActorDelMundo(fromUuidSync(defensorUuid));
  if (!defensor) return;
  _refrescarDisponibleDefensaDeActor(enc, defensorUuid, defensor);
}

/**
 * Variante de _refrescarDisponibleDefensa que RECIBE el actor ya resuelto.
 *
 * Por qué: si nos llega el Actor del mundo resuelto desde la hoja (o ya lo
 * tenemos), NO hay que volver a resolverlo por uuid, porque en el caso de una
 * ficha abierta desde un TOKEN el documento "vivo" es el sintético y sus
 * updates pueden no estar en la copia del mundo (tokens unlinked). Recalculando
 * con el MISMO documento que se acaba de actualizar, el disponible queda
 * siempre coherente con lo que el jugador ve en su ficha.
 */
function _refrescarDisponibleDefensaDeActor(enc, defensorUuid, defensor)
{
  const def = _defensaDe(enc, defensorUuid);
  if (!def || !defensor) return;

  // Aseguramos que la FUENTE PROPIA exista. Puede no existir todavía si el
  // defensor no había tirado al abrirse el encuentro y ahora fija su tirada
  // tarde (operacionesDefender / operaciones con sinergia): en ese caso hay que
  // CREARLA para que el defensor pueda repartir de ella.
  const tienePropia = def.fuentes.some(f => f.propia === true);
  if (!tienePropia)
  {
    const nuevaPropia = _refFuenteDefensa(defensor, true);
    if (nuevaPropia) def.fuentes.unshift(nuevaPropia);
  }

  // Refrescamos CADA fuente por separado: la propia (la del defensor) y las
  // prestadas (re-resolviendo a su dueño). Recalculamos "disponible" y
  // recortamos lo tomado si ya no cabe en el nuevo máximo.
  for (const f of def.fuentes)
  {
    const dueno = f.propia
      ? defensor
      : _normalizarActorDelMundo(fromUuidSync(f.actorUuid));
    if (!dueno) continue;

    const disp = _exitosDefensaDisponibles(dueno);
    f.fuente = disp.fuente;
    f.slot = disp.slot;
    f.disponible = disp.maximo;
    if (f.exitosDefensa > f.disponible) f.exitosDefensa = f.disponible;
  }
}

/**
 * Fija los éxitos de defensa tomados de UNA fuente concreta (por índice dentro
 * de def.fuentes). Valida que no exceda el máximo de esa fuente.
 *
 * defensorUuid puede ser el uuid ("Actor.<id>") o el actorId; _defensaDe lo
 * resuelve.
 */
export async function fijarExitosDefensa(encuentroId, defensorUuid, indice, valor)
{
  const enc = encuentros()[encuentroId];
  if (!enc) return false;
  const def = _defensaDe(enc, defensorUuid);
  if (!def || def.confirmado) return false;

  const fuente = def.fuentes?.[indice];
  if (!fuente) return false;

  let v = Number(valor) || 0;
  if (v < 0) v = 0;
  if (v > fuente.disponible) v = fuente.disponible;

  fuente.exitosDefensa = v;
  await _difundir(encuentroId);
  return true;
}

/**
 * Confirma la defensa de un defensor. Consume los éxitos usados de su tirada
 * (en su propio actor) y, si ya han confirmado ataque + todos los defensores,
 * marca el encuentro como resuelto.
 */
export async function confirmarDefensa(encuentroId, defensorUuid)
{
  const enc = encuentros()[encuentroId];
  if (!enc) return false;
  let def = _defensaDe(enc, defensorUuid);

  // Salvaguarda: si NO existe entrada de defensa (defensa en blanco, p.ej. un
  // actor sin tiradas), la creamos para poder confirmar aunque no aporte éxito
  // alguno. Así la acción nunca se traba.
  if (!def)
  {
    _inicializarDefensa(enc, defensorUuid);
    def = _defensaDe(enc, defensorUuid);
  }
  if (!def || def.confirmado) return false;

  // Consumimos, FUENTE A FUENTE, los éxitos usados de la tirada de SU dueño.
  // La fuente propia la escribe el propio defensor; las prestadas pueden ser de
  // otro actor (si este cliente no lo posee, _consumirExitosTiradaDeFuente lo
  // ignora silenciosamente).
  for (const f of def.fuentes)
  {
    await _consumirExitosTiradaDeFuente(f.actorUuid, f.slot, Number(f.exitosDefensa ?? 0));
    // NOTA: esta línea se comenta porque el detalle de las fuentes de defensa
    // (propia + prestadas) YA se muestra en la parte superior de la ventana.
    // Se deja por si en el futuro se quiere volver a loguear.
    // if (Number(f.exitosDefensa ?? 0) > 0)
    // {
    //   _log(enc, `DEFENSA: ${f.actorNombre} aporta ${f.exitosDefensa} éxito(s)${f.propia ? "" : " (defensa prestada)"}.`);
    // }
  }

  def.confirmado = true;
  _log(enc, t("Ad6.Log.defensaTotal", { defensor: def.nombre, exitos: _totalExitosDefensa(def) }));

  _evaluarResolucion(enc);
  await _difundir(encuentroId);
  return true;
}

/** ¿Están confirmados ataque y TODOS los defensores? -> resolvemos. */
function _evaluarResolucion(enc)
{
  
  if (!enc.ataqueConfirmado) return;
  const defensores = enc.objetivos.map(o => _defensaDe(enc, o.actorUuid)).filter(Boolean);
  if (defensores.length === 0) return;
  if (!defensores.every(d => d.confirmado)) return;

  enc.estado = "resuelto";
  _log(enc, t("Ad6.Log.resolucionTitulo"));

  // Datos de las armas que aportan datos al ataque (daño en texto + atributos
  // de energía/melee/ligero/área/penetración por arma). Se usan para el cálculo
  // del daño.
  const armasAtaque = (enc.armas ?? []).map(a => ({
     nombre:          a.nombre || "—"
    // DAÑO RESUELTO: usamos la opción ELEGIDA (danoFinal) si existe; si no, el
    // daño crudo del arma. Así toda la cadena de cálculo (parseDano, tipoDano,
    // danoLigero, daño base) trabaja sobre la MISMA notación elegida.
    ,danoTexto:       _danoResueltoDeArma(a)
    ,exitos:          Number(a.exitosAtaque ?? 0)
    ,danoEnergia:     a?.datos?.system?.danoEnergia === true
    ,danoMelee:       a?.datos?.system?.danoMelee === true
    // Daño LIGERO EN ORIGEN: el tipo NATURAL de la notación ELEGIDA es L (no el
    // tipo del daño total, que puede haber "subido" al sumar). Alimenta la
    // resistencia "ligero".
    ,danoLigero:      Calculo.parseDano(_danoResueltoDeArma(a))?.tipo === "L"
    // ¿El arma tiene campo de ÁREA no vacío? (B1, L100, C...). Alimenta la
    // resistencia "area".
    ,tieneArea:       String(a?.datos?.system?.area ?? "").trim() !== ""
    ,penetracionFinal: Number(a.penetracionFinal ?? 0) || 0
  }));

  for (const o of enc.objetivos)
  {
    const d = _defensaDe(enc, o.actorUuid);
    if (!d) continue;

    // Llamada a la lógica de daño de ESTE objetivo (defensor), que reparte la
    // defensa, calcula el daño base, la armadura efectiva y aplica/informa.
    _resolverDanoDeObjetivo(enc, o, d, armasAtaque);
  }
}

// ---------------------------------------------------------------------------
// Cálculo y aplicación del daño a un objetivo (defensor)
// ---------------------------------------------------------------------------

/**
 * Resuelve el daño de UN objetivo del encuentro:
 *   1) Calcula el daño base del ataque para ESE defensor, repartiendo sus
 *      éxitos de defensa entre las armas (ver Calculo.calcularDanoAtaque).
 *   2) Resuelve el actor objetivo (actor del mundo).
 *   3) Según el TIPO de objetivo:
 *        - vehículo -> armadura + estructura, y decide aplicar o informar.
 *        - otro     -> [HUECO-DANO-OTROS] (se verá más adelante).
 *   4) Escribe el detalle en el log del encuentro.
 *
 * NO muta el arma ni la entrada de defensa del encuentro (el cálculo puro
 * trabaja sobre copias). Solo puede escribir en los DOCUMENTOS del objetivo
 * (estructura del vehículo) en los casos que corresponda.
 *
 * @param {object} enc        Encuentro.
 * @param {object} objetivo   Entrada de objetivos ({ actorUuid, nombre, ... }).
 * @param {object} def        Entrada de defensa del objetivo.
 * @param {Array}  armasAtaque Datos de las armas (nombre, danoTexto, exitos,
 *                            danoEnergia, danoMelee, danoLigero, tieneArea,
 *                            penetracionFinal).
 */
function _resolverDanoDeObjetivo(enc, objetivo, def, armasAtaque)
{
  const exitosDefensa = _totalExitosDefensa(def);
  // 1) Daño base (comparte mecanismo puro).
  const resultado = Calculo.calcularDanoAtaque(armasAtaque, exitosDefensa);

  _log(enc, t("Ad6.Log.danoCabecera", { atacante: enc.atacanteNombre, defensor: def.nombre }));
  _logSangrado(enc, t("Ad6.Log.defensaAplicada", { exitos: exitosDefensa }), null, 1);
  _logDetalle(enc, resultado.detalle, "", 1);
  _logSangrado(enc, t("Ad6.Log.danoBaseTotal", { total: resultado.totalTexto }), null, 1);

  if (resultado.total.length === 0)
  {
    _logNivel(enc, "sinDano", t("Ad6.Log.sinDanoDefensa"));
    return;
  }

  // 2) Actor objetivo.
  const actorObj = _normalizarActorDelMundo(fromUuidSync(objetivo.actorUuid));
  if (!actorObj)
  {
    _logSangrado(enc, t("Ad6.Log.objetivoNoResuelto"), null, 1);
    return;
  }

  // 3) Según tipo.
  if (actorObj.type === "vehiculo")
  {
    _resolverDanoVehiculo(enc, actorObj, resultado, armasAtaque);
  }
  else if (actorObj.type === "principal" || actorObj.type === "teniente")
  {
    // Actores "a pie" (persona): armadura combinada (item + especie) y heridas.
    _resolverDanoPersona(enc, actorObj, resultado, armasAtaque);
  }
  else if (actorObj.type === "enjambre")
  {
    // Enjambre: unidades idénticas formadas en system.formacion. El daño se
    // resuelve por miembro (división ENTERA) y las bajas se aplican/escriben.
    _resolverDanoEnjambre(enc, actorObj, resultado, armasAtaque);
  }
  else
  {
    // [HUECO-DANO-OTROS] Otros tipos: se verá en requerimientos siguientes.
    _log(enc, t("Ad6.Log.objetivoNoSoportado", { nombre: actorObj.name, tipo: actorObj.type }));
  }
}

/**
 * Resuelve el daño contra un ENJAMBRE objetivo.
 *
 * Un enjambre agrupa unidades IDÉNTICAS en system.formacion (array de
 * Ad6_MiembroEnjambre). REGLA CLAVE: al enjambre NO se le consume nada (ni
 * armadura, ni escudo, ni estructura); todas las unidades están "enteras" o
 * "derrotadas". Por eso el coste de destruir UNA unidad es un valor FIJO y las
 * bajas por miembro se calculan con una DIVISIÓN ENTERA:
 *
 *     unidades = min( cantidad, floor( dañoTotalL / costeUnidadL ) )
 *
 * El daño SOBRANTE pasa al siguiente miembro. El ORDEN de imputación entre
 * miembros es ALEATORIO (ordenAleatorio), para no favorecer sistemáticamente a
 * los primeros de la formación.
 *
 * La ARMADURA principal SÍ se aplica (resistencias/penetración) pero NO se
 * consume; el ESCUDO también se aplica una vez (cada unidad lo tiene completo).
 * Todo el cálculo vive, puro, en ad6_calculoEnjambre.mjs.
 *
 * La ESCRITURA de las bajas (cantidad) se hace si este cliente puede editar el
 * actor enjambre; si no, el resultado queda en el log.
 *
 * @param {object} enc         Encuentro (para el log).
 * @param {Actor}  enjambre    Actor enjambre objetivo.
 * @param {object} resultado   Salida de Calculo.calcularDanoAtaque.
 * @param {Array}  armasAtaque Datos de armas (energía/melee/ligero/área/penetración).
 */
function _resolverDanoEnjambre(enc, enjambre, resultado, armasAtaque)
{
  const formacion = foundry.utils.deepClone(enjambre.system?.formacion ?? []);
  if (!Array.isArray(formacion) || formacion.length === 0)
  {
    _log(enc, t("Ad6.Log.enjambreSinFormacion", { nombre: enjambre.name }));
    return;
  }

  // Atributos del ataque (energía/melee/penetración), igual que vehículo/persona.
  const fuegoConcentrado = (armasAtaque ?? []).length > 1;
  const tipoDano = _tipoDanoAtaque(armasAtaque, resultado.total);
  const atributos = _atributosAtaque(armasAtaque, tipoDano, fuegoConcentrado);

  // Orden ALEATORIO de imputación entre los miembros de la formación.
  const orden = CalculoEnjambre.ordenAleatorio(formacion.length);

  // Cálculo PURO: qué le pasa a cada miembro (no muta nada).
  const calc = CalculoEnjambre.resolverFormacion(resultado.total, formacion, orden, atributos);

  // Volcado del detalle al log del encuentro.
  _logDetalle(enc, calc.detalle);

  // Imputación por miembro, en orden, con escritura de bajas.
  for (const r of calc.resultados)
  {
    if (r.unidades <= 0) continue;
    if (r.cantidadFinal <= 0)
    {
      _logNivel(enc, "destruido", t("Ad6.Log.enjambreAniquilado", { nombre: r.nombre }), null, 1);
    }
    else
    {
      _logNivel(enc, "aplicar", t("Ad6.Log.enjambreUnidadesDestruidas", { nombre: r.nombre, unidades: r.unidades, quedan: r.cantidadFinal }), null, 1);
    }
  }

  if (calc.danoSobrante.length > 0)
  {
    _logSangrado(enc, t("Ad6.Log.enjambreDanoSobrante", { dano: Calculo.formatearDano(calc.danoSobrante) }), null, 1);
  }

  // ¿Hubo alguna baja?
  const algunCambio = calc.resultados.some(r => r.unidades > 0);

  if (!algunCambio)
  {
    _logNivel(enc, "sinDano", t("Ad6.Log.enjambreSinBajas"));
    return;
  }

  // ESCRITURA de las nuevas cantidades en la formación del miembro enjambre.
  const puedeEscribir = enjambre.isOwner || game.user.isGM;
  if (!puedeEscribir)
  {
    _log(enc, t("Ad6.Log.enjambreSinPermiso", { nombre: enjambre.name }));
    return;
  }

  // Reconstruimos la formación actualizada conservando el resto de campos de
  // cada miembro y solo cambiando "cantidad" en los que tuvieron bajas.
  const nuevaFormacion = foundry.utils.deepClone(formacion);
  for (const r of calc.resultados)
  {
    if (r.unidades <= 0) continue;
    nuevaFormacion[r.indice].cantidad = r.cantidadFinal;
  }

  // INVARIANTE: system.unidades = suma de las cantidades de la formación.
  // Lo recalculamos tras aplicar las bajas para mantenerlo coherente.
  const totalUnidades = nuevaFormacion.reduce(
    (s, m) => s + (Math.max(0, Number(m?.cantidad) || 0)), 0);

  enjambre.update({
     "system.formacion": nuevaFormacion
    ,"system.unidades":  totalUnidades
  });

  _log(enc, t("Ad6.Log.enjambreUnidadesTotales", { total: totalUnidades }));
}

/**
 * Resuelve el daño contra un actor A PIE (principal o teniente).
 *
 * Comparte con el vehículo TODO el mecanismo de ARMADURA:
 *   1) Combina las armaduras del actor (item equipado + armadura de especie) en
 *      UNA sola protección con Calculo.combinarArmaduras().
 *   2) Calcula la armadura EFECTIVA (energía/no-melee + penetración).
 *   3) Absorbe el daño COMPUESTO contra esa armadura (la armadura NO se consume).
 * Lo NUEVO es la aplicación a HERIDAS: el daño que TRASPASA se convierte en
 * "heridas completas" según system.heridasParams.valorHeridas y se MARCAN en
 * system.heridas (marcado:true), siempre (no hay decisión del defensor).
 *
 * No se pide confirmación al defensor: se marcan las heridas de forma
 * automática. Si el cliente no puede escribir el actor, el resultado queda en
 * el log.
 *
 * @param {object} enc         Encuentro (para el log).
 * @param {Actor}  actor       Actor persona objetivo.
 * @param {object} resultado   Salida de Calculo.calcularDanoAtaque.
 * @param {Array}  armasAtaque Datos de armas (energía/melee/ligero/área/penetración).
 */
function _resolverDanoPersona(enc, actor, resultado, armasAtaque)
{
  // --- ARMADURA (mismo mecanismo que el vehículo) ---
  const fuegoConcentrado = (armasAtaque ?? []).length > 1;
  const tipoDano = _tipoDanoAtaque(armasAtaque, resultado.total);
  const atributos = _atributosAtaque(armasAtaque, tipoDano, fuegoConcentrado);

  const proteccion = _armaduraPersona(actor);

  // Daño que PASA (empieza siendo el daño base COMPLETO, como lista de pares).
  let danoQuePasa = resultado.total;

  if (proteccion)
  {
    const armaduraCalc = Calculo.calcularArmaduraEfectiva(proteccion, atributos);

    _logSangrado(enc, t("Ad6.Log.personaArmadura", {
       base:  armaduraCalc.base
      ,escala: armaduraCalc.tipo ?? ""
      ,bonos: (armaduraCalc.bonos ? t("Ad6.Log.personaArmaduraBonos", { bonos: armaduraCalc.bonos }) : "")
      ,penetracion: (armaduraCalc.penetracionAplicada ? t("Ad6.Log.personaArmaduraPen", { penetracion: armaduraCalc.penetracionAplicada }) : "")
      ,final: armaduraCalc.armaduraFinal
    }), null, 1);

    if (proteccion.extras && proteccion.extras.length > 0)
    {
      const det = proteccion.extras
        .map(e => `${e.restante}${e.tipo ?? "?"}`)
        .join(", ");
      _logSangrado(enc, t("Ad6.Log.personaArmaduraExtra", { nombre: actor.name, detalle: det }), null, 1);
    }

    const absor = Calculo.absorberDanoCompuesto(
       resultado.total
      ,armaduraCalc.tipo
      ,armaduraCalc.armaduraFinal
    );
    danoQuePasa = absor.pasan;
    _logSangrado(enc, t("Ad6.Log.danoDelAtaque", { dano: Calculo.formatearDano(danoQuePasa) }), null, 1);
  }

  // Sin armadura o sin daño que pase -> sin heridas.
  if (danoQuePasa.length === 0)
  {
    _logNivel(enc, "sinDano", t("Ad6.Log.sinDanoArmaduraAbsorbio"));
    return;
  }

  // --- HERIDAS ---
  const valorHerida = Calculo.parseValorHerida(actor.system?.heridasParams?.valorHeridas);
  if (!valorHerida)
  {
    _logSangrado(enc, t("Ad6.Log.sinValorHeridas", { nombre: actor.name }), null, 1);
    return;
  }

  const calcHeridas = Calculo.heridasAImputar(danoQuePasa, valorHerida);
  if (calcHeridas.heridas <= 0)
  {
    _logNivel(enc, "sinDano", t("Ad6.Log.sinHeridasCompletas", {
       dano: Calculo.formatearDano(danoQuePasa)
      ,cantidad: valorHerida.cantidad
      ,tipo: valorHerida.tipo
    }));
    return;
  }

  _logSangrado(enc, t("Ad6.Log.heridasCalculo", {
     dano: Calculo.formatearDano(danoQuePasa)
    ,cantidad: valorHerida.cantidad
    ,tipo: valorHerida.tipo
    ,heridas: calcHeridas.heridas
  }), null, 1);

  // Aplicación: marcar las N primeras heridas PENDIENTES (visible && !marcado).
  const res = _aplicarHeridas(actor, calcHeridas.heridas, enc);

  if (res.marcadas === 0)
  {
    _logSangrado(enc, t("Ad6.Log.sinHeridasPendientes", { nombre: actor.name }), null, 1);
    return;
  }

  if (res.fueraDeCombate)
  {
    _logNivel(enc, "destruido", t("Ad6.Log.fueraDeCombate", { nombre: actor.name, marcadas: res.marcadas }));
  }
  else
  {
    _logNivel(enc, "aplicar", t("Ad6.Log.heridasMarcadas", { nombre: actor.name, marcadas: res.marcadas, pendientes: res.pendientes }));
  }

  if (!res.escrito)
  {
    _logSangrado(enc, t("Ad6.Log.sinPermisoHeridas", { nombre: actor.name }), null, 1);
  }
}

/**
 * Construye la protección (armadura) COMBINADA de un actor persona:
 *   - la armadura de ITEM equipada (la que NO es ablativa: el "traje" normal),
 *   - más la armadura natural de ESPECIE (system.heridasParams.armadura).
 * Usa Calculo.combinarArmaduras() (misma lógica que el enjambre) para no
 * duplicar la suma de campos, resistencias por descriptor y elección del tipo.
 * Ignora escudos ablativos (esos van por otro camino, no son "armadura").
 *
 * Si la combinación produce "extras" (armadura de una escala distinta a la del
 * tipo mayor), se registran en el log. En la práctica un actor a pie suele tener
 * una sola escala, así que el caso normal es exacto.
 *
 * @param {Actor} actor
 * @returns {object|null} protección (Ad6_Proteccion plana) o null si no hay.
 */
function _armaduraPersona(actor)
{
  const armaduras = actor.items?.filter?.(i => i.type === "armadura") ?? [];
  // Armadura de ITEM equipada y NO ablativa (el traje/armadura normal).
  const itemPrincipal = armaduras.find(i => i.system?.equipada === true && i.system?.armadura?.ablativa !== true);

  const protecciones = [];
  if (itemPrincipal) protecciones.push(foundry.utils.deepClone(itemPrincipal).system.armadura);
  // Armadura natural de especie.
  const especie = actor.system?.heridasParams?.armadura;
  if (especie) protecciones.push(especie);

  if (protecciones.length === 0) return null;

  const combinada = Calculo.combinarArmaduras(protecciones);

  // Devolvemos la protección principal (tipo mayor). Los "extras" (armadura de
  // OTRA escala, p.ej. una de tipo L junto a una de tipo M) se informan por el
  // log del encuentro en el llamador; aquí se devuelven igualmente en "extras".
  return {
     tipo: combinada.tipo ?? ""
    ,valor: combinada.valor
    ,restante: combinada.restante
    ,resiste: combinada.resiste
    ,ablativa: false
    ,resistencias: combinada.resistencias
    ,extras: combinada.extras
  };
}

/**
 * Marca las N primeras HERIDAS PENDIENTES de un actor (las que están
 * `visible === true` y aún no `marcado`). Devuelve un resumen.
 *
 * @param {Actor}  actor
 * @param {number} num      nº de heridas a marcar.
 * @param {object} enc      Encuentro (para avisos).
 * @returns {{marcadas:number, pendientes:number, fueraDeCombate:boolean, escrito:boolean}}
 */
function _aplicarHeridas(actor, num, enc)
{
  const heridas = foundry.utils.deepClone(actor.system?.heridas ?? []);

  // Índices de heridas pendientes (visibles y sin marcar), en orden.
  const pendientes = [];
  heridas.forEach((h, i) => {
    if (h?.visible === true && h?.marcado !== true) pendientes.push(i);
  });

  const aMarcar = Math.min(num, pendientes.length);
  for (let k = 0; k < aMarcar; k++)
  {
    heridas[pendientes[k]].marcado = true;
  }

  const pendientesRestantes = pendientes.length - aMarcar;
  const fueraDeCombate = (pendientesRestantes <= 0) && (aMarcar > 0);

  // Escritura: solo si el cliente puede editar el actor.
  const puedeEscribir = actor.isOwner || game.user.isGM;
  if (puedeEscribir)
  {
    actor.update({ "system.heridas": heridas });
  }

  return {
     marcadas: aMarcar
    ,pendientes: pendientesRestantes
    ,fueraDeCombate
    ,escrito: puedeEscribir
  };
}

/**
 * Resuelve el daño contra un VEHÍCULO objetivo.
 *
 * Pasos:
 *   1) Localiza el item de armadura PRINCIPAL ("Blindaje").
 *   2) Calcula la armadura EFECTIVA frente al ataque (energía/no-melee +
 *      penetración, esta solo si coinciden los tipos).
 *   3) Resta la armadura al daño (comparando escalas); la armadura NO se
 *      consume nunca: solo elimina daño.
 *   4) Decide, según el piloto:
 *        - piloto principal, o teniente y vehículo NO básico -> INFORMAR
 *          ("debes aplicar daño NxT a tu vehículo"); no se toca nada.
 *        - teniente y básico, o sin piloto -> APLICAR a la estructura.
 *
 * @param {object} enc         Encuentro (para el log).
 * @param {Actor}  vehiculo    Actor vehículo objetivo.
 * @param {object} resultado   Salida de Calculo.calcularDanoAtaque.
 * @param {Array}  armasAtaque Datos de armas (para energía/melee/ligero/área/penetración).
 */
function _resolverDanoVehiculo(enc, vehiculo, resultado, armasAtaque)
{
  // 1) Armadura principal.
  const armaduraItem = _armaduraPrincipal(vehiculo);
  if (!armaduraItem)
  {
    _logSangrado(enc, t("Ad6.Log.sinBlindaje", { nombre: vehiculo.name }), null, 1);
  }

  // ¿Es fuego concentrado (varias armas)? -> sin penetración ni resistencias.
  const fuegoConcentrado = (armasAtaque ?? []).length > 1;
  // Tipo del ataque para las resistencias/penetración: la ESCALA NATURAL del
  // arma (no la del daño total, que puede haber "subido" al sumar).
  const tipoDano = _tipoDanoAtaque(armasAtaque, resultado.total);

  // Atributos del ataque para el cálculo de armadura.
  const atributos = _atributosAtaque(armasAtaque, tipoDano, fuegoConcentrado);

  // Daño que PASA (empieza siendo el daño base COMPLETO, como lista de pares).
  let danoQuePasa = resultado.total;

  if (armaduraItem)
  {
    const proteccion = armaduraItem.system.armadura;
    const armaduraCalc = Calculo.calcularArmaduraEfectiva(proteccion, atributos);

    _logSangrado(enc, t("Ad6.Log.vehiculoArmadura", {
       nombre: armaduraItem.name
      ,base:    armaduraCalc.base
      ,escala:  armaduraCalc.tipo ?? ""
      ,bonos:   (armaduraCalc.bonos ? t("Ad6.Log.vehiculoArmaduraBonos", { bonos: armaduraCalc.bonos }) : "")
      ,penetracion: (armaduraCalc.penetracionAplicada ? t("Ad6.Log.vehiculoArmaduraPen", { penetracion: armaduraCalc.penetracionAplicada }) : "")
      ,final:   armaduraCalc.armaduraFinal
    }), null, 1);

    // 3) Resta de armadura ABSORBIENDO el daño COMPUESTO par a par (sin colapsar
    //    a un tipo dominante, que generaría decimales). La armadura NO se consume.
    const absor = Calculo.absorberDanoCompuesto(
       resultado.total
      ,armaduraCalc.tipo
      ,armaduraCalc.armaduraFinal
    );
    danoQuePasa = absor.pasan;
    // NOTA: el detalle de absorción (p.ej. "1M absorbido (1 a 1)") se comenta
    // porque se sobreentiende con la línea de armadura de arriba y el daño del
    // ataque de abajo. Se deja por si se quiere volver a mostrar.
    // for (const linea of absor.detalle) _logSangrado(enc, linea, null, 1);
    _logSangrado(enc, t("Ad6.Log.danoDelAtaque", { dano: Calculo.formatearDano(danoQuePasa) }), null, 1);
  }

  // 4) Distinción por piloto.
  const decision = _decisionAplicacionVehiculo(vehiculo);

  if (decision.modo === "informar")
  {
    // A) El jugador aplica el daño manualmente. No tocamos ningún documento.
    //    OJO: el daño que se le indica debe ser el APLICABLE a su estructura
    //    (no fraccionable): se descartan los residuos de escala menor que no
    //    completen 1 punto de la escala de la estructura del objetivo.
    const tipoEstructura = _tipoEstructuraVehiculo(vehiculo);
    const danoAplicable = Calculo.danoImputableAEscala(danoQuePasa, tipoEstructura);

    if (danoAplicable.length === 0)
    {
      // El daño no alcanza a imputar 1 punto de estructura -> NO HAY DAÑO.
      _logNivel(enc, "sinDano", t("Ad6.Log.sinDanoEstructuraEscala", { dano: Calculo.formatearDano(danoQuePasa), tipo: tipoEstructura }));
      return;
    }

    _logNivel(enc, "aplicar", t("Ad6.Log.informarAplicarDano", {
       motivo: decision.motivo
      ,dano:   Calculo.formatearDano(danoAplicable)
      ,nota:   (Calculo.formatearDano(danoAplicable) !== Calculo.formatearDano(danoQuePasa)
                  ? t("Ad6.Log.informarAplicarDanoNota", { dano: Calculo.formatearDano(danoQuePasa) })
                  : ".")
    }));
    return;
  }

  // B) Aplicar directamente sobre la ESTRUCTURA.
  //    Orden de imputación (aplicación FINAL, el daño que no complete un punto
  //    de la escala de un pool se pierde contra ese pool):
  //      1) Estructuras ADICIONALES (items armadura con ablativa=true y nombre
  //         distinto de "Blindaje"), cada una en SU PROPIO tipo. SÍ se consumen.
  //      2) La ESTRUCTURA principal del vehículo (system.estructura.restante),
  //         en el tipo del vehículo.
  let danoActual = danoQuePasa;

  // 1) Estructuras adicionales (escudos/estructuras de imputación primera).
  const adicionales = _estructurasAdicionales(vehiculo);
  for (const item of adicionales)
  {
    if (danoActual.length === 0) break;

    const protec = item.system?.armadura ?? {};
    const tipoPool = Calculo.normalizarEscala(protec.tipo) ?? _tipoEstructuraVehiculo(vehiculo);
    const valorPool = Number(protec.restante) || 0;

    const imp = Calculo.imputarAPool(danoActual, tipoPool, valorPool);
    for (const linea of imp.detalle)
    {
      _logSangrado(enc, t("Ad6.Log.estructuraAdicionalLinea", { nombre: item.name, tipo: tipoPool, detalle: linea }), null, 1);
    }

    const nuevoPool = Math.max(0, valorPool - imp.reservaConsumida);
    if (nuevoPool <= 0 && imp.reservaConsumida > 0)
    {
      _logNivel(enc, "destruido", t("Ad6.Log.estructuraAdicionalDestruida", { nombre: item.name, valor: valorPool, tipo: tipoPool }));
    }
    else
    {
      _logSangrado(enc, t("Ad6.Log.estructuraAdicionalQueda", { nombre: item.name, valor: valorPool, tipo: tipoPool, nuevo: nuevoPool }), null, 1);
    }

    // Escritura del propio item (sí se consume).
    const puedeItem = item.isOwner || game.user.isGM;
    if (puedeItem)
    {
      item.update({ "system.armadura.restante": nuevoPool });
    }

    // Lo que PASA sigue a la estructura principal; lo PERDIDO se descarta.
    if (imp.perdido.length > 0)
    {
      _logSangrado(enc, t("Ad6.Log.sePierdeContra", { nombre: item.name, dano: Calculo.formatearDano(imp.perdido) }), null, 1);
    }
    danoActual = imp.pasan;
  }

  // 2) Estructura principal.
  if (danoActual.length === 0)
  {
    _logNivel(enc, "sinDano", t("Ad6.Log.sinDanoEstructuraPrincipal"));
    return;
  }

  const estructura = vehiculo.system?.estructura ?? { restante: 0, maximo: 0 };
  const tipoEstructura = _tipoEstructuraVehiculo(vehiculo);
  const valorEstructura = Number(estructura.restante) || 0;

  const absor = Calculo.imputarAPool(danoActual, tipoEstructura, valorEstructura);

  const nuevoRestante = Math.max(0, valorEstructura - absor.reservaConsumida);
  const destruido = (nuevoRestante <= 0);

  for (const linea of absor.detalle)
  {
    _logSangrado(enc, t("Ad6.Log.estructuraLinea", { detalle: linea }), null, 1);
  }

  if (destruido && absor.reservaConsumida > 0)
  {
    _logNivel(enc, "destruido", t("Ad6.Log.estructuraDestruida", { valor: valorEstructura, tipo: tipoEstructura }));
  }
  else if (absor.reservaConsumida === 0)
  {
    _logNivel(enc, "sinDano", t("Ad6.Log.estructuraSinDano", { valor: valorEstructura, tipo: tipoEstructura }));
  }
  else
  {
    _logSangrado(enc, t("Ad6.Log.estructuraQueda", { valor: valorEstructura, tipo: tipoEstructura, nuevo: nuevoRestante }), null, 1);
  }

  // Escritura de la estructura (el vehículo lo controla el GM o su dueño).
  const puedeEscribir = vehiculo.isOwner || game.user.isGM;
  if (puedeEscribir)
  {
    vehiculo.update({ "system.estructura.restante": String(nuevoRestante) });
  }
  else
  {
    _logSangrado(enc, t("Ad6.Log.sinPermisoEstructura", { nombre: vehiculo.name }), null, 1);
  }
}

/**
 * Devuelve las ESTRUCTURAS ADICIONALES de un vehículo: items tipo "armadura"
 * con `ablativa === true` y nombre distinto de "Blindaje". Son estructuras de
 * IMPUTACIÓN PRIMERA (escudos, brazos escudo, etc.) y SÍ se consumen. Cada una
 * tiene su propio tipo (system.armadura.tipo) y su propio resto.
 * @returns {Item[]}
 */
function _estructurasAdicionales(vehiculo)
{
  const armaduras = vehiculo.items?.filter?.(i => i.type === "armadura") ?? [];
  return armaduras.filter(i =>
     i?.system?.armadura?.ablativa === true
    && i.name !== "Blindaje"
  );
}

/**
 * Decide cómo aplicar el daño a un vehículo según su piloto (o ausencia de él).
 * Reglas:
 *   - piloto principal                     -> informar
 *   - piloto teniente y vehículo NO básico -> informar
 *   - piloto teniente y vehículo básico    -> aplicar a estructura
 *   - sin piloto                            -> aplicar a estructura
 * @returns { {modo:"informar"|"aplicar", motivo:string} }
 */
function _decisionAplicacionVehiculo(vehiculo)
{
  const idPiloto = vehiculo.system?.nombrePiloto ?? "";
  // Resolvemos el piloto por su id (nombrePiloto guarda el id sin "Actor.").
  // Fallback: si por lo que sea no estuviera en game.actors, probamos fromUuid.
  let piloto = idPiloto ? game.actors?.get(idPiloto) : null;
  if (!piloto && idPiloto)
  {
    try { piloto = fromUuidSync(`Actor.${idPiloto}`); } catch (e) { piloto = null; }
  }
  // Nombre a mostrar: el del piloto resuelto o, si no se pudo, un texto neutro.
  const nombrePiloto = piloto?.name ?? "desconocido";

  // Discriminamos explícitamente AMBAS condiciones: es "básico" y "no usa
  // sistemas". Solo entonces el vehículo no tiene nada que gestionar a mano.
  const esBasico    = vehiculo.system?.esBasico === true;
  const usaSistemas = vehiculo.system?.usaSistemas === true;
  const sinSistemas = esBasico && !usaSistemas;

  if (!piloto)
  {
    return { modo: "aplicar", motivo: t("Ad6.Combate.infNoPiloto",{})}; //"Vehículo sin piloto" };
  }
  if (piloto.type === "principal")
  {
    // Un vehículo BÁSICO y SIN SISTEMAS no tiene nada que gestionar a mano:
    // se aplica el daño automáticamente (como un teniente en básico). Un
    // vehículo no básico (o básico que sí usa sistemas) se informa igual:
    // podría aplicar hardware.
    if (sinSistemas)
    {
      return { modo: "aplicar", motivo: t("Ad6.Combate.infMainSinSistemas",{nombre:nombrePiloto})}; //`Principal ${nombrePiloto} en vehículo básico sin sistemas` };
    }
    // Usamos el NOMBRE del piloto, no su tipo, para que el aviso sea claro.
    return { modo: "informar", motivo: t("Ad6.Combate.infPiloto",{nombre:nombrePiloto})}; // `Piloto ${nombrePiloto}` };
  }
  if (piloto.type === "teniente")
  {
    if (esBasico)
    {
      return { modo: "aplicar", motivo: t("Ad6.Combate.infTenienteBasico",{nombre:nombrePiloto})}; //`Teniente ${nombrePiloto} en vehículo básico` };
    }
    return { modo: "informar", motivo: t("Ad6.Combate.infTenienteNoBasico",{nombre:nombrePiloto})}; //`Teniente ${nombrePiloto} en vehículo no básico` };
  }
  // Cualquier otro tipo de piloto: por defecto, no aplicamos automáticamente.
  return { modo: "informar", motivo:  t("Ad6.Combate.infPiloto",{nombre:nombrePiloto})}; //`Piloto ${nombrePiloto}` };
}

/**
 * Devuelve el item de armadura PRINCIPAL de un vehículo: el item tipo "armadura"
 * llamado "Blindaje" (o, en su defecto, el primero). El escudo (ablativa) NO se
 * usa aquí: solo reduce el daño, y se aplica en otro punto del proceso.
 */
function _armaduraPrincipal(vehiculo)
{
  const armaduras = vehiculo.items?.filter?.(i => i.type === "armadura") ?? [];
  if (armaduras.length === 0) return null;
  return armaduras.find(i => i.name === "Blindaje") ?? armaduras[0] ?? null;
}

/**
 * Tipo (L/M/N) de la ESTRUCTURA de un vehículo. La estructura NO guarda su
 * escala; se deduce de la ESCALA de la armadura principal (el tipo de vehículo
 * va con su blindaje). Si no hay armadura, cae a escalaPrincipal del sistema.
 */
function _tipoEstructuraVehiculo(vehiculo)
{
  const item = _armaduraPrincipal(vehiculo);
  const t = Calculo.normalizarEscala(item?.system?.armadura?.tipo);
  if (t) return t;
  const t2 = Calculo.normalizarEscala(vehiculo.system?.escalaPrincipal);
  return t2 ?? "M";
}

/**
 * Construye los atributos del ataque (energía/melee/ligero/área/penetración)
 * que se usan para calcular la armadura efectiva:
 *   - Con VARIAS armas (fuego concentrado): la penetración NO aplica y las
 *     resistencias SÍ. (La regla dice que el fuego concentrado cruza una escala
 *     L->M o M->N, donde nunca aplica penetración.) Para energía/melee/ligero/
 *     área cuenta si CUALQUIER arma cumple la condición.
 *   - Con UNA sola arma: se toman sus atributos. La penetración solo aplicará
 *     si el tipo de armadura coincide con el tipo de daño (lo decide
 *     calcularArmaduraEfectiva), y si NO coincide se fuerza a 0.
 *
 * @param {Array}  armasAtaque
 * @param {"L"|"M"|"N"} tipoDano  tipo del daño total.
 * @param {boolean} fuegoConcentrado
 */
function _atributosAtaque(armasAtaque, tipoDano, fuegoConcentrado)
{
  if (fuegoConcentrado)
  {
    // Penetración anulada; para energía/melee/ligero/área, si CUALQUIER arma
    // cumple la condición, cuenta.
    return {
       danoEnergia: (armasAtaque ?? []).some(a => a.danoEnergia === true)
      ,danoMelee:   (armasAtaque ?? []).some(a => a.danoMelee === true)
      ,danoLigero:  (armasAtaque ?? []).some(a => a.danoLigero === true)
      ,tieneArea:   (armasAtaque ?? []).some(a => a.tieneArea === true)
      ,tipoDano
      ,penetracionFinal: 0
    };
  }

  const a = (armasAtaque ?? [])[0] ?? {};
  return {
     danoEnergia: a.danoEnergia === true
    ,danoMelee:   a.danoMelee === true
    ,danoLigero:  a.danoLigero === true
    ,tieneArea:   a.tieneArea === true
    ,tipoDano
    // La penetración solo se ofrece si coincide el tipo (lo valida el cálculo).
    ,penetracionFinal: Number(a.penetracionFinal ?? 0) || 0
  };
}

/**
 * Devuelve el TIPO DOMINANTE de un daño compuesto (lista de pares). Es el tipo
 * de la escala más alta presente (con cantidad > 0). Si la lista está vacía o
 * es de un solo tipo, devuelve ese tipo.
 */
function _tipoDominante(lista)
{
  let mejor = null;
  for (const d of (lista ?? []))
  {
    if (!d || Number(d.cantidad) <= 0) continue;
    const t = Calculo.normalizarEscala(d.tipo);
    if (!t) continue;
    if (mejor === null || (Calculo.PESO_ESCALA[t] > Calculo.PESO_ESCALA[mejor])) mejor = t;
  }
  return mejor ?? "M";
}

/**
 * TIPO DE DAÑO del ataque a efectos de RESISTENCIAS y PENETRACIÓN.
 *
 * IMPORTANTE: NO se puede usar la escala del daño TOTAL ya sumado (resultado.total),
 * porque sumarDanos() agrupa de 10 en 10 y "sube" de escala: 10L se convierte en
 * 1M. Eso haría que un arma de daño L (con penetración P1, aplicable a armaduras
 * L) se comparase como tipo M, y la penetración dejaría de aplicarse.
 *
 * El tipo de daño debe ser la ESCALA NATURAL DEL ARMA (la que define "1L", "1M"…),
 * que es la que se compara con el tipo de la armadura. Se toma el tipo de la
 * escala MAYOR entre las armas (en la práctica todas las de un ataque comparten
 * escala). Si no se puede deducir de ninguna arma, se cae al tipo dominante del
 * daño total.
 *
 * @param {Array}  armasAtaque  Datos de armas (con "danoTexto").
 * @param {Array}  total        Daño total (lista de pares) como respaldo.
 * @returns {"L"|"M"|"N"}
 */
function _tipoDanoAtaque(armasAtaque, total)
{
  let mejor = null;
  for (const a of (armasAtaque ?? []))
  {
    const parseado = Calculo.parseDano(a?.danoTexto ?? "");
    const t = Calculo.normalizarEscala(parseado?.tipo);
    if (!t) continue;
    if (mejor === null || (Calculo.PESO_ESCALA[t] > Calculo.PESO_ESCALA[mejor])) mejor = t;
  }
  return mejor ?? _tipoDominante(total);
}

/**
 * Marca el encuentro como cerrado (lo pulse quien lo pulse) para que TODOS los
 * clientes cierren sus ventanas.
 */
export async function cerrarEncuentro(encuentroId)
{
  const enc = encuentros()[encuentroId];
  if (!enc) return;
  enc.estado = "cerrado";
  await _difundir(encuentroId);
  // Limpieza local del estado (ya no hace falta).
  delete encuentros()[encuentroId];
}

// ---------------------------------------------------------------------------
// Consumo de éxitos en las tiradas de los actores
// ---------------------------------------------------------------------------

/**
 * Resta "usado" a la tirada del atacante. Se escribe SOLO en su propio actor
 * (su dueño lo hace sin problema). Se localiza la tirada por slot.
 */
async function _consumirExitosTirada(actorUuid, slot, usado)
{
  if (!usado) return;
  const actor = _normalizarActorDelMundo(await fromUuid(actorUuid));
  if (!actor) return;
  // El dueño puede editar; si no, no hacemos nada silenciosamente.
  if (!actor.isOwner && !game.user.isGM)
  {
    // En teoría no debe pasar: la ventana del atacante la ve su dueño.
    return;
  }
  const actual = Number(actor.system?.[slot]?.exitos ?? 0);
  const nuevo = Math.max(0, actual - usado);
  await actor.update({ [`system.${slot}.exitos`]: nuevo });
}

/**
 * Resta "usado" a la tirada de una FUENTE de defensa, escribiendo en el actor
 * dueño de esa tirada. Es una envoltura de _consumirExitosTirada (mismo
 * comportamiento: si el cliente no posee ese actor, no hace nada).
 */
async function _consumirExitosTiradaDeFuente(actorUuid, slot, usado)
{
  if (!slot || !usado) return;
  await _consumirExitosTirada(actorUuid, slot, usado);
}

/**
 * Añade una línea al log del encuentro (nivel neutro).
 * Acepta:
 *   - _log(enc, "texto")                  -> entrada literales (no se traduce).
 *   - _log(enc, t("Ad6.Log.xxx", { ... }))-> entrada localizable al pintar.
 *   - _log(enc, "Ad6.Log.xxx", { ... })   -> clave + datos (azúcar).
 */
function _log(enc, texto, datos)
{
  enc.log.push(_entradaLog(texto, datos, ""));
}

/**
 * Añade una línea RESALTADA al log. `nivel` controla el color/estilo en la
 * ventana:
 *   - "titulo"    -> cabecera de sección (línea de separación).
 *   - "destruido" -> algo se ha destruido (ROJO + negrita).
 *   - "aplicar"   -> hay que aplicar daño manualmente (ÁMBAR + negrita).
 *   - "sinDano"   -> no hay daño / se esquivó por completo (VERDE + negrita).
 * Igual que _log, acepta la forma "{clave, datos}" ya construida o la pareja
 * (clave, datos).
 */
function _logNivel(enc, nivel, texto, datos, sangria)
{
  enc.log.push(_entradaLog(texto, datos, nivel || "", sangria));
}

/**
 * Añade una línea INDENTADA al log (sangría estructural). `niveles` cuenta
 * bloques de 2 espacios (compatibilidad visual con el log anterior).
 */
function _logSangrado(enc, texto, datos, niveles)
{
  enc.log.push(_entradaLog(texto, datos, "", niveles));
}

/**
 * Vuelca al log TODAS las líneas de un `detalle[]` producido por el cálculo
 * PURO (p. ej. resultado.detalle, respuestas de absorberDanoCompuesto, etc.),
 * aplicando un NIVEL DE SANGRÍA ESTRUCTURAL (campo `sangria`), no espacios en
 * el texto. Mantiene la entrada tal cual ({clave,datos} o {texto}) para que se
 * localice al pintar.
 *
 * @param {object} enc       Encuentro.
 * @param {Array}  detalle   Lista de entradas / strings.
 * @param {string} [nivel]   Nivel de estilo ("" por defecto).
 * @param {number} [sangria] Niveles de indentación a aplicar a cada línea.
 */
function _logDetalle(enc, detalle, nivel = "", sangria = 0)
{
  for (const linea of (detalle ?? []))
  {
    const entrada = _normalizarEntrada(linea);
    if (!entrada) continue;
    const s = (Number(entrada.sangria) || 0) + (Number(sangria) || 0);
    enc.log.push({ ...entrada, nivel: nivel || "", ...(s > 0 ? { sangria: s } : {}) });
  }
}

/**
 * Normaliza las distintas formas de "línea de log" a un objeto entrada.
 *   - string                    -> { texto }
 *   - {clave,datos}             -> igual
 *   - {texto}                   -> igual
 *   - null/undefined            -> null (se ignora)
 * Si se pasan (texto, datos) por separado y `texto` es string simple sin datos,
 * se trata como literal.
 */
function _normalizarEntrada(texto, datos)
{
  if (texto === null || texto === undefined) return null;
  if (typeof texto === "object") return texto;   // ya es {clave}/{texto}
  // string: clave con datos, o literal.
  if (datos !== undefined && datos !== null) return t(texto, datos);
  return lit(texto);
}

/**
 * Construye la ENTRADA de log final a partir de las formas admitidas.
 * @param {*}      texto   string o {clave}/{texto}
 * @param {object} [datos] datos de interpolación (si texto es clave)
 * @param {string} nivel
 */
function _entradaLog(texto, datos, nivel, sangria)
{
  const entrada = _normalizarEntrada(texto, datos);
  const s = (Number(entrada?.sangria) || 0) + (Number(sangria) || 0);
  return { ...(entrada ?? { texto: "" }), nivel: nivel || "", ...(s > 0 ? { sangria: s } : {}) };
}

// ---------------------------------------------------------------------------
// Sincronización por mensajes-aviso
// ---------------------------------------------------------------------------

/** Emite un aviso con el snapshot del encuentro. */
async function _difundir(encuentroId)
{
  const enc = encuentros()[encuentroId] ?? null;
  await ChatMessage.create({
     content: ""
    ,speaker: { alias: "Combate" }
    ,whisper: []
    ,flags: {
      [ID_FLAG]: {
        [AVISO_COMBATE]: {
           encuentroId: encuentroId
          ,snapshot: enc ? foundry.utils.deepClone(enc) : null
        }
      }
    }
  });
}

/**
 * Procesa un aviso recibido. Actualiza el estado local y decide qué ventanas
 * abrir/refrescar/cerrar en este cliente.
 */
function _procesarAviso(mensaje)
{
  const flags = mensaje?.flags?.[ID_FLAG];
  if (!flags?.[AVISO_COMBATE]) return false;

  const { encuentroId, snapshot } = flags[AVISO_COMBATE];
  if (!encuentroId) return false;

  if (snapshot)
  {
    encuentros()[encuentroId] = foundry.utils.deepClone(snapshot);
  }
  else
  {
    delete encuentros()[encuentroId];
  }

  _revisarVentanas(encuentroId);
  return true;
}

/** ¿Es un mensaje-aviso de combate (oculto en el log)? */
function esMensajeAviso(mensaje)
{
  return !!mensaje?.flags?.[ID_FLAG]?.[AVISO_COMBATE];
}

/**
 * REHIDRATA el estado de los encuentros a partir del HISTORIAL DE CHAT.
 *
 * Por qué: el estado vive en game.ad6_encuentros (memoria por cliente). Al
 * recargar la página (F5), reconectar o sufrir un problema de conexión, ese
 * estado se pierde y no llega ningún aviso nuevo, así que las ventanas no se
 * reconstruyen. Pero los avisos de combate SIGUEN en el log de chat con su
 * flag-snapshot. Aquí los recorremos de NUEVO a VIEJO y nos quedamos con el
 * ÚLTIMO snapshot de cada encuentroId, repoblando el estado y reabriendo las
 * ventanas que correspondan a este cliente.
 *
 * Reglas:
 *   - Solo se rehidratan encuentros VIVOS (estado != "cerrado" y snapshot no
 *     nulo). Un aviso con snapshot=null significa "cerrado/limpiado".
 *   - El último aviso de un encuentroId MANDA (puede ser un cierre).
 */
export function rehidratarEncuentros()
{
  if (!game.messages) return;

  // Ordenamos cronológicamente (más antiguo -> más reciente) para que el
  // ÚLTIMO aviso de cada encuentroId sea el que manda.
  const mensajes = [...game.messages.contents].sort(
    (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  // Ultimo snapshot por encuentro. null = cerrado.
  const ultimoPorId = new Map();

  for (const m of mensajes)
  {
    const aviso = m?.flags?.[ID_FLAG]?.[AVISO_COMBATE];
    if (!aviso?.encuentroId) continue;
    ultimoPorId.set(aviso.encuentroId, aviso.snapshot ?? null);
  }

  let reconstruidos = 0;
  for (const [encuentroId, snapshot] of ultimoPorId.entries())
  {
    // Aviso de cierre: o snapshot nulo, o encuentro marcado como "cerrado".
    if (!snapshot || snapshot.estado === "cerrado")
    {
      delete encuentros()[encuentroId];
      Ad6_AppCombate.cerrarEncuentro(encuentroId);
      continue;
    }

    // Reconstruimos el estado local con el snapshot más reciente.
    encuentros()[encuentroId] = foundry.utils.deepClone(snapshot);
    reconstruidos++;
  }

  // Revisamos ventanas de todos los encuentros vivos reconstruidos.
  _revisarTodos();

  if (reconstruidos > 0)
  {
    console.log(`[AD6][Combate] Rehidratados ${reconstruidos} encuentro(s) desde el historial de chat.`);
  }
}

// ---------------------------------------------------------------------------
// Apertura / cierre de ventanas en este cliente
// ---------------------------------------------------------------------------

/**
 * Revisa qué ventanas debe mostrar ESTE cliente para el encuentro dado:
 *   - Rol atacante: la ve el usuario que lo invocó.
 *   - Rol defensor: la ve quien controla al actor defensor (isOwner, o GM si
 *     es NPC sin dueño jugador).
 * Abre las que falten, refresca las existentes y cierra las que ya no procedan.
 */
function _revisarVentanas(encuentroId)
{
  const enc = encuentros()[encuentroId];
  if (!enc || enc.estado === "cerrado")
  {
    Ad6_AppCombate.cerrarEncuentro(encuentroId);
    return;
  }

  const deseadas = new Set();

  // Ventana de atacante.
  if (enc.invocadorUserId === game.user.id)
  {
    const clave = Ad6_AppCombate.claveVentana(encuentroId, "atacante", enc.atacanteUuid);
    deseadas.add(clave);
    Ad6_AppCombate.abrirORefrescar(encuentroId, "atacante", enc.atacanteUuid, enc);
  }

  // Ventanas de defensor (una por cada objetivo que este cliente controle).
  for (const obj of enc.objetivos)
  {
    const defensor = _normalizarActorDelMundo(fromUuidSync(obj.actorUuid));
    if (!defensor) continue;
    if (_usuarioControlaActor(defensor))
    {
      const clave = Ad6_AppCombate.claveVentana(encuentroId, "defensor", obj.actorUuid);
      deseadas.add(clave);
      Ad6_AppCombate.abrirORefrescar(encuentroId, "defensor", obj.actorUuid, enc);
    }
  }

  // Ceirra las ventanas de este encuentro que ya no estén en "deseadas".
  Ad6_AppCombate.cerrarNoDeseadas(encuentroId, deseadas);
}

// ---------------------------------------------------------------------------
// Hooks y ciclo de vida
// ---------------------------------------------------------------------------

/** Debe llamarse una vez al inicializar el sistema (init/ready). */
export function inicializarServicioCombate()
{
  // Cada vez que llega un mensaje (propio o de otro cliente), lo procesamos.
  Hooks.on("createChatMessage", (mensaje) => {
    _procesarAviso(mensaje);
  });

  // Ocultar los avisos de combate del log (reutilizamos la clase existente).
  Hooks.on("renderChatMessageHTML", (mensaje, html) => {
    if (esMensajeAviso(mensaje) && html?.classList) html.classList.add("ad6-asistencia-aviso");
  });

  // Cambio de ronda/asalto: cerramos todos los encuentros abiertos.
  Hooks.on("combatRound", () => {
    _cerrarTodos();
  });

  // Al borrar el combate, idem.
  Hooks.on("deleteCombat", () => {
    _cerrarTodos();
  });

  // Conexión/desconexión de usuarios: la visibilidad de las ventanas de
  // defensor depende de quién está conectado ("dueño jugador ACTIVO"). Por eso,
  // al cambiar el estado de conexión, re-evaluamos TODOS los encuentros activos
  // para abrir/cerrar ventanas en consecuencia.
  Hooks.on("userConnected", () => {
    _revisarTodos();
  });

  // AL ARRANCAR (ready): rehidratamos los encuentros vivos desde el historial
  // de chat. Esto restaura las ventanas tras un F5, una reconexión o cualquier
  // problema de conexión, ya que el estado en memoria se pierde pero los
  // avisos siguen en el log con su snapshot.
  Hooks.on("ready", () => {
    rehidratarEncuentros();
  });
}

/** Re-evalúa las ventanas de todos los encuentros activos (p.ej. tras una conexión). */
function _revisarTodos()
{
  const store = encuentros();
  for (const id of Object.keys(store))
  {
    _revisarVentanas(id);
  }
}

/** Cierra todos los encuentros y sus ventanas (cambio de ronda, etc.). */
function _cerrarTodos()
{
  const store = encuentros();
  for (const id of Object.keys(store))
  {
    store[id].estado = "cerrado";
    Ad6_AppCombate.cerrarEncuentro(id);
    delete store[id];
  }
}

// ---------------------------------------------------------------------------
// INVOCADORES de acciones (reutilizables desde la HOJA y desde el TRACKER)
// ---------------------------------------------------------------------------
// Estos tres "invocadores" encapsulan el flujo de los tres botones de una
// tirada (atacar / fuego concentrado / prestar defensa). Antes vivían SOLO en
// los handlers estáticos de la hoja (ad6_hojaActor.mjs) y, al depender de
// `this.actor`, no se podían reutilizar desde el combat tracker (que no es una
// hoja). Ahora la lógica común vive AQUÍ, recibe el Actor explícitamente, y
// tanto la hoja como el tracker la invocan. El comportamiento es idéntico.

/**
 * CONSUME la acción de una tirada: deja sus ÉXITOS a 0 (mantiene fase,
 * macrofase, sinergia y arma). Se usa desde el tracker al pulsar el icono de
 * macrofase en soporte/cinemática. Al quedar a 0 éxitos, el Combatant de fase
 * se reconcilia solo (se atenúa la fila y desaparecen los botones).
 *
 * Solo escribe si este cliente es GM o PROPIETARIO del actor (misma regla que
 * el resto del flujo); en caso contrario no hace nada.
 *
 * @param {Actor}  actor
 * @param {string} slot  "tirada1" | "tirada2" | "tirada3"
 * @returns {Promise<boolean>} true si se aplicó.
 */
export async function consumirTirada(actor, slot)
{
  if (!actor || !SLOTS_TIRADA.includes(slot)) return false;
  const t = actor.system?.[slot];
  if (!t) return false;
  if (Number(t.exitos ?? 0) <= 0) return false;   // ya consumida

  if (!actor.isOwner && !game.user.isGM) return false;

  await actor.update({ [`system.${slot}.exitos`]: 0 });
  return true;
}

// ---------------------------------------------------------------------------
// ACELERAR / APURAR una acción (Push)
// ---------------------------------------------------------------------------
// Reglas (acordadas):
//   - Solo se puede acelerar una acción que esté en OPERACIONES o CINEMÁTICA.
//     La aceleración la SUBE una macrofase:
//         cinematica -> operaciones
//         operaciones -> soporte
//     (soporte es la macrofase más alta: no se acelera.)
//   - Coste: 1 punto de FATIGA del actor dueño de la tirada. Si la acción es de
//     SINERGIA, cuesta 2. La fatiga se escribe en el array system.estres:
//     se convierte el primer hueco "" (disponible) en "F" (fatiga).
//   - No se puede acelerar si NO queda ningún punto de estrés disponible (sin
//     huecos "") o si no hay huecos SUFICIENTES para el coste (2 si sinergia).
//
// EFECTO: se reescriben system.tiradaN.fase y system.tiradaN.superFase de la
// tirada. Como el Combatant de fase se RECONSTRUYE desde esos campos, la fila
// "se mueve" de zona en el tracker automáticamente (reconciliación).
//
// SUBSFASE DESTINO: no hay equivalencia semántica entre subfases de macrofases
// distintas, así que se toma la PRIMERA subfase de la macrofase destino.

/** Macrofase inmediatamente superior a la que se acelera. */
const SUPERFASE_ACELERADA = {
   cinematica:  "operaciones"
  ,operaciones: "soporte"
};

/** Subfase concreta que toma la acción en cada macrofase destino. */
const SUBFASE_DESTINO = {
   operaciones: "operacionesAtacar"
  ,soporte:    "soporteAsistir"
};

/**
 * ¿Se puede acelerar esta tirada? Devuelve la macrofase destino, o null.
 * Regla: solo si su superFase es operaciones o cinematica, tiene fase fijada y
 * quedan éxitos (no se acelera una acción ya consumida/fallida).
 * @param {object} tirada  system.tiradaN
 * @returns {string|null}  "operaciones" | "soporte" | null
 */
export function superFaseAceleradaDe(tirada)
{
  if (!tirada) return null;
  if ((tirada.fase ?? "") === "") return null;
  if (Number(tirada.exitos ?? 0) <= 0) return null;
  return SUPERFASE_ACELERADA[tirada.superFase] ?? null;
}

/**
 * Coste en puntos de FATIGA de acelerar una tirada: 2 si es de sinergia, 1 si no.
 * @param {object} tirada
 * @returns {number}
 */
export function costeAcelerar(tirada)
{
  return (tirada?.sinergia === true) ? 2 : 1;
}

/** Puntos de estrés DISPONIBLES (huecos "") de un actor. */
function _estresDisponible(actor)
{
  const estres = actor?.system?.estres;
  if (!Array.isArray(estres)) return 0;
  return estres.filter(v => v === "").length;
}

/**
 * Actor que "paga" la fatiga al ACELERAR, a partir del actor DUEÑO de la tirada:
 *   - actor "principal"            -> él mismo (su propio estrés).
 *   - actor "vehiculo" con piloto  -> el piloto, SOLO si es "principal"
 *     (el estrés vive en el principal; un vehículo no tiene estrés propio).
 *   - cualquier otro caso          -> null (no se puede acelerar / no hay fatiga).
 * Misma resolución que _actorParaSinergia() de la hoja.
 * @param {Actor} actor  Actor dueño de la tirada (la hoja desde la que se tira).
 * @returns {Actor|null}
 */
export function actorDeFatiga(actor)
{
  if (!actor) return null;
  if (actor.type === "principal") return actor;

  if (actor.type === "vehiculo")
  {
    const idPiloto = actor.system?.nombrePiloto;
    if (idPiloto && idPiloto !== "undefined")
    {
      const piloto = game.actors?.get(idPiloto);
      if (piloto && piloto.type === "principal") return piloto;
    }
  }
  return null;
}

/**
 * Consume N puntos de fatiga del actor: convierte los primeros huecos "" en "F".
 * NO escribe el documento; devuelve el array nuevo (o null si no hay suficientes).
 * @param {Actor} actor
 * @param {number} nCoste
 * @returns {string[]|null}
 */
function _consumirFatiga(actor, nCoste)
{
  const estres = foundry.utils.deepClone(actor?.system?.estres ?? []);
  if (!Array.isArray(estres)) return null;
  if (_estresDisponible(actor) < nCoste) return null;

  let restante = nCoste;
  for (let i = 0; i < estres.length && restante > 0; i++)
  {
    if (estres[i] === "")
    {
      estres[i] = "F";
      restante--;
    }
  }
  return (restante === 0) ? estres : null;
}

/**
 * ACELERA (Push) la acción de un slot de tirada de un actor:
 *   1) Valida que la acción se pueda acelerar (operaciones/cinematica, con éxitos).
 *   2) Comprueba el estrés disponible del actor dueño (1 punto, ó 2 si sinergia).
 *   3) Reescribe la tirada: nueva subfase + nueva macrofase.
 *   4) Consume la fatiga en el estrés del actor (mismo update).
 *
 * Solo escribe si este cliente es GM o PROPIETARIO del actor. La reconciliación
 * del Combatant de fase (que "mueve" la fila en el tracker) se dispara sola con
 * el updateActor.
 *
 * @param {Actor}  actor
 * @param {string} slot  "tirada1" | "tirada2" | "tirada3"
 * @returns {Promise<boolean>} true si se aceleró.
 */
export async function acelerarAccion(actor, slot)
{
  if (!actor || !SLOTS_TIRADA.includes(slot)) return false;

  const tirada = actor.system?.[slot];
  const destino = superFaseAceleradaDe(tirada);
  if (!destino)
  {
    ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.acelerar.noAcelerable"));
    return false;
  }

  if (!actor.isOwner && !game.user.isGM) return false;

  // La FATIGA la paga el actor correspondiente: el propio actor si es un
  // principal, o SU PILOTO principal si es un vehículo tripulado por uno.
  const actorFatiga = actorDeFatiga(actor);
  if (!actorFatiga)
  {
    ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.acelerar.sinFatiga"));
    return false;
  }

  const coste = costeAcelerar(tirada);
  const estresNuevo = _consumirFatiga(actorFatiga, coste);
  if (!estresNuevo)
  {
    ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.acelerar.sinFatiga"));
    return false;
  }

  const subfaseDestino = SUBFASE_DESTINO[destino];

  // Mueve la acción de fase (en el actor DUEÑO de la tirada)...
  await actor.update({
     [`system.${slot}.fase`]:      subfaseDestino
    ,[`system.${slot}.superFase`]: destino
  });

  // ...y consume la fatiga en el actor que la paga (normalmente el mismo; en un
  // vehículo tripulado, su piloto principal). Updates separados para no escribir
  // en el actor equivocado cuando dueño y "pagador" no coinciden.
  await actorFatiga.update({ "system.estres": estresNuevo });

  return true;
}

/**
 * SUBFASE de ORIGEN (el SIGNIFICADO real de la acción). Al ACELERAR, el campo
 * "fase" se reescribe con la subfase de la macrofase destino, pero el tipo de
 * acción (atacar/defender...) NO cambia: vive en "faseOriginal". Todos los
 * sitios que deciden si una tirada es "de ataque" o "de defensa" deben mirar
 * aquí, no en "fase". Si no hay "faseOriginal" (tiradas antiguas), cae a "fase".
 * @param {object} tirada  system.tiradaN
 * @returns {string}
 */
export function faseDeAccion(tirada)
{
  return (tirada?.faseOriginal || tirada?.fase) ?? "";
}

/**
 * Abre el flujo de ATAQUE: crea un encuentro con esa tirada como origen y
 * difunde la ventana a atacante y defensores.
 * Condición: la tirada debe ser "atacable" (operacionesAtacar, o superfase
 * operaciones con sinergia).
 * @param {Actor} actor
 * @param {string} slot  "tirada1" | "tirada2" | "tirada3"
 * @returns {Promise<string|null>} id del encuentro creado, o null si no procede.
 */
export async function invocarAtaque(actor, slot)
{
  if (!actor || !SLOTS_TIRADA.includes(slot)) return null;
  const tirada = actor.system?.[slot];
  if (!tirada) return null;

  const atacable = (faseDeAccion(tirada) === "operacionesAtacar")
    || (tirada.superFase === "operaciones" && tirada.sinergia === true);
  if (!atacable) return null;

  return crearEncuentro(actor, slot, tirada);
}

/**
 * Abre el flujo de FUEGO CONCENTRADO: PRESTA el arma de esta tirada a otro
 * atacante que tenga un encuentro en curso (selector de encuentro).
 * @param {Actor} actor
 * @param {string} slot
 * @returns {Promise<boolean>} true si se prestó el arma.
 */
export async function invocarFuegoConcentrado(actor, slot)
{
  if (!actor || !SLOTS_TIRADA.includes(slot)) return false;
  const tirada = actor.system?.[slot];
  if (!tirada) return false;

  // Misma condición que el botón de burst.
  const atacable = (faseDeAccion(tirada) === "operacionesAtacar")
    || (tirada.superFase === "operaciones" && tirada.sinergia === true);
  if (!atacable) return false;

  // Debe haber un arma con datos (nombre + clase).
  const arma = tirada.arma;
  const tieneArma = ((arma?.nombre ?? "") !== "") && ((arma?.clase ?? "") !== "");
  if (!tieneArma)
  {
    ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.fuegoConcentrado.sinArma"));
    return false;
  }

  // Encuentros vivos con un atacante, EXCLUYENDO al propio actor.
  const candidatos = atacantesEnConflicto(actor.uuid);
  if (candidatos.length === 0)
  {
    ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.fuegoConcentrado.sinAtaque"));
    return false;
  }

  // Entrada de arma "prestada" construida desde ESTA tirada.
  const pen = opcionesPenetracion(arma?.datos?.system?.penetracion);
  const dano = opcionesDano(arma?.datos?.system?.dano);
  const armaRef = {
     clase:        arma.clase
    ,nombre:       arma.nombre
    ,datos:        foundry.utils.deepClone(arma.datos ?? {})
    ,actorUuid:    actor.uuid
    ,actorId:      actor.id
    ,actorNombre:  actor.name
    ,slot:         slot
    ,exitosTirada: Number(tirada.exitos ?? 0)
    ,penetracionFinal:    pen.valor
    ,penetracionOpciones: pen.opciones
    ,danoFinal:    dano.valor
    ,danoOpciones: dano.opciones
  };

  // Selector con un <option> por cada encuentro en curso.
  const opciones = candidatos.map(c =>
    `<option value="${c.encuentroId}">${c.atacanteNombre} — ${c.armaNombre}</option>`
  ).join("");

  const contenido = `
    <div class="ad6-fuego-concentrado">
      <p>Elige el ataque al que <b>${actor.name}</b> presta su arma
         <b>${arma.nombre}</b> (${Number(tirada.exitos ?? 0)} éxito(s)) para el fuego concentrado:</p>
      <select data-selector-encuentro style="width:100%">${opciones}</select>
    </div>`;

  const elegido = await new Promise((resolve) => {
    new foundry.applications.api.DialogV2({
       window: { title: game.i18n.localize("Ad6.Mensajes.fuegoConcentrado.titulo") }
      ,content: contenido
      ,buttons: [
        {
           action: "aceptar"
          ,label: game.i18n.localize("Ad6.Mensajes.fuegoConcentrado.prestarArma")
          ,default: true
          ,callback: (ev, button, dialog) => {
            const sel = dialog?.element?.querySelector("[data-selector-encuentro]");
            resolve(sel?.value ?? null);
          }
        }
        ,{
           action: "cancelar"
          ,label: game.i18n.localize("Ad6.Etiquetas.cancelar")
          ,callback: () => resolve(null)
        }
      ]
      ,close: () => resolve(null)
    }).render(true);
  });
  if (!elegido) return false;

  const ok = await prestarArma(elegido, armaRef);
  if (ok)
  {
    ui.notifications.info(game.i18n.format("Ad6.Mensajes.fuegoConcentrado.prestada", { arma: arma.nombre }));
  }
  else
  {
    ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.fuegoConcentrado.errorPrestar"));
  }
  return ok;
}

/**
 * Abre el flujo de PRESTAR DEFENSA: presta los éxitos de defensa de esta tirada
 * a un defensor de un encuentro activo (selector de defensor).
 * @param {Actor} actor
 * @param {string} slot
 * @returns {Promise<boolean>} true si se prestó la defensa.
 */
export async function invocarPrestarDefensa(actor, slot)
{
  if (!actor || !SLOTS_TIRADA.includes(slot)) return false;
  const tirada = actor.system?.[slot];
  if (!tirada) return false;

  const exitos = Number(tirada.exitos ?? 0);
  const prestable = (exitos > 0)
    && (faseDeAccion(tirada) === "operacionesDefender"
        || (tirada.superFase === "operaciones" && tirada.sinergia === true));
  if (!prestable)
  {
    ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.prestarDefensa.sinExitos"));
    return false;
  }

  // Defensores de encuentros vivos, EXCLUYENDO al propio actor.
  const candidatos = defensoresEnConflicto(actor.uuid);
  if (candidatos.length === 0)
  {
    ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.prestarDefensa.sinDefensor"));
    return false;
  }

  const fuenteRef = {
     actorUuid:    actor.uuid
    ,actorId:      actor.id
    ,actorNombre:  actor.name
    ,img:          actor.img
    ,slot:         slot
    ,fuente:       (tirada.fase === "operacionesDefender")
                     ? "operacionesDefender" : "operacionesSinergia"
    ,disponible:   exitos
    ,exitosDefensa: 0
    ,propia:       false
  };

  const opciones = candidatos.map(c =>
    `<option value="${c.encuentroId}|${c.defensorUuid}">${c.defensorNombre} (vs ${c.atacanteNombre})</option>`
  ).join("");

  const contenido = `
    <div class="ad6-prestar-defensa">
      <p><b>${actor.name}</b> presta su defensa
         (${exitos} éxito(s)) al defensor:</p>
      <select data-selector-defensor style="width:100%">${opciones}</select>
    </div>`;

  const elegido = await new Promise((resolve) => {
    new foundry.applications.api.DialogV2({
       window: { title: game.i18n.localize("Ad6.Mensajes.prestarDefensa.titulo") }
      ,content: contenido
      ,buttons: [
        {
           action: "aceptar"
          ,label: game.i18n.localize("Ad6.Mensajes.prestarDefensa.boton")
          ,default: true
          ,callback: (ev, button, dialog) => {
            const sel = dialog?.element?.querySelector("[data-selector-defensor]");
            resolve(sel?.value ?? null);
          }
        }
        ,{
           action: "cancelar"
          ,label: game.i18n.localize("Ad6.Etiquetas.cancelar")
          ,callback: () => resolve(null)
        }
      ]
      ,close: () => resolve(null)
    }).render(true);
  });
  if (!elegido) return false;

  const [encuentroId, defensorUuid] = elegido.split("|");
  const ok = await prestarDefensa(encuentroId, defensorUuid, fuenteRef);
  if (ok)
  {
    ui.notifications.info(game.i18n.localize("Ad6.Mensajes.prestarDefensa.prestada"));
  }
  else
  {
    ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.prestarDefensa.errorPrestar"));
  }
  return ok;
}
