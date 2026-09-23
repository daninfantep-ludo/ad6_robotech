/**
 * REPRESENTACIÓN GRÁFICA DE LOS ENJAMBRES EN EL CANVAS
 * ============================================================================
 * Un actor de tipo "enjambre" agrupa unidades IDÉNTICAS en `system.formacion`
 * (array de Ad6_MiembroEnjambre). Cada miembro guarda:
 *   - identificador : el id del Actor referenciado (teniente o vehículo).
 *   - cantidad      : cuántas unidades de ese tipo hay.
 *   - img           : (retrato) del actor, que NO usamos para el token.
 *
 * Lo que queremos pintar:
 *   - En lugar de una única imagen (el token por defecto del enjambre), pintar
 *     UNA imagen por CADA UNIDAD de la formación. La imagen de cada unidad es
 *     la imagen de TOKEN del actor referenciado (prototypeToken.texture.src),
 *     no su retrato.
 *   - El conjunto ocupa un espacio cuadrado centrado en la huella (footprint)
 *     del token del enjambre:
 *       * 9 o menos unidades  -> 3x3 huellas (un "cuadrado de borde" alrededor).
 *       * 10 o más unidades   -> 5x5 huellas (dos "cuadrados de borde").
 *   - Cada imagen-token se NORMALIZA primero a 1 casilla (1x1 huella),
 *     independientemente del tamaño de su textura, y luego se le aplica el
 *     factor ESCALA_IMAGEN (0,8).
 *   - Las unidades se colocan en el CENTRO de cada casilla de la rejilla base
 *     (3x3 o 5x5), en orden de lectura por filas, quedando equidistantes entre
 *     sí (una figura por casilla) y centradas en su cuadrícula.
 *
 * Cómo se consigue sin romper nada de Foundry:
 *   Reemplazamos el `mesh` visual del token por una subclase de SpriteMesh que
 *   NO pinta nada (`_render` vacío) pero tiene como HIJOS los N sprites de las
 *   unidades. El token sigue siendo UN único objeto real: se mueve, se
 *   selecciona y se arrastra como siempre (Foundry controla su posición y su
 *   huella; el mesh solo cuelga de él). Al mover el token, TODAS las imágenes
 *   se mueven con él porque son hijas de su mesh.
 *
 *   Este enfoque está inspirado en el módulo comunitario "swarm" (strongpauly):
 *   sustituir token.mesh por un contenedor sin dibujo propio cuyos hijos son
 *   los sprites.
 *
 * SISTEMA DE COORDENADAS DEL MESH DEL TOKEN (v14):
 *   El mesh del token se posiciona en la esquina SUPERIOR-IZQUIERDA de la
 *   huella y tiene anchor/pivot en (0,0). Foundry le aplica una ESCALA (su
 *   `scale` no es 1: depende del tamaño del token), de modo que todo lo que
 *   cuelgue de él se ve multiplicado por esa escala. Por eso:
 *     - Pintamos los sprites en coordenadas LOCALES del mesh (origen en la
 *       esquina superior-izquierda de la huella).
 *     - Definimos una casilla en unidades locales como `grid.size / escalaMesh`,
 *       para que en pantalla equivalga EXACTAMENTE a una casilla del canvas.
 *   La unidad de referencia (una casilla) es SIEMPRE la casilla de la
 *   cuadrícula del canvas (`game.canvas.grid.size`), igual para todos los
 *   enjambres independientemente del tamaño de sus tokens.
 *
 * SELECCIÓN CON SOLAPE (requisito de diseño):
 *   Como las imágenes se extienden MÁS ALLÁ de la huella del token, ampliamos
 *   el "shape" interactivo del token-enjambre parcheando `Token.prototype.
 *   getShape` para que devuelva un rectángulo AMPLIADO que cubre toda su
 *   representación (la rejilla 3x3 o 5x5). Así el enjambre entra en el
 *   hit-testing de esa zona extendida.
 *
 *   NOTA: de momento NO forzamos la prioridad frente a tokens vecinos; nos
 *   apoyamos en el comportamiento por defecto de Foundry (elección por orden de
 *   profundidad/sort de los tokens). Se dejará para una revisión posterior si
 *   en la práctica el enjambre no acaba ganando cuando se solapa con otro actor.
 *
 * TODO EL CÓDIGO Y LOS COMENTARIOS ESTÁN EN CASTELLANO A PROPÓSITO.
 */

