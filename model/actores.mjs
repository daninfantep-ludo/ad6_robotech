// Definición de datos Actor
/*
*   Ad6_Actor                 << hojaActor >>
*   |
*   +--Ad6_ActorConflicto
*   |
*   +--Ad6_ActorPersona       << hojaActorPersona >>    ¿Por qué 3 clases para un actor "persona"?
*   |   |                                               Y no 3 clases para un actor "vehículo"
*   |   +Ad6_ActorPrincipal   << hojaActorPrincipal >>  Porque quiero que el vehículo se pueda meter en compendio
*   |   |                                               Y lo único que lo diferencia realmente en sus partes html
*   |   +Ad6_ActorTeniente    << hojaActorTeniente >>   es la estructura de los dados (Cómo tira) hay más información
*   |   |                                               en las personas hay estructura más chicas y más grandes notoriamente
*   |   +Ad6_ActorEnjambre
*   |
*   +--Ad6_ActorVehiculo
*

* 
*/


import {Ad6_MiembroEnjambre,Ad6_Tirada, Ad6_Fase, Ad6_Herida, Ad6_Personalidad, Ad6_Indicador, Ad6_TipoTirada, Ad6_HeridasParams, Ad6_Ranking, Ad6_Clon} from './general.mjs'
import { Ad6_Armadura } from './items.mjs';
import { estaDerrotado as _estaDerrotado } from './ad6_derrotado.mjs';


const fields = foundry.data.fields;

export class Ad6_Actor extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
         dados: new fields.NumberField({initial:0})    
        ,dadosEquipo: new fields.NumberField({initial:0})    
        ,fase: new fields.StringField({initial: "ninguna"})
        ,tirada: new fields.StringField({initial: "0"})
        ,notas: new fields.StringField()
                ,tirada1: new fields.SchemaField(Ad6_Tirada())
        ,tirada2: new fields.SchemaField(Ad6_Tirada())
        ,tirada3: new fields.SchemaField(Ad6_Tirada())
        }
    }

    


    calcularModificador()
    {
        let resultado = -1;
        switch(this.tirada)
        {
            case "normal": resultado = 0; break;
            case "ventaja": resultado = 2; break;
            case "apoyo": resultado = 1; break;
            case "obstaculo": resultado = -1; break;
            case "desventaja": resultado = -2; break;
        }
        return resultado;
        
    }

        calcularAgotamiento()
    {
        // esta función es para que la reescriba el actor principal
        // que es el único que puede agotarse
        return "";
    }

    /**
     * ¿Está este actor FUERA DE COMBATE (derrotado)? Delega en el módulo PURO
     * ./ad6_derrotado.mjs, que centraliza los criterios por tipo de actor. Se
     * expone aquí como método del DataModel para poder invocarlo como
     * `actor.system.estaDerrotado()` desde cualquier sitio.
     *
     * OJO: NO escribe nada (ni el combate ni el token). Solo EVALÚA. La
     * sincronización del estado `defeated` del combatiente la hace el servicio
     * de combate (ver module/combate/ad6_servicioCombate.mjs).
     */
    estaDerrotado()
    {
        return _estaDerrotado(this.parent);
    }

    totalDados(dadosEquipo)
    {
        this.dadosEquipo = dadosEquipo;

        if(this.hastaAgotamiento) // si no lo tiene definido en el esquema de datos... moya, no se hace, está bien
        {
            if(this.agotamiento <= (this.dados-this.dadosEquipo)){
                return this.agotamiento + this.dadosEquipo;}
            else   {
                return this.dados;
            }
        }
        else
        {
            return this.dados;
        }        

        return this.dados;
    }
    exitosDado(dado)
    {
        const mod = this.calcularModificador();
        let result = -1;

        switch(mod)
        {
            case 2:
                if((dado==6)||(dado==5)) {  result = 2; }
                else if(dado==4) { result = 1; }
                else { result =0; }
                break;
            case 1: 
                if(dado==6) {  result = 2; }
                else if((dado==4)||(dado==5)) { result = 1; }
                else { result =0; }
                break;
            case 0: 
                if(dado==6) {  result = 2; }
                else if(dado==5) { result = 1; }
                else { result =0; }
                break;
            case -1:
                if(dado==6) {  result = 2; }
                else { result =0; }
                break;
            case -2:
                if(dado==6) {  result = 1; }
                else { result =0; }
                break;
        }
        return result;
    }

    /* se pasa la variable de si puede o no usar
       porque tiene que calcularse externamente a la clase
       no cambiamos nada de fuera, sólo reformulamos la tirada
       en caso que no pueda usar el equipo */
    formulaTirada(dadosEquipo,puedeUsarEquipo)
    {
        let total = this.totalDados(dadosEquipo);
        if(!puedeUsarEquipo){
            total = this.totalDados(dadosEquipo)-dadosEquipo;
        }
        let formula = "{";
        for(let i=0; i < total; i++)
        {
            if(i!=0){formula +=",";}
            formula +="1d6";
        }
        formula+="}";
        return formula;
    }


}

