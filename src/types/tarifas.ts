export interface GrupoTarifas {
  general?: number;
  reducida?: number;
  mayores65?: number;
  menores14?: number;
  carnetJoven?: number;
  estudiante?: number;
  familia?: number;
  socios?: number;

  suplemento3D?: number;
  suplementoVIP?: number;
  atmos?: number;

  miercoles?: number;
  jueves?: number;

  [key: string]: number | GrupoTarifas | undefined;
}

export interface TarifasCine {
  laboral?: GrupoTarifas;
  lunesMiercoles?: GrupoTarifas;
  martesSenior?: GrupoTarifas;
  miercoles?: GrupoTarifas;
  jueves?: GrupoTarifas;
  viernes?: GrupoTarifas;
  finDeSemana?: GrupoTarifas;
  promociones?: GrupoTarifas;
  matinal?: GrupoTarifas;
  domingoMatinal?: GrupoTarifas;
  especialSenior?: GrupoTarifas;
  normal?: GrupoTarifas;
  imax?: GrupoTarifas;
  "4dx"?: GrupoTarifas;

  suplementos?: GrupoTarifas;
}

export type Tarifas = Record<string, TarifasCine>;
