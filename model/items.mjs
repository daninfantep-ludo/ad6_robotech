// Definición de datos Item
/*
*   Ad6_Item
*   |
*   +--Ad6_Habilidad
*   |
*   +--Ad6_Talento                 
*   |
*   +--Ad6_Armadura
*   |
*   +--Ad6_Equipo
*   |  |
*   |  +--Ad6_Suite
*   |
*   +--Ad6_Hardware
*/

import {Ad6_Proteccion, Ad6_Resistencia, Ad6_Fase, Ad6_Herida, Ad6_Personalidad, Ad6_Indicador, Ad6_TipoTirada} from './general.mjs'

const fields = foundry.data.fields;

// Este me sirve para los elementos, porque no tienen nada más.
export class Ad6_Item extends foundry.abstract.TypeDataModel{
    static defineSchema() {
        return{
            descripcion: new fields.StringField()
            ,idPadre: new fields.StringField()
            // este campo es para marcar los itemes que importamos en los swarms, para luego poder quitarlos cuando
            // se saque al actor del swarm
        }
    }
}

export class Ad6_Habilidad extends Ad6_Item{
    static defineSchema() {
        const commonData = super.defineSchema();
        return {
        ...commonData
        ,costo: new fields.StringField()
        ,beneficio: new fields.StringField()
        ,valor: new fields.NumberField()
        ,marcado: new fields.BooleanField()
        }
    }
}

export class Ad6_Talento extends Ad6_Item{
    static defineSchema() {
        const commonData = super.defineSchema();
        return {
        ...commonData
        ,tipo: new fields.StringField() // si es de carrera, táctico, etc
        ,usos: new fields.SchemaField(Ad6_Indicador())
        }
    }
}

export class Ad6_Armadura extends Ad6_Item{
    static defineSchema() {
        const commonData = super.defineSchema();
        return {
        ...commonData
        ,armadura: new fields.SchemaField(Ad6_Proteccion())
        ,equipada: new fields.BooleanField({initial: true})
        ,rangoRequerido: new fields.StringField()
        }
    }
}

export class Ad6_Equipo extends Ad6_Item{
    static defineSchema() {
        const commonData = super.defineSchema();
        return {
        ...commonData
        ,rangoRequerido: new fields.StringField()
        ,rango: new fields.StringField()
        ,extendido: new fields.BooleanField()
        ,dano: new fields.StringField()
        ,penetracion: new fields.StringField()
        ,area: new fields.StringField()
        ,agua: new fields.BooleanField()
        ,bocajarro: new fields.BooleanField() /* indica si tiene penalización si se dispara en melee*/
        ,francotirador: new fields.BooleanField()
        ,incendiaria: new fields.BooleanField()
        ,corrosiva: new fields.BooleanField()
        ,pesada: new fields.BooleanField()
        ,bloqueo: new fields.BooleanField()
        ,misiles: new fields.BooleanField()
        ,silenciosa: new fields.BooleanField()
        ,esHardware: new fields.BooleanField()
        /* en el caso de un mecha indica que el arma es un hardware, puede tener uno o varios elementos ej: [H][H] los dos Gunpod del Thunderstrike*/
        ,esBanco: new fields.BooleanField()
        /* si esto es true, no debería ser true hardware e indica que el arma, o el equipo forma parte de un banco de armas*/
        /* en ambos casos hay que representar esto*/
        
        ,bancos: new fields.SchemaField(Ad6_Indicador()) // en caso que sean bancos controlamos los números en caso que sean hardwares, contaremos la cantidad
        ,hardwares: new fields.ArrayField(new fields.BooleanField({initial:true})) // el tamaño será dinámico cuando cambie bancos
            // true => está bueno , false => está malo

        //,destruido: new fields.BooleanField()
        /* para marcar que un hardware está destruido, cuando
           es un arma -_> ya no sirve porque voy a hacer una pura línea por equipos repetidos, para mayor compactación*/
        ,siendoUsado: new fields.BooleanField()
        /*este siendo usado es para marcar el arma
          que se está ocupando en un ataque determinado */
        ,danoEnergia: new fields.BooleanField()
        ,danoMelee: new fields.BooleanField()
        // estos campos son para indicar si hacen ese tipo de daño, para las resistencias.
        }
    }
    get descriptores()
    {
        let resultado ="";
        if(this.extendido){ resultado+=" [E]"; }
        if(this.agua){ resultado+=" [W]"; }
        if(this.bocajarro){ resultado+=" [M]"; }
        if(this.francotirador){ resultado+=" [S]"; }
        if(this.incendiaria){ resultado+=" [In]"; }
        if(this.corrosiva){ resultado+=" [Co]"; }
        if(this.pesada){ resultado+=" [Bu]"; }
        if(this.bloqueo){ resultado+=" [Pr]"; }
        if(this.misiles){ resultado+=" [Ms]"; }
        if(this.silenciosa){ resultado+=" [Q]"; }
        /*if(this.esHardware){ resultado+=" [H]"; } lo pondré con botoncitos*/
        return resultado.trim();
    }
}

