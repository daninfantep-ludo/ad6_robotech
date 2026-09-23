// ---------------------------------------------------------------------------
// SERVICIO DE UPGRADES (aislado)
// ---------------------------------------------------------------------------
// Un "upgrade" es un item embedded del actor que, al EQUIPARSE, inyecta cosas
// al actor y, al DESEQUIPARSE, las revierte:
//   - AÑADE/ELIMINA items reales (armaduras, equipos, suities de equipo,
//     talentos y elementos) que venían definidos como copias completas dentro
//     del propio upgrade. QUÉ listas se aplican depende del TIPO DE ACTOR
//     (vehiculo / principal / teniente); ver LISTAS_POR_ACTOR.
//   - SOLO en VEHÍCULO, además:
//       * Suma/resta BONOS numéricos (estructura; y del Blindaje: armadura,
//         resistir y resistencias energía/no-melee/frío).
//       * Sustituye/restaura IMÁGENES del vehículo (retrato y token).
//       * Sustituye/restaura la DESIGNACIÓN del vehículo.
//     En principal/teniente NADA de esto tiene sentido y se ignora.
//
// TODO el "trabajo sucio" vive AQUÍ, en funciones puras de datos, para que la
// hoja del actor NO conozca los detalles: sólo engancha la action y el drop.
// Si algún día se quiere desactivar la funcionalidad, basta con no mostrar la
// ventana de upgrades y no crear items de tipo "upgrade": este módulo no toca
// nada por sí solo.
//
// Sobre el ORIGEN de los items inyectados: se reutiliza system.idPadre (el
// mismo campo que usa el enjambre para marcar de qué actor viene un item
// copiado). Aquí idPadre = id del item upgrade que lo inyectó. Así, al
// desequipar, se borran del actor todos los items cuyo idPadre sea el de
// este upgrade, sin necesidad de tocar el modelo de Ad6_Item.
// ---------------------------------------------------------------------------

// Qué campos de lista del upgrade se APLICAN a cada TIPO DE ACTOR.
//   - vehiculo : armaduras + equipos + suitEquipos
//   - principal: equipos + suitEquipos + talentos + elementos
//   - teniente : equipos + suitEquipos
// Los bonos numéricos, las imágenes y la designación SOLO se aplican en
// vehículo (se controla aparte, con esVehiculo()).
const LISTAS_POR_ACTOR = {
   vehiculo:  ["armaduras", "equipos", "suitEquipos"]
  ,principal: ["equipos", "suitEquipos", "talentos", "elementos"]
  ,teniente:  ["equipos", "suitEquipos"]
};

// ¿El actor es un VEHÍCULO? Sólo en ese caso tienen efecto los bonos numéricos,
// las imágenes y la designación.
function esVehiculo(actor)
{
  return actor?.type === "vehiculo";
}

// ---------------------------------------------------------------------------
// Localización del Blindaje del vehículo.
// El vehículo guarda su armadura principal como un item de tipo "armadura"
// llamado "Blindaje" (se crea en el constructor de la hoja del vehículo). Si
// por lo que sea no existiera, devolvemos la primera armadura que encontremos.
// ---------------------------------------------------------------------------
function blindajeDe(actor)
{
  const armaduras = actor.items.filter(i => i.type === "armadura");
  return armaduras.find(i => i.name === "Blindaje") ?? armaduras[0] ?? null;
}

// ---------------------------------------------------------------------------
// Estructura: suma "delta" al máximo y al restante. El restante nunca baja
// de 0 (si el delta es negativo y dejaría el restante por debajo, se pone a 0).
// Devuelve el update a aplicar (o null si no hay nada que cambiar).
// ---------------------------------------------------------------------------
function updateEstructura(actor, delta)
{
  if (!delta) return null;
  const actual = actor.system.estructura ?? {};
  const maxActual = Number(actual.maximo ?? 0);
  const resActual = Number(actual.restante ?? 0);
  const nuevoMax = maxActual + delta;
  const nuevoRes = Math.max(0, resActual + delta);
  return {
     "system.estructura.maximo":   String(nuevoMax)
    ,"system.estructura.restante": String(nuevoRes)
  };
}

