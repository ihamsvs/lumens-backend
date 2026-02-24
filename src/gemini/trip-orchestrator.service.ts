import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';
import { GeminiService } from './gemini.service';
import { VibeRouterService } from './vibe-router.service';
import { TravelGuideResponseDto, SpotDto } from './dto/cinematic-guide.dto';
@Injectable()
export class TripOrchestratorService {
  private supabase: SupabaseClient<any, any, any>;
  private readonly logger = new Logger(TripOrchestratorService.name);
  private pixabayKey: string;
  constructor(
    private configService: ConfigService,
    private readonly geminiService: GeminiService,
    private readonly vibeRouter: VibeRouterService,
  ) {
    // 1. Inicializar Supabase
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL') ?? '';
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY') ?? '';

    if (!supabaseKey || !supabaseUrl) {
      this.logger.warn('Supabase no está configurado. La caché no funcionará');
    }
    this.supabase = createClient(supabaseUrl, supabaseKey);
    // 2. Inicializar Pixabay
    this.pixabayKey = this.configService.get<string>('PIXABAY_API_KEY') ?? '';
  }
  /**
   * FLUJO PRINCIPAL (Orquestación)
   */
  async planCinematicTrip(userInput: string): Promise<TravelGuideResponseDto> {
    this.logger.log(
      `Iniciando planificación de viaje para input: "${userInput}"`,
    );

    // PASO 1: Descifrar la ciudad usando el router
    const targetCity = await this.vibeRouter.extractCity(userInput);
    const searchTerm = targetCity.trim().toLowerCase();
    // PASO 2: Revisar Caché (Supabase)
    try {
      const { data: cachedGuide, error } = await this.supabase
        .from('guides')
        .select('data')
        .eq('search_term', searchTerm)
        .single();

      if (cachedGuide && !error) {
        this.logger.log(`HIT de caché: Sirviendo ${targetCity} desde Supabase`);
        return cachedGuide.data as TravelGuideResponseDto;
      }
    } catch (dbError) {
      this.logger.error(
        'Error leyendo Supabase, continuando con Gemini:',
        dbError.message,
      );
    }
    // PASO 3: Generar la guía pesada si no hay caché
    this.logger.log(
      `Miss de caché: Solicitando guía de ${targetCity} a Gemini`,
    );
    let guide = await this.buildGuideFromGemini(targetCity);

    // PASO 4: Enriquecer con imágenes de Pixabay
    this.logger.log(`Buscando fotos en Pixabay para ${targetCity}`);
    guide = await this.enrichWithImages(guide);
    // PASO 5: Guardar el resultado final en caché para el futuro
    await this.saveToCache(searchTerm, guide);
    return guide;
  }
  /**
   * Genera el JSON completo delegando la llamada al GeminiService
   */
  private async buildGuideFromGemini(
    city: string,
  ): Promise<TravelGuideResponseDto> {
    const prompt = `
          ROLE: Guía de Viajes Experto & Location Scout de Cine.
          TASK: Crea una guía para "${city}" enfocada en turistas que aman el cine y la fotografía.

          ESTRUCTURA JSON OBLIGATORIA:
          {
            "destination": "${city}",
            "description_intro": "Breve resumen inspirador.",
            "best_month_to_visit": "Mejor época y por qué.",
            "spots": [
              {
                "name": "Nombre Lugar",
                "country": "País",
                "city": "Ciudad",
                "category": "Historia/Naturaleza/Urbano",
                "coordinates": { "latitude": 0.0, "longitude": 0.0 },
                "description": "Descripción turística.",
                "best_time_to_visit": "Mejor hora (ej: Atardecer).",
                "visitor_tip": "Tip práctico.",
                "movie_connection": "Película rodada aquí (ej: Inception).",
                "camera_settings": {
                  "iso": "ISO 100",
                  "shutter_speed": "1/500",
                  "aperture": "f/8",
                  "focal_length": "24mm",
                  "lens_recommendation": "Gran Angular"
                }
              }
            ]
          }
        `;
    try {
      // Llamamos a nuestro operador con el modelo y pidiendo JSON
      const rawText = await this.geminiService.generateContent(
        prompt,
        'gemini-2.5-flash',
        true,
      );
      return JSON.parse(rawText) as TravelGuideResponseDto;
    } catch (error) {
      this.logger.error(
        `Error parseando el JSON de Gemini para ${city}`,
        error,
      );
      throw new InternalServerErrorException(
        'No se pudo estructurar la guía del viaje.',
      );
    }
  }

  // --- LÓGICA DE INFRAESTRUCTURA (SUPABASE Y PIXABAY) ---
  private async saveToCache(term: string, data: TravelGuideResponseDto) {
    try {
      const { error } = await this.supabase.from('guides').insert({
        search_term: term,
        data: data,
      });
      if (error) throw error;
      this.logger.log(`Guardado en caché de Supabase exitosamente: ${term}`);
    } catch (error) {
      this.logger.error('Error al guardar en supabase', error);
    }
  }

  private async enrichWithImages(
    guide: TravelGuideResponseDto,
  ): Promise<TravelGuideResponseDto> {
    if (!this.pixabayKey) {
      this.logger.warn('Falta PIXABAY_API_KEY, no se buscarán imágenes');
      return guide;
    }

    const cityQuery = `${guide.destination} travel`;
    guide.destination_image_url = await this.fetchPixabayImage(cityQuery);
    const spotPromises = guide.spots.map(async (spot): Promise<SpotDto> => {
      const cleanName = spot.name.split('')[0].split('-')[0].trim();
      let imageUrl: string | undefined;
      imageUrl = await this.fetchPixabayImage(`${cleanName} ${spot.city}`);
      if (!imageUrl) imageUrl = await this.fetchPixabayImage(cleanName);
      if (!imageUrl)
        imageUrl = await this.fetchPixabayImage(
          `${spot.category || 'tourist'} ${spot.city}`,
        );
      if (!imageUrl)
        imageUrl =
          'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop';
      spot.image_url = imageUrl;
      return spot;
    });
    guide.spots = await Promise.all(spotPromises);
    return guide;
  }

  private async fetchPixabayImage(query: string): Promise<string | undefined> {
    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://pixabay.com/api/?key=${this.pixabayKey}&q=${encodedQuery}&image_type=photo&orientation=horizontal&per_page=3&safesearch=true`;
      const res = await axios.get(url, { timeout: 5000 });
      if (res.data.hits && res.data.hits.length > 0) {
        return res.data.hits[0].webformatURL;
      }
      return undefined;
    } catch (error) {
      this.logger.warn(
        `Error buscando en Pixabay para "${query}": ${error.message}`,
      );
      return undefined;
    }
  }
}
