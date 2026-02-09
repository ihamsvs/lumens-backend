export interface TravelGuide {
  destino: string;
  descripcion_general: string;
  clima_ideal: string;
  lugares_imperdibles: Array<{
    nombre: string;
    coordenadas: { lat: number; lng: number };
    categoria: 'Historia' | 'Naturaleza' | 'Urbano' | 'Aventura';
    descripcion: string;
    curiosidad: string;
    tip_fotografia: {
      mejor_angulo: string;
      mejor_momento: 'Amanecer' | 'Atardecer' | 'Noche';
      lente_sugerido: 'Gran Angular' | 'Retrato' | 'Teleobjetivo';
    };
  }>;
}
