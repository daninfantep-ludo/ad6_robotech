export const Ad6 = {};
/*
ad6.ranges = {
     "": "ad6.range.none"
    ,Me: "ad6.range.melee"
    ,S: "ad6.range.short"
    ,M: "ad6.range.medium"
    ,L: "ad6.range.long"
    ,E: "ad6.range.extreme"

};

ad6.scaleClasses = {
     light: "ad6.scaleClass.light"
    ,mecha: "ad6.scaleClass.mecha"
    ,naval: "ad6.scaleClass.naval"
};

ad6.fatigueValues = {
     none: "ad6.fatigueValue.none"
    ,fatigue: "ad6.fatigueValue.fatigue"
    ,drama: "ad6.fatigueValue.drama"
}
*/

Ad6.TipoTeniente = {
     nada: "Ad6.TipoTeniente.nada"
    ,menor: "Ad6.TipoTeniente.menor"
    ,importante: "Ad6.TipoTeniente.importante"
    ,ultra: "Ad6.TipoTeniente.ultra"
};

Ad6.Rango = {
     nada: "Ad6.Rango.nada"
    ,melee: "Ad6.Rango.melee"
    ,corto: "Ad6.Rango.corto"
    ,medio: "Ad6.Rango.medio"
    ,largo: "Ad6.Rango.largo"
    ,extremo: "Ad6.Rango.extremo"
};

// definiciones para la sección de las tiradas tiradas
Ad6.TipoTirada =
{
     ventaja:"Ad6.TipoTirada.ventaja"
    ,apoyo: "Ad6.TipoTirada.apoyo"
    ,normal:"Ad6.TipoTirada.normal"
    ,obstaculo:"Ad6.TipoTirada.obstaculo"
    ,desventaja: "Ad6.TipoTirada.desventaja"
}
Ad6.FaseAccion = 
{
    ninguna:""
    ,soporteAsistir:"Ad6.FaseAccion.soporteAsistir"    
    ,soporteOcultar:"Ad6.FaseAccion.soporteOcultar"
    ,soporteObservar:"Ad6.FaseAccion.soporteObservar"
    ,operacionesAtacar:"Ad6.FaseAccion.operacionesAtacar"
    ,operacionesDefender:"Ad6.FaseAccion.operacionesDefender"
    ,operacionesRedirigir:"Ad6.FaseAccion.operacionesRedirigir"
    ,cinematicaInteractuar:"Ad6.FaseAccion.cinematicaInteractuar"
    ,cinematicaInhibir:"Ad6.FaseAccion.cinematicaInhibir"
}    

Ad6.TipoTalentos =
{
    carrera: "Ad6.TipoTalentos.carrera"
    ,liderazgo: "Ad6.TipoTalentos.liderazgo"
    ,pilotaje: "Ad6.TipoTalentos.pilotaje"
    ,sociales: "Ad6.TipoTalentos.sociales"
    ,tacticos: "Ad6.TipoTalentos.tacticos"
    ,tecnicos: "Ad6.TipoTalentos.tecnicos"
    
}

// define el tipo de ataque que hace cada arma
// si es de energía, balístico, frío para que se use luego
// para comparar y aplicar en combate
Ad6.TipoAtaque =
{
     energia: "Ad6.TipoAtaque.energia"
    ,balistico: "Ad6.TipoAtaque.balistico"
    ,frio: "Ad6.TipoAtaque.frio"
    ,melee: "Ad6.TipoAtaque.melee"
    ,noMelee: "Ad6.TipoAtaque.noMelee"
    ,area: "Ad6.TipoAtaque.area"
    ,ligero: "Ad6.TipoAtaque.ligero"
}

Ad6.Especies = {
     humano: "Ad6.Especies.humano"
    ,zentraedi: "Ad6.Especies.zentraedi"
    ,tiresio: "Ad6.Especies.tiresio"
    ,invid: "Ad6.Especies.invid"
    ,karbarrano: "Ad6.Especies.karbarrano"
    ,praxiana: "Ad6.Especies.praxiana"
    ,garuda: "Ad6.Especies.garuda"
    ,spheris: "Ad6.Especies.spheris"
    ,peryton: "Ad6.Especies.peryton"
    ,haydonita: "Ad6.Especies.haydonita"
}