export class Ad6_SuitEquipo extends Ad6_Equipo{
    static defineSchema() {
        const commonData = super.defineSchema();
        return {
        ...commonData
        ,valor: new fields.NumberField({initial:0})
        ,usos: new fields.SchemaField(Ad6_Indicador())
        // ya tengo el campo siendoUsado en el Equipo
        // en el arma es para atacar en la suitEquipo es para
        // indicar que se va a consumir
        ,personal: new fields.BooleanField({initial:false})
        // el campo personal indica que una suit de equipo es de una persona, por ejemplo
        // un suit de equipo que te lo da un talento y que puede ser usado en cualquier situación
        // el suit de equipo "zorro entre sabuesos" me lo da un talento, pero lo puedo usar como
        // persona o dentro de un mecha, pero en principio no me traigo equipment suites cuando 
        // piloto un mecha, pero este sí lo debería poder traer
        // hay que cambiar la lógica de esto también
        }
    }
}

// el hardware y la locación son lo mismo exactamente. Hago dos clases porque va a haber de estas clases que sean
// hardware y otras, locaciones. 
export class Ad6_Hardware extends Ad6_Item{
    static defineSchema() {
        const commonData = super.defineSchema();
        return {
        ...commonData
        ,marcado: new fields.BooleanField()
        }
    }
}

export class Ad6_Localizacion extends Ad6_Item{
    static defineSchema() {
        const commonData = super.defineSchema();
        return {
        ...commonData
        ,marcado: new fields.BooleanField()
        }
    }
}


// para la velocidad de los vehículos mechas y naves
export class Ad6_PerfilVelocidad extends Ad6_Item{
    static defineSchema() {
        const commonData = super.defineSchema();
        return {
        ...commonData
        ,inicial: new fields.StringField() // letra inicial para el control de forma
        ,velocidad: new fields.StringField() // Almacenada como 1GU 6PU 1SU
        ,seleccionado: new fields.BooleanField() // indica qué modo estoy piltoando                
        }
    }
}

