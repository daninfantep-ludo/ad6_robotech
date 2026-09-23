/// Funciones y tipos complejos para usar más adelante

const fields = foundry.data.fields;

/*
  Representa una "copia" (duplicado de datos) del item Equipo o SuitEquipo que
  estaba siendo usado cuando se guardó una tirada.
  NO es un Item real del actor: es un clon plano de sus datos, pensado para
  poder calcular el daño después sin depender de si el arma cambió o desapareció
  mientras tanto. Guarda además la "clase" (tipo de item) y el nombre legible.
*/
export function Ad6_ArmaTirada()
{
  return{
    // "equipo" (arma) | "suitEquipo"
     clase: new fields.StringField({initial:""})
    ,nombre: new fields.StringField({initial:""})
    // Copia plana y completa del item en el momento de guardarse
    // (equivale a deepClone(item.toObject())). Contiene system.dano,
    // system.penetracion, system.area, descriptores, hardwares, etc.
    ,datos: new fields.ObjectField()
    // PENETRACIÓN FINAL: valor de penetración EFECTIVO que se aplicará en el
    // cálculo del daño. Conceptualmente pertenece al arma; en rigor iría dentro
    // de "datos" (el clon aplastado del item), pero se deja AQUÍ, como campo
    // propio de Ad6_ArmaTirada, para no tocar el proceso de copia/ "aplastado"
    // del item.
    //
    // IMPORTANTE: la tirada NO lo toca nunca (al tirar/guardar se ignora). Lo
    // rellena el MÓDULO DE COMBATE al construir el arma del encuentro, a partir
    // de la penetración (system.penetracion) del arma:
    //   - penetración vacía            -> 0
    //   - formato "Pn"  (n natural)    -> n
    //   - formato "Pn|m" (dos valores) -> el atacante elige (por defecto n)
    ,penetracionFinal: new fields.NumberField({initial:0})
  }
}

/*
  Almacena cada tirada (tirada1/tirada2/tirada3) que el jugador decide "fijar"
  tras haberla lanzado: la fase, los éxitos obtenidos (que se leen del chat) y
  un clon del arma / suit de equipo usado. sirve de memoria para el combate.
*/
export function Ad6_Tirada()
{
  return{
    
    fase: new fields.StringField({initial:""})
    ,exitos: new fields.NumberField({initial:0})
        // Indica si la tirada se fijó "con sinergia" (solo actores principales, o
    // vehículos tripulados por un principal, y solo cuando intervinieron DOS o
    // más habilidades). Se calcula/ congela al LANZAR la tirada en el chat y se
    // arrastra hasta aquí al fijarla. Para el resto de actores siempre es false.
    ,sinergia: new fields.BooleanField({initial:false})
        // "superfase" de la acción: agrupa las subfases (system.fase del actor) en
        // las tres familias del juego. Valores posibles: "ninguna" | "soporte" |
        // "operaciones" | "cinematica". Se deriva de la subfase al fijar la tirada.
        // OJO: el campo "fase" sigue guardando la SUBFASE concreta (p. ej.
        // "soporteAsistir"); este campo "superFase" es solo el grupo ("soporte").
        ,superFase: new fields.StringField({initial:"ninguna"})
                // "superfase" ORIGINAL de la tirada, ANTES de cualquier ACELERAR (Push).
        // - Al fijar la tirada se guarda igual que "superFase" (la de origen).
        // - Al ACELERAR, "superFase" pasa a la macrofase DESTINO (para mover la fila
        //   de zona y colorearla) pero "superFaseOriginal" NO cambia: es la que
        //   define el ICONO (que, por regla, NO cambia al acelerar; solo su color).
        // Si está vacía (tiradas antiguas o sin acelerar), se usa "superFase".
        ,superFaseOriginal: new fields.StringField({initial:""})
        // SUBFASE ORIGINAL de la tirada, ANTES de cualquier ACELERAR (Push).
        // Es el SIGNIFICADO de la acción (atacar/defender/interactuar...). Al
        // ACELERAR, "fase" pasa a la subfase del destino (para recolocar la fila
        // en el tracker) pero "faseOriginal" NO cambia: es la que decide QUÉ
        // BOTONES se ofrecen (atacar, fuego concentrado, prestar defensa...) y si
        // se muestra el nombre del arma. Así una acción de cinemática acelerada a
        // operaciones NO se convierte en ataque, y una de operaciones acelerada a
        // soporte sigue siendo "atacar/defender" a efectos de botones.
        // Si está vacía (tiradas antiguas o sin acelerar), se usa "fase".
        ,faseOriginal: new fields.StringField({initial:""})
    // Campo INTERNO (no se muestra en ninguna plantilla). Indica si la tirada
    // se generó apoyándose en un suitEquipo, es decir, si al lanzarla había al
    // menos un suitEquipo con system.siendoUsado === true (contarDadosEquipo > 0).
    // Se congela en el flag del chat al LANZAR y se arrastra hasta aquí al
    // fijarla, igual que "sinergia". Por ahora es un campo pasivo, sin lógica
    // asociada: solo se almacena para usarlo más adelante.
    ,usoEquipo: new fields.BooleanField({initial:false})
    ,arma: new fields.SchemaField(Ad6_ArmaTirada())
  }
}