Ad6.Carreras = 
{
     piloto: "Ad6.Carreras.piloto"
    ,oficial: "Ad6.Carreras.oficial"
    ,tecnico: "Ad6.Carreras.tecnico"
    ,interprete: "Ad6.Carreras.interprete"
    ,espia: "Ad6.Carreras.espia"
    ,marine: "Ad6.Carreras.marine"
    ,mercenario: "Ad6.Carreras.mercenario"
    ,nomada: "Ad6.Carreras.nomada"
    ,triunvirato: "Ad6.Carreras.triunvirato"
    ,voluntario: "Ad6.Carreras.voluntario"
}

Ad6.TenienteElemento = 
{
     piloto: "Ad6.TenienteElemento.piloto"
    ,oficial: "Ad6.TenienteElemento.oficial"
    ,tecnico: "Ad6.TenienteElemento.tecnico"
    ,interprete: "Ad6.TenienteElemento.interprete"
    ,espia: "Ad6.TenienteElemento.espia"
    ,marine: "Ad6.TenienteElemento.marine"
    ,mercenario: "Ad6.TenienteElemento.mercenario"
    ,nomada: "Ad6.TenienteElemento.nomada"
    ,triunvirato: "Ad6.TenienteElemento.triunvirato"
    ,voluntario: "Ad6.TenienteElemento.voluntario"
}