export class Ad6_ActorConflicto extends Ad6_Actor{
 static defineSchema() {
    const commonData = super.defineSchema();
        return {
        ...commonData
        ,armadura: new fields.NumberField()
        ,descripcion: new fields.StringField()
        }
    }    
}

export class Ad6_ActorPersona extends Ad6_Actor{
 static defineSchema() {
    const commonData = super.defineSchema();
    return {
        ...commonData
        ,carrera: new fields.StringField()
        ,especialidad: new fields.StringField()   // podría ser vacía
        ,especie: new fields.StringField()
        ,velocidad: new fields.StringField()
        ,heridas: new fields.ArrayField(new fields.SchemaField(Ad6_Herida())
               ,{initial:[
                     {letra:"B", marcado:false, visible:false, color:"verde"}
                    ,{letra:"B", marcado:false, visible:false, color:"verde"}
                    ,{letra:"B", marcado:false, visible:false, color:"verde"}
                    ,{letra:"B", marcado:false, visible:true, color:"verde"}
                    ,{letra:"B", marcado:false, visible:true, color:"ambar"}
                    ,{letra:"C", marcado:false, visible:true, color:"rojo"}
                    ,{letra:"C", marcado:false, visible:false, color:"rojo"}
                ]
                } )
        ,clones: new fields.ArrayField(new fields.SchemaField(Ad6_Clon())
                ,{initial:[{nombre:"",estado:"blanco"},{nombre:"",estado:"blanco"}
                ]})
        ,heridasParams: new fields.SchemaField(Ad6_HeridasParams())

        }
    }    
}

export class Ad6_ActorPrincipal extends Ad6_ActorPersona{
    static defineSchema() {
        const commonData = super.defineSchema();
        return {
        ...commonData
        ,naturaleza: new fields.SchemaField(Ad6_Personalidad())
        ,conducta: new fields.SchemaField(Ad6_Personalidad())
                ,agotamiento: new fields.NumberField({initial:5})
        ,hastaAgotamiento: new fields.BooleanField({initial:false})
        ,nombreVehiculo: new fields.StringField({initial:""})
        // id del actor "vehiculo" en el que este principal actúa como TRIPULANTE.
        // Mismo patrón que system.nombrePiloto del vehículo (id sin "Actor.").
        // Cuando está relleno, se muestra la pestaña "Tripulante" y los equipos/
        // suities del vehículo se listan (en vivo) y se pueden usar desde aquí.
        ,rango: new fields.SchemaField(Ad6_Ranking())
        ,fama: new fields.SchemaField(Ad6_Ranking())
        ,fortuna: new fields.SchemaField(Ad6_Ranking())
        ,heroicoExtra: new fields.BooleanField()
        ,dramas: new fields.ArrayField(new fields.StringField(),{initial:["","",""]})
        ,nivel: new fields.NumberField({initial:1})
        ,construccion: new fields.NumberField()   // Puntos de construcción
        ,estres: new fields.ArrayField(new fields.StringField(),{initial:["","","","",""]})
        ,movimientosHeroicos: new fields.ArrayField(new fields.SchemaField(Ad6_Herida())
               ,{initial:[
                     {letra:"", marcado:false, visible:false, color:"verde"}
                    ,{letra:"", marcado:false, visible:true, color:"verde"}
                ]})
        }
    }
    calcularAgotamiento()
    {
        // acá ya tengo los dados de equipo y los dados normales como para
        // hacer el cálculo directamente

        if(((this.dados-this.dadosEquipo) > this.agotamiento)&&(!this.hastaAgotamiento))
        {
            let usados = 0;
            let aAgotarse = this.dados-this.dadosEquipo-this.agotamiento;
            for(let i=0; i<this.estres.length;i++)
            {
                if(this.estres[i]!="")
                {
                    usados++;
                }
                if((this.estres[i]==="")&&(aAgotarse>0))
                {
                    this.estres[i]="F";
                    aAgotarse--;
                    usados++;
                }
            }
            if((aAgotarse > 0)||(usados==5))
            {
                return "quiebre";
            }
            else
            {
                return "";
            }
        }        
    }

}