/*
*   Ad6_Upgrade
*
*   Un upgrade es un PACK de mejoras removible que se aplica a un ACTOR que
*   pueda llevarlas (hoy: vehiculo, principal y teniente). A diferencia del
*   resto de items, NO se "usa" directamente: al EQUIPARLO se inyectan cosas al
*   actor y al DESEQUIPARLO se revierten. Toda la lógica de equipar/quitar vive
*   AISLADA en module/upgrade/ad6_servicioUpgrade.mjs; esta clase es SOLO datos.
*
*   Qué define un upgrade:
*   - BONOS numéricos (SOLO se aplican en vehículo).
*   - IMÁGENES opcionales (SOLO se aplican en vehículo).
*   - DESIGNACIÓN del vehículo (SOLO se aplica en vehículo).
*   - LISTAS de armaduras, equipos (armas), suities de equipo, talentos y
*     elementos que se AÑADEN al actor al equipar y se ELIMINAN al desequipar.
*     Qué listas se aplican depende del TIPO DE ACTOR: en vehículo, armaduras +
*     equipos + suitEquipos; en principal, equipos + suitEquipos + talentos +
*     elementos; en teniente, equipos + suitEquipos. Cada elemento es una copia
*     COMPLETA del item (item.toObject()), para poder recrearlo tal cual.
*
*   Sobre "idPadre" (heredado de Ad6_Item): se reutiliza como ORIGEN del item
*   copiado. En el enjambre guarda el id del Actor que lo aportó; aquí guarda el
*   id del item upgrade que lo inyectó. Así, al desequipar, se borran del actor
*   todos los items cuyo idPadre sea este upgrade.
*/
export class Ad6_Upgrade extends Ad6_Item{
    static defineSchema() {
        const commonData = super.defineSchema();
        return {
        ...commonData
        ,rangoRequerido: new fields.StringField()
        // --- ¿Está puesto el upgrade en el vehículo? ---
        ,equipado: new fields.BooleanField({initial: false})

                                // --- BONOS numéricos (pueden ser negativos) ---
        ,bonoEstructura: new fields.NumberField({initial: 0}) // suma a system.estructura.maximo y .restante del vehículo
        ,bonoArmadura: new fields.NumberField({initial: 0})   // suma a armadura.valor y .restante del Blindaje
        ,bonoResistir: new fields.NumberField({initial: 0})   // suma a armadura.resiste del Blindaje
        // --- BONOS de RESISTENCIA (uno por descriptor) ---
        // MISMO patrón que Ad6_Proteccion.resistencias: un array de
        // {descriptor, adicional}. Cada entrada suma (al equipar) o resta (al
        // desequipar) su "adicional" a la resistencia del Blindaje cuyo
        // DESCRIPTOR coincida (se localiza por descriptor, NUNCA por posición).
        // Al ser un array, añadir/quitar tipos de ataque NO obliga a tocar este
        // modelo: basta con editar las entradas desde la hoja del upgrade.
        ,bonosResistencias: new fields.ArrayField(new fields.SchemaField(Ad6_Resistencia())
          ,{initial: [{descriptor: "Ad6.TipoAtaque.energia", adicional: 0}
            ,{descriptor: "Ad6.TipoAtaque.noMelee", adicional: 0}
            ,{descriptor: "Ad6.TipoAtaque.frio", adicional: 0}
          ,{descriptor: "Ad6.TipoAtaque.ligero", adicional: 0}
        ,{descriptor: "Ad6.TipoAtaque.area", adicional: 0}]})


                        // --- DESIGNACIÓN del vehículo (opcional) ---
                        // Si "designacion" NO está vacía, al EQUIPAR el upgrade se sustituye la
                        // DESIGNACIÓN del vehículo (system.designacion del actor) por esta. Antes
                        // de sustituirla se guarda la designación original del vehículo en
                        // "designacionOriginal" (campo INTERNO, no editable) para poder restaurarla
                        // al DESEQUIPAR. Si el upgrade no trae designación (vacía), o si el actor
                        // no tiene el campo system.designacion, no se toca nada.
                        ,designacion: new fields.StringField({initial: ""})          // nueva designación (system.designacion) del vehículo
                        ,designacionOriginal: new fields.StringField({initial: ""})  // designación original del vehículo, guardada al equipar (no editable en la hoja)

                // --- Imagen de token (opcional) y originales para poder revertir ---
        // El RETRATO del vehículo se toma del propio img del item (upgrade.img),
        // editable en su hoja. Este campo es la TEXTURA DEL TOKEN (opcional); si
        // está vacío, se usa el mismo img del item también para el token.
        ,imgToken: new fields.StringField({initial: ""})        // textura del token del vehículo con el upgrade puesto
        ,imgActorOriginal: new fields.StringField({initial: ""}) // actor.img original, guardado al equipar (no editable en la hoja)
        ,imgTokenOriginal: new fields.StringField({initial: ""}) // prototypeToken.texture.src original, guardado al equipar (no editable en la hoja)

                // --- Listas de cosas a inyectar (copias completas de items) ---
        // Qué listas se aplican depende del TIPO DE ACTOR donde se instale:
        //   - vehiculo : armaduras + equipos + suitEquipos
        //   - principal: equipos + suitEquipos + talentos + elementos
        //   - teniente : equipos + suitEquipos
        // (Los bonos, imágenes y designación SOLO se aplican en vehículo.)
        ,armaduras: new fields.ArrayField(new fields.ObjectField())   // cada uno: item.toObject() de tipo armadura
        ,equipos: new fields.ArrayField(new fields.ObjectField())     // cada uno: item.toObject() de tipo equipo
        ,suitEquipos: new fields.ArrayField(new fields.ObjectField()) // cada uno: item.toObject() de tipo suitEquipo
        ,talentos: new fields.ArrayField(new fields.ObjectField())    // cada uno: item.toObject() de tipo talento
        ,elementos: new fields.ArrayField(new fields.ObjectField())   // cada uno: item.toObject() de tipo elemento
        }
    }
}