// define las especialidades y elementos dentro de cada carrera
// también se anota qué se añade para un futuro charactermancer
// como son clases adicionales, no de dataset de clases actores
// no debería ser un culo cambiarlas. o añadir otras cosas
// ahora esto no funciona, sólo toma el nombre, por ahora
Ad6.Especialidades = 
{
    piloto: {
        as: {
             nombre: "Ad6.Especialidades.Piloto.as"
            ,rango: "Ad6.Rangos.r1"
            ,nombreRango: "Ad6.Etiquetas.cabo"
            //,talento: "Ad6.Talentos.Carrera.disparoCronometrado"
        }
       ,liderEscuadron: 
       {
             nombre:"Ad6.Especialidades.Piloto.liderEscuadron"
            ,rango: "Ad6.Rangos.r2"
           // ,nombreRango: "Ad6.Etiquetas.sargento"
            //,talento: "Ad6.Talentos.Carrera.cubroTuEspalda" 
       }
       ,ala: 
       {
             nombre:"Ad6.Especialidades.Piloto.ala"
            ,rango: "Ad6.Rangos.r1"
          //  ,nombreRango: "Ad6.Etiquetas.cabo"
            //,talento: "Ad6.Talentos.Carrera.ordenesCruciales" 
       }
       ,reconocimiento: 
       {
             nombre:"Ad6.Especialidades.Piloto.reconocimiento"
            ,rango: "Ad6.Rangos.r1"
           // ,nombreRango: "Ad6.Etiquetas.cabo"
            //,talento: "Ad6.Talentos.Carrera.awacs" 
       }
       ,senuelo: 
        {
             nombre:"Ad6.Especialidades.Piloto.senuelo"
            ,rango: "Ad6.Rangos.r1"
          //  ,nombreRango: "Ad6.Etiquetas.cabo"
        }
    }
    ,oficial:{
        ejemplar:
        {
            nombre:"Ad6.Especialidades.Oficial.ejemplar"
            ,rango:"Ad6.Rangos.r3"
        }
        ,mariscal:
        {
            nombre:"Ad6.Especialidades.Oficial.mariscal"
            ,rango:"Ad6.Rangos.r3"
        }
        ,coordinador:
        {
            nombre:"Ad6.Especialidades.Oficial.coordinador"
            ,rango:"Ad6.Rangos.r3"
        }
        ,logistica: 
        {
            nombre:"Ad6.Especialidades.Oficial.logistica"
            ,rango:"Ad6.Rangos.r3"
        }
        ,cortesano: 
        {
            nombre:"Ad6.Especialidades.Oficial.cortesano"
            ,rango:"Ad6.Rangos.r3"
        }
    }
    ,tecnico:{
        doctor:
        {
            nombre:"Ad6.Especialidades.Tecnico.doctor"
            ,rango:"Ad6.Rangos.r3"
        }
        ,ingeniero:
        {
            nombre:"Ad6.Especialidades.Tecnico.ingeniero"
            ,rango:"Ad6.Rangos.r1"
        }
        ,cientifico:
        {
            nombre:"Ad6.Especialidades.Tecnico.cientifico"
            ,rango:"Ad6.Rangos.r3"
        }
        ,chatarrero: 
        {
            nombre:"Ad6.Especialidades.Tecnico.chatarrero"
            ,rango:"Ad6.Rangos.r0"
        }
        ,criptologo: 
        {
            nombre:"Ad6.Especialidades.Tecnico.criptologo"
            ,rango:"Ad6.Rangos.r3"
        }
        ,antropologo: 
        {
            nombre:"Ad6.Especialidades.Tecnico.antropologo"
            ,rango:"Ad6.Rangos.r1"
        }      
    }
    ,interprete:
    {
        interprete:
        {
            nombre:"Ad6.Especialidades.Interprete.interprete"
            ,rango:"Ad6.Rangos.r0"
            ,fama: "Ad6.Famas.f1"
            ,fortuna: "Ad6.Fortunas.w1"
        }
        ,artesano:
        {
            nombre:"Ad6.Especialidades.Interprete.artesano"
            ,rango:"Ad6.Rangos.r0"
            ,fama: "Ad6.Famas.f1"
            ,fortuna: "Ad6.Fortunas.w1"
        }
        ,campeon:
        {
            nombre:"Ad6.Especialidades.Interprete.campeon"
            ,rango:"Ad6.Rangos.r0"
            ,fama: "Ad6.Famas.f1"
            ,fortuna: "Ad6.Fortunas.w1"
        }
    }
    ,espia:
    {
        sombra:
        {
            nombre:"Ad6.Especialidades.Espia.sombra"
            ,rango:"Ad6.Rangos.r2"
        }
        ,aPlenaVista:
        {
            nombre:"Ad6.Especialidades.Espia.aPlenaVista"
            ,rango:"Ad6.Rangos.r2"

        }
        ,imitador:
        {
            nombre:"Ad6.Especialidades.Espia.imitador"
            ,rango:"Ad6.Rangos.r2"
        }
        ,proveedorInformacion:
        {
            nombre:"Ad6.Especialidades.Espia.proveedorInformacion"
            ,rango:"Ad6.Rangos.r2"
        }
    }
    ,marine:
    {
        loboSolitario:
        {
            nombre:"Ad6.Especialidades.Marine.loboSolitario"
            ,rango: "Ad6.Rangos.r1"
        }
        ,asalto:
        {
            nombre:"Ad6.Especialidades.Marine.asalto"
            ,rango: "Ad6.Rangos.r1"
        }
        ,supresor:
        {
            nombre:"Ad6.Especialidades.Marine.supresor"
            ,rango: "Ad6.Rangos.r1"
        }
        ,explorador:
        {
            nombre:"Ad6.Especialidades.Marine.explorador"
            ,rango: "Ad6.Rangos.r1"
        }
        ,destructor:
        {
            nombre:"Ad6.Especialidades.Marine.destructor"
            ,rango: "Ad6.Rangos.r1"
        }        
    }
    ,voluntario:
    {

    }
    ,nomada:
    {
        explorador:
        {
            nombre:"Ad6.Especialidades.Nomada.explorador"
            ,rango: "Ad6.Rangos.r1"
        }   
        ,acechador:
        {
            nombre:"Ad6.Especialidades.Nomada.acechador"
            ,rango: "Ad6.Rangos.r1"
        }   
        ,comerciante:
        {
            nombre:"Ad6.Especialidades.Nomada.comerciante"
            ,rango: "Ad6.Rangos.r1"
        }  
    }
    ,triunvirato:
    {
        custodio:
        {
            nombre:"Ad6.Especialidades.Triunvirato.custodio"
            ,rango: "Ad6.Rangos.r2"
        }   
        ,musico:
        {
            nombre:"Ad6.Especialidades.Triunvirato.musico"
            ,rango: "Ad6.Rangos.r2"
            ,fama: "Ad6.Famas.f1"
        }   
        ,soldado:
        {
            nombre:"Ad6.Especialidades.Triunvirato.soldado"
            ,rango: "Ad6.Rangos.r2"
        }  
    }
    ,mercenario:
    {
        consultor:
        {
            nombre:"Ad6.Especialidades.Mercenario.consultor"
        }
        ,perroGuardian:
        {
            nombre:"Ad6.Especialidades.Mercenario.perroGuardian"
        }
        ,incursor:
        {
            nombre:"Ad6.Especialidades.Mercenario.incursor"
        }
    }
}


Ad6.Rangos = {
     r0: "[R0]"
    ,r1: "[R1]"
    ,r2: "[R2]"
    ,r3: "[R3]"
    ,r4: "[R4]"
    ,r5: "[R5]"
    ,r6: "[R6]"
}