export class Ad6_ActorEnjambre extends Ad6_Actor {
    static defineSchema() {
    const commonData = super.defineSchema();
        return {
        ...commonData
        
        ,unidades: new fields.NumberField()
        // la cantidad de unidades, determina el máximo de dados y de unidades presentes
        // se debería condecir en todo momento con la cantidad de actores del swarm
        ,restantes: new fields.NumberField()
        // inicia cada ronda con unidades, luego se pueden asignar a acciones con un botón (+1,+5)
        // para descontar y tirar
        ,formacion: new fields.ArrayField(new fields.SchemaField(Ad6_MiembroEnjambre()))
        // en formación me guardo los uuid de los actores que forman el swarm


        }
    }
}

export class Ad6_ActorTeniente extends Ad6_ActorPersona {
    static defineSchema() {
        const commonData = super.defineSchema();
        return {
            ...commonData
        ,asistir: new fields.NumberField({initial:0})
        ,observar: new fields.NumberField({initial:0})
        ,ocultar: new fields.NumberField({initial:0})
        ,atacar: new fields.NumberField({initial:0})
        ,defender: new fields.NumberField({initial:0})
        ,redirigir: new fields.NumberField({initial:0})
        ,inhibir: new fields.NumberField({initial:0})
        ,interactuar: new fields.NumberField({initial:0})
        ,tipoTeniente: new fields.StringField({initial:"nada"})
        ,elemento: new fields.StringField()

        }
    }
}
/* 1.-  Aunque lo lógico es que vehículo sea separado al meter al piloto necesito cosas del persona así que cambio la herencia
   2.-  heradar sólo me serviría... para los datos del system del teniente, pero los datos estáticos de talentos y habilidades los debería poder usar
        ¿dónde se trata el pulsar en habilidades?
   3.-  Al final subo el método para tratar los botones (es general) y heredo de actor porque me dedico a completar el context en el 
        prepare context correspondiente al vehículo así el modelo queda más limpio, aunque al final es como lo mismo
 */
export class Ad6_ActorVehiculo extends Ad6_Actor{
    static defineSchema() {
        const commonData = super.defineSchema();
        return {
            ...commonData
            ,nombreAnterior: new fields.StringField({initial:""})
            // para almacenar el nombre antes de que se le ponga piloto
            ,estructura: new fields.SchemaField(Ad6_Indicador()) 
            // la armadura será un item; hay que crear uno al instanciar un actor de este tipo para que tenga
            // la apariencia de un conjunto de campos normal y poder reusar
            ,designacion: new fields.StringField()
            // el tipo estará en el item armadura para no repetir
            // las competencias necesarias se harán a nivel e objeto?
            ,nombrePiloto: new fields.StringField({initial:""})
            ,hastaAgotamiento: new fields.BooleanField({initial:false})
            ,esBasico: new fields.BooleanField({initial:false})
            ,usaLocalizaciones: new fields.BooleanField({initial:false})
            ,usaSistemas: new fields.BooleanField({initial:false})
            // los sistemas, 
            ,sensores: new fields.StringField({initial:"normal"})
            ,apuntado: new fields.StringField({initial:"normal"})
            ,impulsores: new fields.StringField({initial:"normal"})
            ,motores: new fields.StringField({initial:"100%"})
            // este campo interno para detectar cuando se cambia a escala naval
            ,escalaPrincipal: new fields.StringField()
            ,tipoTripulacion: new fields.StringField({initial:"nada"})
            ,rolNave: new fields.StringField({initial:"destructor"})
                    ,asistir: new fields.NumberField({initial:0})
        ,observar: new fields.NumberField({initial:0})
        ,ocultar: new fields.NumberField({initial:0})
        ,atacar: new fields.NumberField({initial:0})
        ,defender: new fields.NumberField({initial:0})
        ,redirigir: new fields.NumberField({initial:0})
        ,inhibir: new fields.NumberField({initial:0})
        ,interactuar: new fields.NumberField({initial:0})
        }

        // deberé tener métodos externos, porque estas clases son una mierda, que me diga la velocidad de un vehículo (actual) tipo getter, pero no en la clase
        // como tiene item para la velocidad... 
    }    
}