// ---------------------------------------------------------------------------
// Designación: al EQUIPAR, si el upgrade trae una "designacion" NO vacía, se
// sustituye la DESIGNACIÓN del vehículo (system.designacion) por ella y se
// guarda la designación original en system.designacionOriginal del upgrade
// (para poder restaurarla). Al DESEQUIPAR se restaura la original guardada.
//   - Si el upgrade NO trae designación (vacía), NO se toca nada.
//   - ROBUSTEZ: si el actor NO tiene el campo system.designacion (otro tipo de
//     actor sin ese campo), NO fallamos: simplemente no se toca la designación.
// Devuelve:
//   - actorUpdate: { "system.designacion": ... } a escribir en el actor (o null).
//   - itemUpdate:  campos del ITEM upgrade a escribir (o null).
// ---------------------------------------------------------------------------
function updateDesignacion(actor, upgrade, equipando)
{
  // ¿Tiene el actor el campo system.designacion? Si no lo tiene, no hacemos
  // nada (ni leemos ni escribimos) para no romper con actores sin ese campo.
  const tieneCampo = Object.prototype.hasOwnProperty.call(actor.system ?? {}, "designacion");
  if (!tieneCampo) return { actorUpdate: null, itemUpdate: null };

  if (equipando)
  {
    const nueva = (upgrade.system.designacion ?? "").trim();
    // Sin designación: no se toca nada ni se guarda nada.
    if (nueva === "") return { actorUpdate: null, itemUpdate: null };

    // Guardamos la designación ACTUAL del vehículo para poder restaurarla, y
    // ponemos la del upgrade.
    return {
      actorUpdate: { "system.designacion": nueva },
      itemUpdate: { "system.designacionOriginal": actor.system.designacion ?? "" }
    };
  }
  else
  {
    // Desequipar: restauramos la designación original guardada (si la hay).
    const original = (upgrade.system.designacionOriginal ?? "").trim();
    return {
      actorUpdate: original !== "" ? { "system.designacion": original } : null,
      itemUpdate: { "system.designacionOriginal": "" }
    };
  }
}

// ---------------------------------------------------------------------------
// Blindaje: aplica los bonos propios de la armadura sobre el item Blindaje:
//   - bonoArmadura -> suma a armadura.valor (el máximo) y a armadura.restante.
//   - bonoResistir -> suma a armadura.resiste.
//   - bonosResistencias (array de {descriptor, adicional}) -> cada entrada suma
//     su "adicional" a la resistencia del Blindaje cuyo DESCRIPTOR coincida.
//     Se localizan por DESCRIPTOR (nunca por posición), así añadir/quitar tipos
//     de ataque NO obliga a tocar esta función.
// "signo" es +1 para equipar y -1 para desequipar. El restante nunca baja de 0.
// Devuelve el update a aplicar al item (o null).
// ---------------------------------------------------------------------------
function updateBlindaje(actor, upgrade, signo)
{
  const blindaje = blindajeDe(actor);
  if (!blindaje) return null;

  const proteccion = blindaje.system.armadura;
  const resistencias = foundry.utils.deepClone(proteccion.resistencias ?? []);

  // Bono de armadura (valor máximo y restante).
  const bonoArmadura = Number(upgrade.system.bonoArmadura ?? 0) * signo;
  const nuevoValor = Number(proteccion.valor ?? 0) + bonoArmadura;
  const nuevoRestante = Math.max(0, Number(proteccion.restante ?? 0) + bonoArmadura);

  // Bono de "resiste".
  const bonoResistir = Number(upgrade.system.bonoResistir ?? 0) * signo;

  // Bonos de RESISTENCIA del upgrade: un array de {descriptor, adicional}. Se
  // indexa por DESCRIPTOR para sumar cada aporte al Blindaje en la resistencia
  // que corresponda (independientemente del orden de ambos arrays).
  const bonosPorDescriptor = {};
  for (const bono of (upgrade.system.bonosResistencias ?? []))
  {
    const desc = bono?.descriptor;
    if (!desc) continue;
    bonosPorDescriptor[desc] = (bonosPorDescriptor[desc] ?? 0) + (Number(bono.adicional ?? 0) * signo);
  }
  for (const resistencia of resistencias)
  {
    const aporte = bonosPorDescriptor[resistencia.descriptor];
    if (!aporte) continue;
    resistencia.adicional = Number(resistencia.adicional ?? 0) + aporte;
  }

  const nuevoResiste = Number(proteccion.resiste ?? 0) + bonoResistir;
  return {
     "system.armadura.valor":         nuevoValor
    ,"system.armadura.restante":      nuevoRestante
    ,"system.armadura.resiste":       nuevoResiste
    ,"system.armadura.resistencias":  resistencias
  };
}

