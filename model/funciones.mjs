// pasa que hay estructuras de datos que deberían ser clases pero son funciones
// porque tienen que ser schemaFields para la estructura de foundry
// entonces acá hago funciones que ayuden a resetear o inicializar para mejorar la 
// legibilidad y no repetir código


// SLOTS DE TIRADA CANÓNICOS
// El actor puede "fijar" hasta tres tiradas por asalto (tirada1/tirada2/tirada3).
// Estas dos constantes son la FUENTE ÚNICA de la lista de slots: cualquier parte
// del sistema que necesite recorrer las tiradas fijadas (limpiar, reconciliar
// Combatants de fase, calcular defensas disponibles, validar data-tirada de la
// hoja, etc.) debe iterar sobre ellas en lugar de hardcodear los slots. Así,
// añadir o quitar un slot en el futuro es tocar SOLO estas líneas (más el
// esquema del modelo, el JSON de etiquetas y la plantilla).
export const SLOTS_TIRADA = ["tirada1", "tirada2", "tirada3"];   // claves de system.*
export const NSLOTS_TIRADA = ["1", "2", "3"];                    // sufijos de data-tirada



// Para la presentación, cuenta cuantos hardwares activos hay en un equipment suite
// o en un arma
export function ContarHardwaresActivos(equipo)
{
    let resultado =0 ;
    for(let i =0; i<equipo.system.hardwares.length; i++)
    {
        if(equipo.system.hardwares[i])
        {
            resultado++;
        }
    }
    return resultado;
}


// esta función obtiene el objeto actor original, es decir si el actor es cualquiera, obtiene el actor
// pero si es un vehiculo obtiene el actor que es el piloto, para crear, y borrar itemes.
// igual al crear no funciona demasiado bien porque no refresca, y al borrar tampoco refresca.
// esto se arregla devolviendo una estructura, y si es piloto llamando al render del actor.
// tengo que pasar el tipo: si es un vehiculo las habilidades, talentos, competencias y elementos son del actor
// pero las suites de equipo y el equipo no, son de este actor. menudo quilombo
export async function ObtenerActorOriginal(actor,tipo)
{
    let resultado = await actor;
    let piloto = false;
    let soloVehiculo = ["habilidad","talento","elemento"];
    if((actor.type == "vehiculo")&&(soloVehiculo.includes(tipo)))
    {
        resultado = await foundry.utils.fromUuid("Actor." + actor.system.nombrePiloto);
        piloto = true;
    }
    return { actor: resultado, esPiloto: piloto};

}


// Función que nos encuentra un item en un actor o en su piloto
// SIEMPRE que se llame tiene que ser con AWAIT porque es asíncrona
export async function ObtenerItem(actor,itemId)
{
    let  item = actor.items.get(itemId); /// esto es lo original
    // hay que tener en cuenta que un item puede ser de otro actor y estar puesto en un vehículo
    // por lo tanto tenemos que ver si el objeto es del actor o de su piloto, para encontrarlo
    // y poder hacer lo que queramos con él
    if ((item===undefined)||(item===null))
    {
        let padre = actor.system.nombrePiloto;
        let uuid = "Actor." + padre+ ".Item."+itemId;      
        
        item = await foundry.utils.fromUuid(uuid);
    }
    return item;
}


export function limpiarArmadura(oArmadura)
{
    oArmadura.armadura = "";
    for(let i =0; i < oArmadura.resistencias.length; i++)
    {
        oArmadura.resistencias[i].adicional = 0;
    }
}