// ---------------------------------------------------------------------------
// Constantes de configuración (todas en un sitio para poder afinarlas)
// ---------------------------------------------------------------------------

// Fracción del tamaño de una casilla que ocupa cada imagen-token. Para la
// prueba base rellenamos la casilla entera (1.0 = sin márgenes); los ajustes
// finos se harán después.
const ESCALA_IMAGEN = 1.0;

// Separación (en píxeles de canvas) que se deja ENTRE imágenes contiguas. El
// hueco se reparte bajando el tamaño de cada figura en este valor: dos figuras
// vecinas quedan separadas exactamente MARGEN_IMAGEN px.
const MARGEN_IMAGEN = 5;

// Umbral de unidades para pasar de rejilla 3x3 a 5x5.
const UMBRAL_REJILLA_GRANDE = 10;

// Lado (en nº de huellas) de cada tipo de rejilla.
const LADO_REJILLA_PEQUENA = 3; // 9 o menos unidades
const LADO_REJILLA_GRANDE = 5;  // 10 o más unidades

// Imagen de respaldo si un actor no tiene ni token ni retrato.
const IMAGEN_RESPALDO = "icons/svg/mystery-man.svg";

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------

/**
 * Arranca la representación de enjambres. Debe llamarse UNA vez al inicializar
 * el sistema (en "init").
 */
export function inicializarRepresentacionEnjambre()
{
  // 1) Parcheamos la creación del mesh del token para poder sustituirlo por
  //    nuestro contenedor de enjambre. Se hace en "init" (antes de que exista
  //    ningún token en el canvas) para que el parche esté listo desde el inicio.
  _parchearAddToken();

  // 2) Parcheamos getShape para ampliar el área interactiva (selección) de los
  //    enjambres. Solo afecta a tokens cuyo actor sea de tipo "enjambre".
  _parchearGetShape();

  // 3) Cuando se redibuja un token, (re)creamos la representación del enjambre.
  Hooks.on("drawToken", (token) =>
  {
    try { _construirEnjambre(token); }
    catch (err) { console.error("AD6 Robotech | Error dibujando el enjambre:", err); }
  });

  // 4) Si cambia el ACTOR (por ejemplo se añade/quita un miembro, o cambia su
  //    cantidad), repintamos la representación del enjambre de sus tokens.
  Hooks.on("updateActor", (actor) =>
  {
    try { _refrescarPorActor(actor); }
    catch (err) { console.error("AD6 Robotech | Error refrescando el enjambre:", err); }
  });

  // 5) Al destruir el token, nos aseguramos de limpiar los sprites.
  Hooks.on("destroyToken", (token) =>
  {
    try { _destruirEnjambre(token); }
    catch (err) { console.error("AD6 Robotech | Error destruyendo el enjambre:", err); }
  });
}

// ---------------------------------------------------------------------------
// ¿Es un enjambre?
// ---------------------------------------------------------------------------

/**
 * ¿Este token representa a un actor de tipo "enjambre"?
 * @param {Token} token
 * @returns {boolean}
 */
function _esEnjambre(token)
{
  return token?.actor?.type === "enjambre";
}

// ---------------------------------------------------------------------------
// Cálculo de la lista de imágenes (una por unidad)
// ---------------------------------------------------------------------------

/**
 * Construye la lista de imágenes-token: una entrada por unidad de la formación.
 *
 * Para cada miembro se toman `cantidad` copias de la imagen de TOKEN del actor
 * referenciado (NO su retrato). Orden de resolución de la imagen:
 *   1) actorRef.prototypeToken.texture.src  (imagen de token)
 *   2) actorRef.img                         (retrato, por si no hay token)
 *   3) imagen de respaldo
 *
 * @param {Actor} actor  Actor enjambre.
 * @returns {string[]}   Lista de rutas de imagen (una por unidad).
 */