// ---------------------------------------------------------------------------
// Imágenes: al EQUIPAR guarda los originales (en el propio item upgrade) y
// pone las imágenes del upgrade; al DESEQUIPAR restaura los originales.
//   - El RETRATO del vehículo (actor.img) se cambia SOLO si la imagen del PROPIO
//     ITEM (upgrade.img) NO es la de por defecto (la "bolsa" item-bag). Si el
//     item aún tiene el icono genérico, NO se toca el retrato del vehículo.
//   - La TEXTURA DEL TOKEN (prototypeToken.texture.src) se cambia SOLO si hay
//     system.imgToken definido. NO se cae al retrato del item: si no hay token
//     definido, no se toca el token.
// Si no se cambia ninguna de las dos, no se toca nada del actor.
// Devuelve:
//   - actorUpdate: campos del ACTOR a escribir (o null).
//   - itemUpdate:  campos del ITEM upgrade a escribir (o null).
//   - texturaToken: ruta de la textura de token resultante (o "" si no se toca),
//     para poder propagarla luego a los tokens YA colocados en las escenas.
// ---------------------------------------------------------------------------
function updateImagenes(actor, upgrade, equipando)
{
  if (equipando)
  {
    // Retrato: la imagen del propio item, PERO sólo si NO es la de por defecto
    // (la bolsa). Si el item conserva el icono genérico, no se cambia el retrato.
    const imgItem = (upgrade.img ?? "").trim();
    const imgRetrato = esImgItemDefecto(imgItem) ? "" : imgItem;

    // Token: SOLO si hay una imagen de token definida. NO cae al retrato.
    const imgToken = (upgrade.system.imgToken ?? "").trim();

    // Sin retrato ni token que aplicar no se toca nada del actor.
    if (imgRetrato === "" && imgToken === "") return { actorUpdate: null, itemUpdate: null, texturaToken: "" };

    const actorUpdate = {};
    const itemUpdate = {};

    // RETRATO: sólo si de verdad lo vamos a cambiar. Guardamos el original para
    // poder restaurarlo al desequipar.
    if (imgRetrato !== "")
    {
      actorUpdate["img"] = imgRetrato;
      itemUpdate["system.imgActorOriginal"] = actor.img;
    }

    // TOKEN: sólo si hay token definido. Guardamos la textura REAL del token en
    // escena si existe (los tokens ya colocados pueden diferir del prototype);
    // si no, la del prototypeToken.
    if (imgToken !== "")
    {
      actorUpdate["prototypeToken.texture.src"] = imgToken;
      itemUpdate["system.imgTokenOriginal"] = texturaTokenActual(actor);
    }

    return {
      actorUpdate,
      itemUpdate,
      // La textura efectiva a propagar a los tokens en escena (o "" si no aplica).
      texturaToken: imgToken !== "" ? imgToken : ""
    };
  }
  else
  {
    // Desequipar: restauramos SOLO lo que se había cambiado (lo que dejó rastro
    // en los campos "originales" al equipar).
    const actorUpdate = {};

    // RETRATO: sólo si en su día se cambió (hay imgActorOriginal guardado).
    const imgActorOriginal = (upgrade.system.imgActorOriginal ?? "").trim();
    if (imgActorOriginal !== "") actorUpdate["img"] = imgActorOriginal;

    // TOKEN: sólo si en su día se cambió (hay imgTokenOriginal guardado). Si la
    // textura guardada es vacía o el mystery-man por defecto (capturas antiguas
    // / tokens vinculados), usamos el retrato original del actor.
    const guardadaToken = (upgrade.system.imgTokenOriginal ?? "").trim();
    let texturaToken = "";
    if (guardadaToken !== "")
    {
      const imgTokenOriginal = esImgTokenDefecto(guardadaToken) ? imgActorOriginal : guardadaToken;
      if (imgTokenOriginal !== "")
      {
        actorUpdate["prototypeToken.texture.src"] = imgTokenOriginal;
        // Sólo propagamos si de verdad estamos tocando el token.
        texturaToken = imgTokenOriginal;
      }
    }

    return {
      actorUpdate: Object.keys(actorUpdate).length ? actorUpdate : null,
      itemUpdate: {
         "system.imgActorOriginal": ""
        ,"system.imgTokenOriginal": ""
      },
      texturaToken
    };
  }
}