// ---------------------------------------------------------------------------
// SUITS DE EQUIPO "PERSONALES" DEL PILOTO EN UN VEHÍCULO
// ---------------------------------------------------------------------------
// Cuando un vehículo tiene piloto, los items de tipo "suitEquipo" cuyo campo
// system.personal === true son INTRÍNSECOS al personaje y se listan (en vivo) en
// la pestaña "Especiales" del vehículo, igual que sus talentos/elementos/
// habilidades. Al marcarlos ("siendoUsado") el suit se comporta como cualquier
// otro equipo: suma su "valor" a los dados y, AL TIRAR, debe contarse y
// CONSUMIRSE.
//
// El problema: las funciones de abajo reciben el VEHÍCULO, pero el item del suit
// personal vive en el PILOTO, no en el vehículo. Para que el ciclo completo
// (contar dados de equipo / validar usos / consumir un uso) funcione, hay que
// resolver también los suits personales del piloto.
//
// Estas tres funciones usan el helper de abajo para recolectar los suits a
// considerar. Como devuelve los ITEMS reales, al consumir se actualiza el item
// del PILOTO (no una copia), que es justo lo que se quiere.
//
// REVERSIBILIDAD: para volver EXACTAMENTE al comportamiento anterior (sólo mirar
// los suits del propio actor), basta con poner esta constante a false. No hay
// que tocar nada más.
export const INCLUIR_SUITS_PERSONALES_PILOTO = true;

// Devuelve la lista de items "suitEquipo" a considerar para un actor dado:
//   - siempre los suitEquipo del propio actor;
//   - si el actor es un "vehiculo" con piloto y el flag está activo, ADEMÁS los
//     suitEquipo PERSONALES (system.personal === true) del piloto.
// Devuelve ITEMS reales (no copias) para poder consumir/actualizar su uso.
export function suitsEquipoDe(actor)
{
    if (!actor) return [];
    const propios = actor.items.filter(i => i.type === "suitEquipo");
    if (!INCLUIR_SUITS_PERSONALES_PILOTO) return propios;
    if (actor.type !== "vehiculo") return propios;

    const idPiloto = actor.system?.nombrePiloto;
    if (!idPiloto || idPiloto === "undefined") return propios;

    const piloto = game.actors?.get(idPiloto);
    if (!piloto) return propios;

    const personales = piloto.items.filter(i => i.type === "suitEquipo" && i.system.personal === true);
    return [...propios, ...personales];
}

// para efectos de cálculo cuenta cuántos dados de equipo hay en el valor dados total
// para poder calcular en base al agotamiento
export function contarDadosEquipo(actor){
    let dadosEquipo = 0;
    const suit = suitsEquipoDe(actor);
    for(let i = 0; i < suit.length; i++)
    {
        if(suit[i].system.siendoUsado)
        {
            dadosEquipo += suit[i].system.valor;
        }
    }
    return dadosEquipo;
}
// Indica si el equipo seleccionado del actor puede ser usado: tiene usos infinitos o mayor que cero
export function puedeUsarEquipo(actor)
{
    let usados = 0;
    let puedeUsar = false;
    // suit: lista de itemes tipo equipmentsuite que estén siendo usados (debería ser uno, pero estamos viendo)
    const suit = suitsEquipoDe(actor).filter(function(item){return ((item.type=="suitEquipo")&&(item.system.siendoUsado))});
    if(suit.length==0)
    {
        puedeUsar= true;
    }
    else{
        for(let i = 0; i < suit.length; i++)
        {
            if(suit[i].system.siendoUsado)
            {
                usados ++;
                puedeUsar = puedeUsarItem(suit[i]);
            }
                }      
        puedeUsar = (((usados==1)||(actor.type=="enjambre"))&&(puedeUsar));
    }
    return (puedeUsar);
}

// para todos los elementos de equipo usados (sólo debería haber uno), consume un uso
// ASÍNCRONA: se await-ea cada consumición para GARANTIZAR que el uso queda
// guardado ANTES de que el llamante continúe (p.ej. antes de re-renderizar).
// Importante con los suits personales del piloto: el item actualizado vive en el
// piloto, y la hoja del vehículo debe re-renderizarse DESPUÉS de que el uso se
// haya persistido para que la fila muestre el nuevo "usos.restante".
export async function consumirEquipoUsado(actor)
{
    const suit = suitsEquipoDe(actor);
    for(let i = 0; i < suit.length; i++)
    {
        if(suit[i].system.siendoUsado)
        {
            await usarItem(suit[i]);
        }
    }
}