function _imagenesDeUnidades(actor)
{
  const imagenes = [];
  const formacion = actor?.system?.formacion ?? [];

  for (const miembro of formacion)
  {
    const cantidad = Math.max(0, Number(miembro?.cantidad ?? 0));
    if (cantidad <= 0) continue;

    const ref = game.actors?.get(miembro?.identificador);
    const src = ref?.prototypeToken?.texture?.src
             || ref?.img
             || miembro?.img
             || IMAGEN_RESPALDO;

    for (let i = 0; i < cantidad; i++) imagenes.push(src);
  }

  return imagenes;
}

// ---------------------------------------------------------------------------
// Parche de la creación del mesh (PrimaryCanvasGroup.addToken)
// ---------------------------------------------------------------------------

/**
 * Sustituye el mesh visual del token de un enjambre por un contenedor propio.
 * Se engancha a `PrimaryCanvasGroup.prototype.addToken`, que es quien crea y
 * devuelve el mesh del token (`token.mesh`).
 *
 * Se sigue el patrón del módulo de referencia: crear el mesh nativo, y si el
 * token es un enjambre, quitarlo del grupo y devolver en su lugar nuestro
 * contenedor (añadiéndolo al grupo y al mapa de meshes del grupo).
 */
function _parchearAddToken()
{
  const grupo = foundry?.canvas?.groups?.PrimaryCanvasGroup;
  if (!grupo?.prototype?.addToken)
  {
    console.error("AD6 Robotech | No se encontró PrimaryCanvasGroup.addToken para el enjambre.");
    return;
  }

  if (grupo.prototype.__ad6EnjambreParcheado) return;

  const original = grupo.prototype.addToken;
  grupo.prototype.addToken = function(token)
  {
    // Creamos el mesh nativo y lo guardamos por si hay que restaurarlo.
    const meshNativo = original.call(this, token);
    token.__ad6MeshNativo = meshNativo;

    if (!_esEnjambre(token)) return meshNativo;

    // CADA LLAMADA a addToken corresponde a un mesh NUEVO (Foundry acaba de
    // crear el mesh nativo). Por eso CREAMOS SIEMPRE un contenedor nuevo y
    // descartamos el anterior: reutilizar el viejo daba un problema de
    // re-render al cambiar la HUELLA del enjambre (al bajar de 10+ a <=9
    // unidades). En ese caso Foundry redibuja el token y recrea su mesh; si
    // reutilizábamos el contenedor viejo (que Foundry ya había removido y/o
    // destruido del grupo), pintábamos los sprites en un objeto huérfano que no
    // se veía, dejando el token en blanco hasta recargar.
    const contenedorViejo = token.__ad6ContenedorEnjambre;
    if (contenedorViejo && contenedorViejo !== meshNativo)
    {
      _limpiarSprites(contenedorViejo);
      // Si el contenedor viejo seguía colgando del grupo, lo sacamos.
      if (this.children.includes(contenedorViejo)) this.removeChild(contenedorViejo);
    }

    const contenedor = new _ContenedorEnjambre(token);
    token.__ad6ContenedorEnjambre = contenedor;

    // Quitamos el mesh nativo del grupo y colocamos el nuestro.
    if (this.children.includes(meshNativo)) this.removeChild(meshNativo);
    if (!this.children.includes(contenedor)) this.addChild(contenedor);

    // Actualizamos el mapa de meshes del grupo para que apunte al nuestro,
    // de modo que el transform/ordenado encuentre un padre válido.
    if (this.tokens) this.tokens.set(token.objectId, contenedor);

    return contenedor;
  };

  grupo.prototype.__ad6EnjambreParcheado = true;
}

/**
 * Contenedor visual de un enjambre: una subclase de SpriteMesh que NO pinta
 * nada por sí misma y cuyos hijos son los sprites de las unidades.
 *
 * Sobre `PrimarySpriteMesh`: en v14 su constructor recibe un objeto con
 * {object, name, texture}. Le pasamos la textura del token como "textura base"
 * (aunque no la pintemos), para que Foundry la mantenga válida y no rompa la
 * lógica de visibilidad/ilu. No obstante, silenciamos `_render` para no pintar
 * el token original.
 */