// Imagen por defecto de Foundry para ITEMS sin icono propio: la "bolsa". Si el
// retrato del upgrade es esta (o está vacío), NO se aplica al vehículo. Se
// compara por sufijo para tolerar rutas con o sin sistema/almacenamiento.
const IMG_ITEM_DEFECTO = "icons/svg/item-bag.svg";

function esImgItemDefecto(src)
{
  const s = (src ?? "").trim().toLowerCase();
  return s === "" || s.endsWith(IMG_ITEM_DEFECTO.toLowerCase());
}

// ---------------------------------------------------------------------------
// Tokens en escena: helpers para leer/propagar la textura del token a los tokens
// YA colocados. prototypeToken.texture.src sólo afecta a tokens NUEVOS; los
// tokens que ya están sobre una escena tienen su propia copia de la textura.
// ---------------------------------------------------------------------------

// Devuelve todos los TokenDocuments (en TODAS las escenas) que representan a
// este actor.
function tokensDelActor(actor)
{
  if (!game.scenes) return [];
  const lista = [];
  for (const escena of game.scenes)
  {
    const tokens = escena.tokens?.filter?.(t => t.actorId === actor.id) ?? [];
    lista.push(...tokens);
  }
  return lista;
}

// Imagen por defecto de Foundry para tokens sin textura propia. Si la textura
// "original" que capturamos es esta, NO la tomamos como buena: preferimos lo
// que el vehículo muestra realmente (su actor.img o la textura de un token).
const IMG_TOKEN_DEFECTO = "icons/svg/mystery-man.svg";

// ¿Es la imagen por defecto (mystery-man)? Se compara por sufijo para tolerar
// rutas con o sin sistema/almacenamiento por delante.
function esImgTokenDefecto(src)
{
  const s = (src ?? "").trim().toLowerCase();
  return s === "" || s.endsWith(IMG_TOKEN_DEFECTO.toLowerCase());
}

// Textura "original" a recordar para poder restaurar al desequipar. Prioridad:
//   1) La textura del primer token colocado en escena con src VÁLIDA (no vacía
//      ni mystery-man).
//   2) El prototypeToken.texture.src, si es válida (no vacía ni mystery-man).
//   3) El propio img del actor (es lo que se ve cuando el token cae al default).
//   4) Como último recurso, la mejor src disponible aunque sea mystery-man.
function texturaTokenActual(actor)
{
  const tokens = tokensDelActor(actor);
  for (const t of tokens)
  {
    const src = (t.texture?.src ?? "").trim();
    if (!esImgTokenDefecto(src)) return src;
  }

  const protSrc = (actor.prototypeToken?.texture?.src ?? "").trim();
  if (!esImgTokenDefecto(protSrc)) return protSrc;

  // Hasta aquí sólo había mystery-man / vacío: usamos el retrato del actor,
  // que es lo que el usuario ve en el token cuando cae al default.
  const imgActor = (actor.img ?? "").trim();
  if (imgActor !== "") return imgActor;

  // Sin nada mejor, devolvemos lo que hubiera (aunque sea el default).
  return protSrc || (tokens[0]?.texture?.src ?? "");
}