export function Ad6_MiembroEnjambre()
{
  return {
    // lo básico
     identificador: new fields.StringField()
    ,nombre: new fields.StringField()
    ,img: new fields.StringField()
    //más cosas necesarias
    ,cantidad: new fields.NumberField({initial:0})
    ,armaduraPrincipal: new fields.SchemaField(Ad6_Proteccion())
    ,armaduraSecundaria: new fields.SchemaField(Ad6_Proteccion())
    ,estructura: new fields.NumberField({initial:0})
    ,tipo: new fields.StringField() // L, M,N la estructura
  };
}

export function Ad6_Indicador()
{
  return {
     maximo: new fields.StringField({initial:"0"})
    ,restante: new fields.StringField({initial:"0"})
  };
}

export function Ad6_Endurecido()
{
  return {
     nivel1: new fields.BooleanField({initial:false})
    ,nivel2: new fields.BooleanField({initial:false})
  };
}

export function Ad6_HeridasParams()
{
  return {
     endurecido: new fields.SchemaField(Ad6_Endurecido())
    ,mejorado: new fields.BooleanField({initial:false})
    /* esto porque a los zentraedi se les da uno de armadura ligera
       con su primer nivel de "built-though"
       quizá qué pase con ATS y las nuevas razas, por eso en lugar de si o no
       lo dejo como un valor por si otras razas como los karbarrans tienen
       algún otro tema . se define como un schema por las resistencias
       a los distintos tipos de daño así uso la armadura con los mecha también*/
    ,armadura: new fields.SchemaField(Ad6_Proteccion())
    /* este es para denotar más fácil cuánto vale cada herida para aplicación
       de daño en el futuro. humanos dira L, zentraedis 5L o 1M y así*/
    ,valorHeridas: new fields.StringField({initial:"L"})
  };
  
}

 
/*
  Esto sirve para tener un array de descriptores y armaduras
  adicionales que se superponen a la definición de la armadura

*/

export function Ad6_Resistencia()
{
  return{
      descriptor: new fields.StringField({initial:""})
      // anti-energía, frío, no cuerpo a cuerpo, definido en
      // config.mjs como Ad6.TipoAtaque.*
     ,adicional: new fields.NumberField({initial:0})
      // la cantidad de armadura adicional que le da una resistencia
      // a la armadura cuando le atacan con ese tipo de ataque

  };
}
/*
esto sirve para tener paramétrico la armadura natural o bien de la
del equipo
Por un lado está la armadura normal, luego los spherians tienen
armadura extra contra la energía, al igual que algunos battloids
y luego los garudan tienen contra el frío

cambio varias veces de enfoque. Finalmente tenemos
- tipo L,M,N
- valor: valor máximo de la armadura
- restante: valor actual de la armadura (si es ablativa o si es de mecha)
- resiste: cancela penetración de armadura
- ablativa s/n si es S => es un escudo (jotun, gosuke, salamander, escudo bioroid, algunos destroids UEEF RCB en los invid)
*/

export function Ad6_Proteccion()
{
  return{
     tipo: new fields.StringField({initial:"L"}) // indica si es L M o N
    ,valor: new fields.NumberField({initial:0}) // el valor de la armadura
    ,restante: new fields.NumberField({initial:0}) // se usa para los mecha, porque pueden dañar su armadura. 
                                                    // no se usó un indicador porque se partió sin tener en cuenta esto
    // estos tres campos tipo-valor-restante es para mecha. no quiero hacer otra estructura.
    // ojo la gosuke puede tener el escudo que suma 3L de armadura ablativa. osea, no es sólo para mecha
    // cuando se vaya a calcular el daño se verá qué tipo de armadura es y qué protección da con una función que tome
    // estos campos o el objeto que los contenga y listo
     // La armadura define todo lo demás (bonos y otros)
    ,resiste: new fields.NumberField({initial:0})
    ,ablativa: new fields.BooleanField({initial: false}) 
    // este campo es para denotar que es un escudo, y el orden de prelación en la aplicación del daño
    ,resistencias: new fields.ArrayField(new fields.SchemaField(Ad6_Resistencia())
      ,{initial: [{descriptor: "Ad6.TipoAtaque.energia", adicional: 0}
        ,{descriptor: "Ad6.TipoAtaque.noMelee", adicional: 0}
        ,{descriptor: "Ad6.TipoAtaque.frio", adicional: 0}
      ,{descriptor: "Ad6.TipoAtaque.ligero", adicional: 0}
    ,{descriptor: "Ad6.TipoAtaque.area", adicional: 0}]})
  };
}

export function Ad6_Ranking()
{
  return {
     codigo: new fields.StringField()
    ,descripcion: new fields.StringField()
  };
}

export function Ad6_Fase() {
  return {
     accion: new fields.NumberField()
    ,orden: new fields.NumberField()
    ,id: new fields.StringField()
    ,valor: new fields.BooleanField()
  };
}

// para definir ventaja, apoyo, normal, obstáculo y desventaja
export function Ad6_TipoTirada() {
  return {
     orden: new fields.NumberField()
    ,id: new fields.StringField()
    ,valor: new fields.BooleanField()
  };
}

export function Ad6_Personalidad()
{
  return {
     descriptor: new fields.StringField()
    ,usado: new fields.BooleanField()
  };

}

export function Ad6_Herida()
{
  return {
     letra: new fields.StringField()
    ,marcado: new fields.BooleanField()
    ,visible: new fields.BooleanField()
    ,color: new fields.StringField()
  };
}

export function Ad6_Clon()
{
  return{
     nombre: new fields.StringField()
    ,heridas: new fields.NumberField({initial:0}) /* cantidad de heridas 3 para los tiresios*/
  };
}