class _ContenedorEnjambre extends (foundry?.canvas?.primary?.PrimarySpriteMesh ?? Object)
{
  constructor(token)
  {
    const texture = token?.texture ?? PIXI.Texture.EMPTY;
    super({
      object: token,
      name: `ad6-enjambre.${token?.id ?? "sin-id"}`,
      texture
    });

    // El mesh en sí no debe culling-se (sus hijos sí se ven).
    this.cullable = false;

    // IMPORTANTE: neutralizamos la escala que Foundry aplica al mesh del token
    // (por defecto escala la textura para ajustarla a la huella, lo que
    // comprimiría nuestros sprites). Con scale = 1, el sistema de coordenadas
    // LOCAL del mesh coincide 1:1 con píxeles de canvas, así las cuentas de la
    // rejilla son directas (una casilla = game.canvas.grid.size unidades).
    this.__ad6ForzarEscalaUnidad();
  }

  /**
   * Deja la escala del contenedor en 1 (independientemente de lo que Foundry
   * intente), para que los hijos se midan en píxeles de canvas.
   */
  __ad6ForzarEscalaUnidad()
  {
    try { this.scale.set(1, 1); } catch (err) { /* aún sin scale */ }
  }

  // Foundry recalcula la escala del mesh en varios refrescos; la forzamos a 1.
  _updateLocalTransform()
  {
    if (typeof super._updateLocalTransform === "function") super._updateLocalTransform();
    this.__ad6ForzarEscalaUnidad();
  }

  // No pintamos la textura base del token: solo sus hijos (las unidades).
  // Foundry puede re-aplicar la escala del mesh (para encajar su textura base
  // de 512px en la huella) DESPUÉS de nuestros refrescos. Como _render se llama
  // en CADA frame de dibujo, forzamos aquí la escala a 1 (y el ancla a 0) para
  // que los hijos se midan SIEMPRE en píxeles de canvas, sin importar el tamaño
  // del token. Sin esto, un token de 3x3 (300px) con textura de 512px se vería
  // encogido por 300/512 ≈ 0.586.
  _render()
  {
    this.__ad6ForzarEscalaUnidad();
    if (this.pivot) this.pivot.set(0, 0);
    // intencionadamente NO pintamos la textura base: solo los hijos.
  }
}

// ---------------------------------------------------------------------------
// Construcción / refresco de la representación
// ---------------------------------------------------------------------------

/**
 * (Re)construye la representación del enjambre de un token: limpia los sprites
 * anteriores y pinta uno por cada unidad de la formación.
 * @param {Token} token
 */