// Propaga la textura del token a los tokens YA colocados en las escenas.
// "nuevaSrc" es la ruta a aplicar (si es "" no hace nada). Devuelve el nº de
// tokens actualizados.
async function propagarTexturaTokensEnEscena(actor, nuevaSrc)
{
  const src = (nuevaSrc ?? "").trim();
  if (src === "") return 0;

  let actualizados = 0;
  for (const token of tokensDelActor(actor))
  {
    // Sólo actualizamos si la textura difiere (evita refrescos innecesarios).
    if (token.texture?.src !== src)
    {
      await token.update({ "texture.src": src });
      actualizados++;
    }
  }
  return actualizados;
}

// ---------------------------------------------------------------------------
// Items inyectados: crea copias de las listas del upgrade que APLICAN al tipo
// de actor, marcándolas con idPadre = id del upgrade. Devuelve el array de
// datos listos para createEmbeddedDocuments.
// ---------------------------------------------------------------------------
function copiasAInyectar(upgrade, actor)
{
  const camposAplicables = LISTAS_POR_ACTOR[actor?.type] ?? [];
  const resultado = [];
  for (const campo of camposAplicables)
  {
    const lista = upgrade.system[campo] ?? [];
    for (const copia of lista)
    {
      // Clonamos por seguridad y le damos identidad propia + origen.
      const nueva = foundry.utils.deepClone(copia);
      nueva._id = foundry.utils.randomID();
      nueva.system = nueva.system ?? {};
      nueva.system.idPadre = upgrade.id;
      resultado.push(nueva);
    }
  }
  return resultado;
}

// Items inyectados por un upgrade concreto (los que hay que borrar al quitar).
function itemsInyectadosPor(actor, upgrade)
{
  return actor.items.filter(i => i.system?.idPadre === upgrade.id).map(i => i.id);
}

// ---------------------------------------------------------------------------
// API PÚBLICA
// ---------------------------------------------------------------------------

// ¿Este actor puede llevar upgrades? (vehiculo, principal y teniente).
export function puedeLlevarUpgrades(actor)
{
  return ["vehiculo", "principal", "teniente"].includes(actor?.type);
}

// Devuelve los items de tipo upgrade del actor.
export function upgradesDelActor(actor)
{
  if (!actor) return [];
  return actor.items.filter(i => i.type === "upgrade");
}

// EQUIPAR un upgrade: aplica bonos, imágenes e inyecta items.
// Es idempotente: si ya está equipado, avisa y no hace nada.
export async function equiparUpgrade(actor, upgrade)
{
  if (!puedeLlevarUpgrades(actor)) {
    ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.upgradeSoloVehiculo"));
    return false;
  }
  if (upgrade.system.equipado) {
    ui.notifications.info(game.i18n.format("Ad6.Mensajes.upgradeYaEquipado", { nombre: upgrade.name }));
    return false;
  }

  // En vehículo se aplican, además de las listas, los bonos numéricos, las
  // imágenes, la designación y los bonos al Blindaje. En principal/teniente
  // NADA de eso tiene sentido: sólo se inyectan las listas que apliquen.
  const enVehiculo = esVehiculo(actor);

  // 1) Estructura (bono al máximo y al restante). SOLO vehículo.
  const upActorEst = enVehiculo
    ? updateEstructura(actor, Number(upgrade.system.bonoEstructura ?? 0))
    : null;

  // 2) Imágenes (actor.img + token). Guardamos originales en el item. SOLO vehículo.
  const { actorUpdate, itemUpdate, texturaToken } = enVehiculo
    ? updateImagenes(actor, upgrade, true)
    : { actorUpdate: null, itemUpdate: null, texturaToken: "" };

  // 2c) Designación: sustituye la designación del vehículo. SOLO vehículo.
  const upDesign = enVehiculo
    ? updateDesignacion(actor, upgrade, true)
    : { actorUpdate: null, itemUpdate: null };

  // Montamos el update del actor uniendo estructura + imágenes + designación.
  const updateActor = { ...(upActorEst ?? {}), ...(actorUpdate ?? {}), ...(upDesign.actorUpdate ?? {}) };
  if (Object.keys(updateActor).length) await actor.update(updateActor);

  // 2b) Propagar la textura del token a los tokens YA colocados en las escenas
  //     (prototypeToken sólo afecta a tokens nuevos).
  await propagarTexturaTokensEnEscena(actor, texturaToken);

  // 3) Blindaje (resiste + resistencias). SOLO vehículo.
  if (enVehiculo)
  {
    const upBlindaje = updateBlindaje(actor, upgrade, +1);
    if (upBlindaje) await blindajeDe(actor)?.update(upBlindaje);
  }

  // 4) Items a inyectar (armaduras/equipos/suities/talentos/elementos) SEGÚN
  //    el tipo de actor.
  const copias = copiasAInyectar(upgrade, actor);
  if (copias.length) await actor.createEmbeddedDocuments("Item", copias);

  // 5) Marcar el upgrade como equipado + guardar originales de imagen y designación.
  const updatesItem = { "system.equipado": true, ...(itemUpdate ?? {}), ...(upDesign.itemUpdate ?? {}) };
  await upgrade.update(updatesItem);

  ui.notifications.info(game.i18n.format("Ad6.Mensajes.upgradeEquipado", { nombre: upgrade.name }));
  return true;
}