Ad6.Famas = {
    f0: ""
   ,f1: "[F1]"
   ,f2: "[F2]"
   ,f3: "[F3]"
   ,f4: "[F4]"
}

Ad6.Fortunas = {
    w0: ""
   ,w1: "[W1]"
   ,w2: "[W2]"
   ,w3: "[W3]"
   ,w4: "[W4]"
   ,w5: "[W5]"
   ,w6: "[W6]"
}

Ad6.TipoTripulacion={
     nada: "Ad6.TipoTripulacion.nada"
    ,estandar:"Ad6.TipoTripulacion.estandar"
    ,experimentada: "Ad6.TipoTripulacion.experimentada"
}
Ad6.RolNave=
{
    destructor: "Ad6.RolNave.destructor"
    ,portaaviones: "Ad6.RolNave.portaaviones"
    ,comando: "Ad6.RolNave.comando"
    ,soporte: "Ad6.RolNave.soporte"
    ,acorazado: "Ad6.RolNave.acorazado"
    ,fortaleza: "Ad6.RolNave.fortaleza"
}

Ad6.Naves={nada:{
     destructor: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    ,portaaviones: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    ,comando: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    ,soporte: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    ,acorazado: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    ,fortaleza: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
}}

Ad6.Naves.estandar={
     destructor: { asistir: 2, observar: 2, ocultar:3, atacar:4, defender:3, redirigir:2, interactuar:1, inhibir:1 }
    ,portaaviones: { asistir: 3, observar: 2, ocultar:1, atacar:3, defender:1, redirigir:4, interactuar:2, inhibir:2 }
    ,comando: { asistir: 4, observar: 3, ocultar:2, atacar:2, defender:3, redirigir:2, interactuar:1, inhibir:1 }
    ,soporte: { asistir: 3, observar: 3, ocultar:2, atacar:1, defender:2, redirigir:1, interactuar:4, inhibir:3 }
    ,acorazado: { asistir: 2, observar: 2, ocultar:1, atacar:3, defender:4, redirigir:3, interactuar:1, inhibir:2 }
    ,fortaleza: { asistir: 2, observar: 2, ocultar:1, atacar:4, defender:3, redirigir:3, interactuar:3, inhibir:2 }
}


Ad6.Naves.experimentada={
     destructor: { asistir: 3, observar: 3, ocultar:4, atacar:5, defender:4, redirigir:3, interactuar:2, inhibir:2 }
    ,portaaviones: { asistir: 4, observar: 3, ocultar:2, atacar:4, defender:2, redirigir:5, interactuar:3, inhibir:3 }
    ,comando: { asistir: 5, observar: 4, ocultar:3, atacar:3, defender:4, redirigir:3, interactuar:2, inhibir:2 }
    ,soporte: { asistir: 4, observar: 4, ocultar:3, atacar:2, defender:3, redirigir:2, interactuar:5, inhibir:4 }
    ,acorazado: { asistir: 3, observar: 3, ocultar:2, atacar:4, defender:5, redirigir:4, interactuar:2, inhibir:3 }
    ,fortaleza: { asistir: 3, observar: 3, ocultar:2, atacar:5, defender:4, redirigir:4, interactuar:4, inhibir:3 }
}

Ad6.Tenientes={nada:{
    piloto: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    ,oficial: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    ,tecnico: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    ,interprete: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    ,espia: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    ,marine: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    ,mercenario: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    ,nomada: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    ,triunvirato: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    ,voluntario: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
    }
}