function _construirEnjambre(token)
{
  if (!_esEnjambre(token)) return;

  // FUENTE DE VERDAD: el contenedor que Foundry tiene como mesh ACTUAL del
  // token. NO nos fiamos de la caché `__ad6ContenedorEnjambre`, porque tras un
  // redibujado (p. ej. al cambiar la huella de 5x5 a 3x3) el mesh se recrea y
  // la caché apuntaría a un contenedor huérfano: pintaríamos en un objeto que
  // ya no está en el árbol del canvas y el token quedaría EN BLANCO hasta
  // recargar. La caché solo se usa como respaldo por si `token.mesh` aún no
  // fuese nuestro contenedor en algún instante intermedio del dibujado.
  const contenedor = (token.mesh instanceof _ContenedorEnjambre)
    ? token.mesh
    : (token.__ad6ContenedorEnjambre instanceof _ContenedorEnjambre
        ? token.__ad6ContenedorEnjambre
        : null);
  if (!contenedor) return;

  // Sincronizamos la caché con el contenedor realmente en uso.
  token.__ad6ContenedorEnjambre = contenedor;

  // Limpiamos los sprites previos.
  _limpiarSprites(contenedor);

  const imagenes = _imagenesDeUnidades(token.actor);
  if (imagenes.length === 0) return;

  // Aseguramos que la huella del token es del tamaño de su rejilla (3x3/5x5).
  // OJO: NO salimos aquí aunque la huella haya cambiado. El `update` del
  // documento dispara un redibujado del token (drawToken) que volverá a pintar,
  // pero en ESE redibujado token.mesh ya es el contenedor nuevo; si saliésemos
  // ahora sin pintar, dependeríamos de que ese segundo draw rellene el mesh
  // nuevo, y si por lo que sea no recrea el mesh (solo cambia la textura),
  // el token quedaría en blanco. Pintando YA sobre el contenedor actual nos
  // aseguramos de que siempre hay sprites visibles:
  //   - si el redibujado recrea el mesh, _construirEnjambre se vuelve a llamar
  //     (drawToken) y repinta el contenedor nuevo;
  //   - si NO lo recrea, ya tenemos los sprites puestos con la geometría nueva
  //     (que se calcula a partir del nº de unidades, no de token.w).
  _ajustarTamanoToken(token);

  // Geometría de la rejilla, en coordenadas LOCALES del mesh.
  const geo = _geometriaDe(token, imagenes.length);

  // Lado que ocupará cada figura: una casilla (de la cuadrícula del canvas),
  // multiplicada por el factor del enjambre y REDUCIDA por el margen, para que
  // las imágenes contiguas queden separadas. Como cada figura se centra en su
  // casilla, dejar `MARGEN_IMAGEN` px de hueco total equivale a restar ese valor
  // al lado de la figura.
  const ladoFigura = Math.max(1, (geo.celda * ESCALA_IMAGEN) - MARGEN_IMAGEN);

  // Repartimos las unidades en el CENTRO de cada casilla de la rejilla base
  // (3x3 o 5x5), en orden de lectura por filas, con sesgo a la esquina
  // INFERIOR-DERECHA del espacio. Así quedan equidistantes, una por casilla.
  const posiciones = _posicionesEnCeldas(geo, imagenes.length);

  for (let i = 0; i < imagenes.length; i++)
  {
    const pos = posiciones[i];
    const sprite = PIXI.Sprite.from(imagenes[i]);
    sprite.anchor.set(0.5);

    // La imagen se muestra SIEMPRE CUADRADA (deformando el contenido si hace
    // falta) y del tamaño de la figura, sea cual sea el tamaño o el aspecto de
    // su textura original.
    _encajarEnCuadrado(sprite, ladoFigura);

    sprite.x = pos.x;
    sprite.y = pos.y;

    contenedor.addChild(sprite);
  }

  // DIAGNÓSTICO TEMPORAL: ver dónde está el origen (0,0) local del mesh
  // respecto a la huella del token. Quitar cuando afinemos la alineación.
  try
  {
    const m = token.mesh;
    console.log("AD6 enjambre DIAG", {
      numUnidades: imagenes.length,
      lados: geo.lados,
      celda: geo.celda,
      lado: geo.lado,
      tokenX: token.x, tokenY: token.y,
      tokenW: token.w, tokenH: token.h,
      anchorX: token.document?.texture?.anchorX,
      anchorY: token.document?.texture?.anchorY,
      contX: contenedor.x, contY: contenedor.y,
      contPivotX: contenedor.pivot?.x, contPivotY: contenedor.pivot?.y,
      contScaleX: contenedor.scale?.x, contScaleY: contenedor.scale?.y,
      contW: contenedor.width, contH: contenedor.height,
      meshX: m?.x, meshY: m?.y,
      meshScaleX: m?.scale?.x, meshScaleY: m?.scale?.y,
      meshPivotX: m?.pivot?.x, meshPivotY: m?.pivot?.y,
      meshAnchorX: token.texture?.anchor?.x, meshAnchorY: token.texture?.anchor?.y,
      gridSize: _ladoGrid(),
      primerSpriteX: contenedor.children?.[0]?.x,
      primerSpriteY: contenedor.children?.[0]?.y
    });
  }
  catch (err) { /* sin diagnóstico */ }
}

/**
 * Devuelve las posiciones (centro de cada casilla) de la rejilla base (3x3 o
 * 5x5), tomando las PRIMERAS `numUnidades` casillas en un orden que empieza por
 * la esquina INFERIOR-DERECHA y avanza hacia arriba/izquierda. Con 9 unidades
 * se llenan las 9 casillas; con menos, tienden a la esquina inferior-derecha.
 *
 * Si hay más unidades que casillas (no debería, dado el umbral), se reciclan
 * las posiciones en bucle.
 *
 * @param {{ lado:number, celda:number, lados:number }} geo
 * @param {number} numUnidades
 * @returns {{x:number,y:number}[]}
 */