// saco la función de la hoja para llamarla tranquilamente desde cualquier parte
export function borrarTirada(actor)
{
    let updates = {};
    updates["system.dados"]=0;
    updates["system.dadosEquipo"]=0;
    updates["system.modificador"]=0;
    //updates["system.fase"]="ninguna";  // No cambio esto que es una joda volver a poner fase
    updates["system.tirada"]="normal";

    actor.update(updates);
    
    // desmarcar todas las habilidades puestas
    const habilidades = actor.items.filter(function(item){return item.type=="habilidad"});
    for(let i = 0; i < habilidades.length; i++)
    {
      habilidades[i].system.marcado=false;
      habilidades[i].update({["system.marcado"]: false}); // hay que poner system.marcado para actualizar el
                                                                // modelo de datos      
    }
    // desmarcar todos los suites de equipo puestos

    
    const suit = actor.items.filter(function(item){return item.type=="suitEquipo"});
    
    for(let i = 0; i < suit.length; i++)
    {
      suit[i].system.siendoUsado=false;
      suit[i].update({["system.siendoUsado"]: false}); // hay que poner system.marcado para actualizar el
                                                                // modelo de datos      
    }    
}

export function puedeUsarItem(item)
{
    //return ((item.system.usos.restante != "∞") && (item.system.usos.restante!="0"));
    return (item.system.usos.restante!="0");
}

// Vacía las TRES tiradas fijadas de la ronda (tirada1/tirada2/tirada3) de un
// actor. Es la operación "de datos" que hace el botón de limpiar tiradas y la
// que hay que ejecutar al cambiar de ASALTO (se resetea el turno). Se separa de
// la hoja para poderla llamar desde fuera (p.ej. desde el servicio de fases en
// el hook combatRound) sin depender de una instancia de la hoja.
export async function limpiarTiradasGuardadas(actor)
{
    if (!actor) return;

    const vacio = { fase: "", superFase: "ninguna", superFaseOriginal: "", faseOriginal: "", exitos: 0, sinergia: false, usoEquipo: false, arma: { clase: "", nombre: "", datos: {} } };
    // Construimos el update a partir de la lista canónica de slots: así vaciar
    // una tirada nueva no requiere tocar este código.
    const updates = {};
    for (const slot of SLOTS_TIRADA)
    {
        updates[`system.${slot}`] = foundry.utils.deepClone(vacio);
    }
    await actor.update(updates);
}

export async function usarItem(item)
{
    if((puedeUsarItem(item))&&(item.system.usos.restante != "∞"))
    {
        const valor = parseInt(item.system.usos.restante);
        item.system.usos.restante = valor - 1;
        await item.update({"system.usos": item.system.usos});

    }
}

export async function recargarItem(item)
{
    item.system.usos.restante = item.system.usos.maximo;
    await item.update({"system.usos": item.system.usos});
}

export async function infinitoItem(item)
{
    item.system.usos.restante = "∞";
    item.system.usos.maximo ="∞";
    await item.update({"system.usos": item.system.usos});
}

// item es el item pulsado
export async function cambiarVelocidad(actor,item)
{
    const velocidades = actor.items.filter(function(item){return item.type=="perfilVelocidad"});
    // marcar el pulsado como seleccionado y los otros como no seleccionados
    item.system.seleccionado = true;
    await item.update({"system.seleccionado": item.system.seleccionado});

    for(let i = 0; i < velocidades.length; i++)
    {
        if(velocidades[i].id != item.id)
        {
            velocidades[i].system.seleccionado = false;
            await velocidades[i].update({"system.seleccionado": velocidades[i].system.seleccionado});
        }
    }
}

export function aproximar(numero)
{
    let resultado = 0;
    if(numero < 1)
    {
         resultado = 1;
    }
    else{
        resultado = Math.round(numero);
    }

    return resultado;
}

export function tieneArma(t)
{
            const a = t?.arma;
      if (!a) return false;
      if ((a.clase ?? "") !== "") return true;
      if ((a.nombre ?? "") !== "") return true;
      /*const d = a.datos;
      if (d && typeof d === "object" && Object.keys(d).length > 0) return true;*/
      return false;
}