Ad6.Tenientes.menor={
    piloto: { asistir: 2, observar: 2, ocultar:1, atacar:3, defender:2, redirigir:3, interactuar:1, inhibir:1 }
    ,oficial: { asistir: 3, observar: 2, ocultar:1, atacar:1, defender:2, redirigir:2, interactuar:1, inhibir:3 }
    ,marine: { asistir: 2, observar: 2, ocultar:1, atacar:2, defender:3, redirigir:1, interactuar:1, inhibir:2 }
    ,tecnico: { asistir: 2, observar: 2, ocultar:1, atacar:1, defender:2, redirigir:2, interactuar:3, inhibir:3 }
    ,espia: { asistir: 1, observar: 2, ocultar:3, atacar:2, defender:1, redirigir:3, interactuar:2, inhibir:1 }
    ,interprete: { asistir: 2, observar: 2, ocultar:2, atacar:2, defender:2, redirigir:2, interactuar:2, inhibir:2 }
    ,voluntario: { asistir: 2, observar: 2, ocultar:2, atacar:2, defender:2, redirigir:2, interactuar:2, inhibir:2 }
    ,triunvirato: { asistir: 3, observar: 2, ocultar:1, atacar:2, defender:2, redirigir:3, interactuar:1, inhibir:1 }
    ,mercenario: { asistir: 2, observar: 2, ocultar:1, atacar:3, defender:3, redirigir:1, interactuar:1, inhibir:2 }
    ,nomada: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
}
Ad6.Tenientes.importante={
    piloto: { asistir: 3, observar: 3, ocultar:2, atacar:4, defender:3, redirigir:4, interactuar:2, inhibir:2 }
    ,oficial: { asistir: 4, observar: 3, ocultar:2, atacar:2, defender:3, redirigir:3, interactuar:2, inhibir:4 }
    ,marine: { asistir: 3, observar: 3, ocultar:2, atacar:3, defender:4, redirigir:2, interactuar:2, inhibir:3 }
    ,tecnico: { asistir: 3, observar: 3, ocultar:2, atacar:2, defender:3, redirigir:3, interactuar:4, inhibir:4 }
    ,espia: { asistir: 2, observar: 3, ocultar:4, atacar:3, defender:2, redirigir:4, interactuar:3, inhibir:2 }
    ,interprete: { asistir: 3, observar: 3, ocultar:3, atacar:3, defender:3, redirigir:3, interactuar:3, inhibir:3 }
    ,voluntario: { asistir: 3, observar: 3, ocultar:3, atacar:3, defender:3, redirigir:3, interactuar:3, inhibir:3 }
    ,triunvirato: { asistir: 4, observar: 3, ocultar:2, atacar:3, defender:3, redirigir:4, interactuar:2, inhibir:2 }
    ,mercenario: { asistir: 3, observar: 3, ocultar:2, atacar:4, defender:4, redirigir:2, interactuar:2, inhibir:3 }
    ,nomada: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
}
Ad6.Tenientes.ultra={
    piloto: { asistir: 4, observar: 4, ocultar:3, atacar:5, defender:4, redirigir:5, interactuar:3, inhibir:3 }
    ,oficial: { asistir: 5, observar: 4, ocultar:3, atacar:3, defender:4, redirigir:4, interactuar:3, inhibir:5 }
    ,marine: { asistir: 4, observar: 4, ocultar:3, atacar:4, defender:5, redirigir:3, interactuar:3, inhibir:4 }
    ,tecnico: { asistir: 4, observar: 4, ocultar:3, atacar:3, defender:4, redirigir:4, interactuar:5, inhibir:5 }
    ,espia: { asistir: 3, observar: 4, ocultar:5, atacar:4, defender:3, redirigir:5, interactuar:4, inhibir:3 }
    ,interprete: { asistir: 4, observar: 4, ocultar:4, atacar:4, defender:4, redirigir:4, interactuar:4, inhibir:4 }
    ,voluntario: { asistir: 4, observar: 4, ocultar:4, atacar:4, defender:4, redirigir:4, interactuar:4, inhibir:4 }
    ,triunvirato: { asistir: 5, observar: 4, ocultar:3, atacar:4, defender:4, redirigir:5, interactuar:3, inhibir:3 }
    ,mercenario: { asistir: 4, observar: 4, ocultar:3, atacar:5, defender:5, redirigir:3, interactuar:3, inhibir:4 }
    ,nomada: { asistir: 0, observar: 0, ocultar:0, atacar:0, defender:0, redirigir:0, interactuar:0, inhibir:0 }
}

Ad6.Escalas =
{
     L : "Ad6.Escalas.L"
    ,M : "Ad6.Escalas.M"
    ,N : "Ad6.Escalas.N"
}
/*
ad6.fatigues = {
     none: ""
    ,fatigue: "F"
    ,drama: "D"
}

ad6.scaleClasses =
{
     light : "ad6.scaleClass.light"
    ,mecha : "ad6.scaleClass.mecha"
    ,naval : "ad6.scaleClass.naval"
}

ad6.vehicleTypes = 
{
     main: "ad6.vehicleType.main"
    ,lieutenant: "ad6.vehicleType.lieutenant"
    ,swarm: "ad6.vehicleType.swarm"
}

ad6.frameworks =
{
    basic: "ad6.framework.basic"
    ,complex: "ad6.framework.complex"
}
*/