function _posicionesEnCeldas(geo, numUnidades)
{
  const lados = geo.lados; // 3 o 5

  // Desplazamos el bloque medio lado hacia arriba-izquierda para intentar alinear
  // su esquina superior-izquierda con la de la huella del token (asumiendo que
  // el origen local (0,0) del mesh cae en el centro de la huella).
  const minX = -geo.lado / 2;
  const minY = -geo.lado / 2;

  // Centros de las lados*lados casillas, en orden de filas (de arriba-abajo) y
  // columnas (de izquierda a derecha). Cada figura ocupa una casilla completa.
  const orden = [];
  for (let fila = 0; fila < lados; fila++)
  {
    for (let col = 0; col < lados; col++)
    {
      orden.push({
        x: minX + (col + 0.5) * geo.celda,
        y: minY + (fila + 0.5) * geo.celda
      });
    }
  }

  const posiciones = [];
  for (let i = 0; i < numUnidades; i++)
  {
    posiciones.push(orden[i % orden.length]);
  }

  return posiciones;
}

/** Elimina y libera los sprites hijos del contenedor. */
function _limpiarSprites(contenedor)
{
  if (!contenedor) return;
  const hijos = [...contenedor.children];
  for (const hijo of hijos)
  {
    contenedor.removeChild(hijo);
    hijo.destroy?.();
  }
}

/**
 * Calcula la geometría de la representación en coordenadas LOCALES del mesh.
 *
 * CLAVES:
 *   - El mesh del token está ESCALADO por Foundry (su `scale` no es 1: depende
 *     del tamaño del token). Sus hijos se miden por tanto en "unidades locales"
 *     que hay que convertir a píxeles reales dividiendo por esa escala.
 *   - La unidad base (una casilla) es SIEMPRE la casilla de la CUADRÍCULA DEL
 *     CANVAS (`game.canvas.grid.size`), para que todos los enjambres tengan la
 *     misma escala aunque sus tokens sean de distinto tamaño.
 *   - El bloque de casillas se centra en el centro de la huella del token.
 *
 * @param {Token} token
 * @param {number} numUnidades
 * @returns {{ lado:number, celda:number, lados:number, ancho:number, alto:number }}
 */
function _geometriaDe(token, numUnidades)
{
  // Lado (en nº de casillas) de la rejilla según el nº de unidades.
  const lados = _ladosDe(numUnidades); // 3 o 5

  // Forzamos la huella del token al nº de casillas de la rejilla (3x3 o 5x5).
  // El token mide `lados` casillas de canvas de ancho y de alto.
  const gridSize = _ladoGrid();
  const ancho = gridSize * lados;
  const alto  = gridSize * lados;

  // Sistema de coordenadas LOCAL del mesh (forzado a escala 1 en el contenedor):
  // una casilla = gridSize unidades. El bloque ocupa exactamente la huella y se
  // ANCLA en su esquina superior-izquierda, que es el origen local (0,0).
  const celda = gridSize;
  const lado  = celda * lados;

  return { lado, celda, lados, ancho, alto };
}

/** Nº de casillas por lado de la rejilla (3 si <=9 unidades, 5 si >=10). */
function _ladosDe(numUnidades)
{
  return (numUnidades >= UMBRAL_REJILLA_GRANDE)
    ? LADO_REJILLA_GRANDE
    : LADO_REJILLA_PEQUENA;
}

/** Tamaño de una casilla de la cuadrícula del canvas (píxeles). */
function _ladoGrid()
{
  // Preferimos la casilla real del canvas; si no está disponible, caemos a la
  // configuración de la escena (grid.size / gridSize) y, en último caso, a 100.
  const c = canvas?.grid;
  const tam =
    Number(c?.size) ||
    Number(c?.grid?.size) ||
    Number(c?.document?.grid?.size) ||
    Number(globalThis?.canvas?.dimensions?.size) ||
    100;
  return tam > 0 ? tam : 100;
}

/**
 * Hace que un sprite ocupe EXACTAMENTE un cuadrado de lado `ladoObjetivo`
 * (en unidades locales del mesh), SEA CUAL SEA el tamaño o el aspecto de su
 * textura. Para ello aplica una escala INDEPENDIENTE en X y en Y (deformando
 * el contenido si la imagen original no es cuadrada).
 *
 * Si la textura aún no está cargada, se aplica cuando termine de cargar.
 *
 * @param {PIXI.Sprite} sprite
 * @param {number} ladoObjetivo  Lado del cuadrado objetivo (unidades locales).
 */