// DESEQUIPAR un upgrade: revierte bonos, imágenes y borra los items inyectados.
export async function desequiparUpgrade(actor, upgrade)
{
  if (!puedeLlevarUpgrades(actor)) {
    ui.notifications.warn(game.i18n.localize("Ad6.Mensajes.upgradeSoloVehiculo"));
    return false;
  }

  // Como al equipar: en vehículo se revierten bonos, imágenes, designación y
  // Blindaje; en principal/teniente sólo se borran las listas inyectadas.
  const enVehiculo = esVehiculo(actor);

  // 1) Estructura (resta el bono; el restante no baja de 0). SOLO vehículo.
  const upActorEst = enVehiculo
    ? updateEstructura(actor, -Number(upgrade.system.bonoEstructura ?? 0))
    : null;

  // 2) Imágenes: restaurar originales. SOLO vehículo.
  const { actorUpdate, itemUpdate, texturaToken } = enVehiculo
    ? updateImagenes(actor, upgrade, false)
    : { actorUpdate: null, itemUpdate: null, texturaToken: "" };

  // 2c) Designación: restaurar la designación original. SOLO vehículo.
  const upDesign = enVehiculo
    ? updateDesignacion(actor, upgrade, false)
    : { actorUpdate: null, itemUpdate: null };

  const updateActor = { ...(upActorEst ?? {}), ...(actorUpdate ?? {}), ...(upDesign.actorUpdate ?? {}) };
  if (Object.keys(updateActor).length) await actor.update(updateActor);

  // 2b) Propagar la textura restaurada a los tokens YA colocados en las escenas.
  await propagarTexturaTokensEnEscena(actor, texturaToken);

  // 3) Blindaje (quitar bonos). SOLO vehículo.
  if (enVehiculo)
  {
    const upBlindaje = updateBlindaje(actor, upgrade, -1);
    if (upBlindaje) await blindajeDe(actor)?.update(upBlindaje);
  }

  // 4) Borrar los items inyectados por este upgrade (de cualquier lista).
  const ids = itemsInyectadosPor(actor, upgrade);
  if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);

  // 5) Marcar como no equipado + limpiar originales de imagen y designación.
  await upgrade.update({ "system.equipado": false, ...(itemUpdate ?? {}), ...(upDesign.itemUpdate ?? {}) });

  ui.notifications.info(game.i18n.format("Ad6.Mensajes.upgradeDesequipado", { nombre: upgrade.name }));
  return true;
}

// QUITAR un upgrade: primero lo desequipa (revierte) y luego lo BORRA del
// vehículo. Este es el flujo que dispara el botón "trash" de la ventana.
export async function quitarUpgrade(actor, upgrade)
{
  if (upgrade.system.equipado) {
    await desequiparUpgrade(actor, upgrade);
  }
  await actor.deleteEmbeddedDocuments("Item", [upgrade.id]);
}
