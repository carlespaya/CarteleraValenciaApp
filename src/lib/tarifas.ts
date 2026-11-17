import type { Tarifas } from "@/types/tarifas";

export const tarifas: Tarifas = {
  "Cines Lys": {
    laboral: {
      general: 10,
      web: 9,
      reducida: 7.5,
    },
    miercoles: {
      "Miercoles al Cine": 6,
    },
    finDeSemana: {
      general: 10,
      reducida: 9,
    },
  },
  "Kinépolis Valencia": {
    laboral: {
      general: 11.2,
      reducida: 9.2,
      matinal: {
        general: 11.2,
        reducida: 9.2,
      },
    },
    miercoles: {
      "Miercoles al Cine": 7.8,
    },
    imax: {
      general: 13.9,
      reducida: 12.0,
      suplemento3D: 1.0,
      suplementoVIP: 2.0,
    },
    "4dx": {
      general: 15.9,
      reducida: 14.0,
      suplemento3D: 1.0,
    },
  },
  Ocine: {
    laboral: {
      general: 10.9,
      mayores65: 8.6,
      menores14: 9.1,
      carnetJoven: 9.1,
      estudiante: 9.1,
      familia: 9.1,
    },
    miercoles: {
      general: 7.7,
      jubilados: 7,
    },
    finDeSemana: {
      general: 11.7,
      mayores65: 9.9,
      menores14: 9.9,
      carnetJoven: 9.9,
      estudiante: 9.9,
      familia: 9.9,
    },
    matinal: {
      general: 7.7,
    },
    suplementos: {
      atmos: 1.0,
      "3d": 2.0,
    },
  },
  "ABC Gandía": {
    laboral: {
      general: 6.45,
      mayores65: 6.45,
      reducida: 6.45,
      socios: 5.0,
    },
    miercoles: {
      general: 5.2,
    },
    finDeSemana: {
      general: 6.45,
      reducida: 6.45,
      mayores65: 6.45,
    },
    domingoMatinal: {
      general: 3.95,
    },
  },
  "ABC Saler": {
    laboral: {
      general: 9.8,
      generalAntes17: 7.2,
      mayores65: 7.2,
      reducida: 7.8,
      socios: 7.8,
    },
    miercoles: {
      general: 6.6,
    },
    finDeSemana: {
      general: 10.4,
      reducida: 9.2,
      mayores65: 9.1,
      socios: 9.0,
    },
    domingoMatinal: {
      general: 5.3,
    },
  },
  "ABC Park": {
    laboral: {
      general: 8.9,
      reducida: 7.2,
      mayores65: 7.1,
      socios: 6.0,
    },
    miercoles: {
      general: 5.6,
    },
    finDeSemana: {
      general: 8.9,
      reducida: 8.2,
      mayores65: 8.2,
      socios: 7.0,
    },
    domingoMatinal: {
      general: 4.5,
    },
    especialSenior: {
      martes: 4.0,
    },
  },
  "ABC Gran Turia": {
    laboral: {
      general: 8.1,
      generalAntes17: 6.6,
      mayores65: 6.7,
      reducida: 7.0,
      socios: 6.8,
    },
    miercoles: {
      general: 5.4,
    },
    finDeSemana: {
      general: 9.3,
      reducida: 7.2,
      mayores65: 7.2,
      socios: 7.2,
    },
    domingoMatinal: {
      general: 4.4,
    },
    especialSenior: {
      martes: 4.0,
    },
  },
  "Cines MN4": {
    laboral: {
      general: 8.4,
      reducida: 7.3,
      desempleados: 5.9,
      socios: 6.4,
    },
    miercoles: {
      general: 6.0,
      reducida: 7.3,
      desempleados: 5.9,
    },
    jueves: {
      socios: 6.0,
    },
    finDeSemana: {
      general: 9.4,
      reducida: 8.3,
      desempleados: 5.9,
      primeraSesion: 6.5,
    },
    suplementos: {
      "3d": 1.0,
    },
  },
  "Cines Babel": {
    laboral: {
      general: 7.6,
      reducida: 6.8,
      menores12: 5.5,
    },
    miercoles: {
      general: 4.9,
    },
    finDeSemana: {
      general: 8.3,
      reducida: 7.6,
      menores12: 5.5,
    },
    promociones: {
      menores30Nocturna: 5.5,
    },
  },
  Alucine: {
    laboral: {
      general: 5.5,
    },
    miercoles: {
      general: 5.0,
    },
    viernes: {
      general: 6.5,
      reducida: 5.5,
    },
    finDeSemana: {
      general: 7.0,
      reducida: 5.5,
    },
  },
  "Cines Axion Premium Gandia": {
    laboral: {
      general: 7.95,
      reducida: 6.95,
      Web: 6.45,
    },
    miercoles: {
      general: 5.95,
    },
    finDeSemana: {
      general: 7.95,
      reducida: 6.95,
      web: 6.45,
    },
  },
  "Yelmo Cines Campanar": {
    laboral: {
      general: 8.6,
      promocional: 5.9,
    },
    lunesMiercoles: {
      general: 6.8,
    },
    martesSenior: {
      mayores65: 2.0,
    },
    finDeSemana: {
      general: 8.6,
      promocional: 5.9,
    },
    suplementos: {
      "3d": 2.5,
    },
  },
};