function _encajarEnCuadrado(sprite, ladoObjetivo)
{
  const escalar = () =>
  {
    const tex = sprite.texture;
    if (!tex) return;

    // Tamaño REAL de la imagen de origen. Preferimos las dimensiones de la
    // textura original (la fuente), que son estables y no dependen del frame
    // ni del estado de carga; así todas las figuras acaban del MISMO tamaño.
    const base = tex.baseTexture;
    const anchoTex = Math.max(
      1,
      Number(tex.orig?.width) ||
      Number(base?.realWidth) ||
      Number(base?.width) ||
      Number(tex.width)
    );
    const altoTex = Math.max(
      1,
      Number(tex.orig?.height) ||
      Number(base?.realHeight) ||
      Number(base?.height) ||
      Number(tex.height)
    );

    // Escala independiente por eje para forzar un cuadrado exacto.
    sprite.scale.set(ladoObjetivo / anchoTex, ladoObjetivo / altoTex);
  };

  const tex = sprite.texture;
  if (tex?.valid) escalar();
  else tex?.baseTexture?.once("loaded", escalar);
}

// ---------------------------------------------------------------------------
// Parche de getShape (prioridad de selección en solapes)
// ---------------------------------------------------------------------------

/**
 * Amplía el "shape" interactivo de los tokens-enjambre para que cubra toda su
 * representación (la rejilla 3x3 o 5x5), de modo que al pinchar sobre cualquier
 * imagen del enjambre se seleccione el enjambre, por delante de cualquier token
 * vecino con el que se solape.
 *
 * NOTA: `getShape` en v14 devuelve coordenadas LOCALES del token (relativas a
 * su esquina superior-izquierda). El rectángulo ampliado se centra en la huella
 * y puede tener valores negativos.
 */
function _parchearGetShape()
{
  const proto = foundry?.canvas?.placeables?.Token?.prototype;
  if (!proto?.getShape)
  {
    console.error("AD6 Robotech | No se encontró Token.getShape para el enjambre.");
    return;
  }

  if (proto.__ad6EnjambreShapeParcheado) return;

  const original = proto.getShape;
  proto.getShape = function()
  {
    if (!_esEnjambre(this)) return original.call(this);

    // El área interactiva del enjambre es su propia huella (NxN casillas), que
    // ya coincide con la representación pintada.
    const imagenes = _imagenesDeUnidades(this.actor);
    const numUnidades = imagenes.length > 0 ? imagenes.length : 1;
    const lados = _ladosDe(numUnidades);

    const ancho = Number(this.w ?? 0) || (_ladoGrid() * lados);
    const alto  = Number(this.h ?? 0) || (_ladoGrid() * lados);

    return new PIXI.Rectangle(0, 0, ancho, alto);
  };

  proto.__ad6EnjambreShapeParcheado = true;
}

// ---------------------------------------------------------------------------
// Refresco y destrucción
// ---------------------------------------------------------------------------

/** Repinta la representación de todos los tokens que muestran este actor. */
function _refrescarPorActor(actor)
{
  if (actor?.type !== "enjambre") return;

  for (const token of (canvas?.tokens?.placeables ?? []))
  {
    if (token.actor?.id === actor.id) _construirEnjambre(token);
  }
}

/**
 * Ajusta la HUELLA del token del enjambre al tamaño de su rejilla (3x3 o 5x5)
 * según el número de unidades, si no coincide ya. Devuelve true si cambió.
 * @param {Token} token
 * @returns {boolean}
 */
function _ajustarTamanoToken(token)
{
  const lados = _ladosDe(_imagenesDeUnidades(token.actor).length);
  const anchoDeseado = _ladoGrid() * lados;

  const anchoActual = Number(token?.w ?? 0);
  if (Math.abs(anchoActual - anchoDeseado) < 1) return false;

  // Actualizamos el documento del token (huella NxN y ancla 0,0).
  token.document?.update?.({
    width: lados,
    height: lados,
    "texture.anchorX": 0,
    "texture.anchorY": 0
  });
  return true;
}

/** Limpia la representación al destruir el token. */
function _destruirEnjambre(token)
{
  _limpiarSprites(token?.__ad6ContenedorEnjambre);
  token.__ad6ContenedorEnjambre = undefined;
}
