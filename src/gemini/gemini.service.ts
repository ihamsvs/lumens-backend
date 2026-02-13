import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { TravelGuideResponseDto, SpotDto } from './dto/cinematic-guide.dto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';

@Injectable()
export class GeminiService {
  private aiclient: GoogleGenAI;
  private supabase: SupabaseClient<any, any, any>;
  private readonly logger = new Logger(GeminiService.name);
  private unsplashKey: string;
  private pixabayKey: string;

  constructor(private configService: ConfigService) {
    // Inicializar Gemini
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY') ?? '';
    this.aiclient = new GoogleGenAI({ apiKey: geminiKey });
    // Inicializar Supabase
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL') ?? '';
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY') ?? '';
    this.pixabayKey = this.configService.get<string>('PIXABAY_API_KEY') ?? '';
    console.log('DEBUG PIXABAY KEY:', this.pixabayKey);
    // Configurar unsplashKey
    this.unsplashKey =
      this.configService.get<string>('UNPLASH_ACCESS_KEY') ?? '';
    if (!supabaseKey || !supabaseUrl) {
      this.logger.warn('Supabase no está configurado. La caché no funcionará');
    }
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async generateCinematicGuide(
    cityRaw: string,
  ): Promise<TravelGuideResponseDto> {
    const searchTem = cityRaw.trim().toLowerCase();
    this.logger.log(`Buscando guía para: ${searchTem}`);
    // Estrategia CACHE-FIRST (Supabase)
    try {
      const { data: cachedGuide, error } = await this.supabase
        .from('guides')
        .select('data')
        .eq('search_term', searchTem)
        .single();
      if (cachedGuide && !error) {
        this.logger.log(`HIT de caché: Sirviendo ${searchTem} desde Supabase`);
        return cachedGuide.data as TravelGuideResponseDto;
      }
    } catch (dbError) {
      this.logger.error(
        'Error leyendo Supabase (continuando con Gemini Live):',
        dbError,
      );
    }
    // Si no hay caché, llamamos a Gemini Live
    this.logger.log(`Miss de caché: Solicitando ${searchTem} a Gemini Live`);
    let guide = await this.callGeminiAPI(cityRaw);
    // Traer imagenes
    this.logger.log(`Buscando fotos en Pixabay para ${searchTem}`);
    guide = await this.enrichWithImages(guide);

    // Guardar en caché
    await this.saveToCache(searchTem, guide);
    return guide;
  }
  private async callGeminiAPI(city: string): Promise<TravelGuideResponseDto> {
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
      const response: GenerateContentResponse =
        await this.aiclient.models.generateContent({
          model: 'gemini-2.5-flash',
          config: {
            responseMimeType: 'application/json',
            temperature: 0.5,
          },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
      const text = response.text || '{}';
      return JSON.parse(text) as TravelGuideResponseDto;
    } catch (error) {
      this.logger.error('Error en Gemini API', error);
      throw new InternalServerErrorException('No se pudo generar la guía');
    }
  }

  private async saveToCache(term: string, data: TravelGuideResponseDto) {
    try {
      const { error } = await this.supabase.from('guides').insert({
        search_term: term,
        data: data,
      });
      if (error) throw error;
      this.logger.log('Guardado en supabase');
    } catch (error) {
      this.logger.error('Error al guardar en supabase', error);
    }
  }

  private async enrichWithImages(
    guide: TravelGuideResponseDto,
  ): Promise<TravelGuideResponseDto> {
    if (!this.pixabayKey) {
      this.logger.warn('Falta PIXABAY_API_KEY, no se buscarán imágenes.');
      return guide;
    }

    // 1. FOTO DE PORTADA (General)
    // Pixabay funciona mejor con queries simples. "Tokio travel" en lugar de "Tokio aesthetic"
    const cityQuery = `${guide.destination} travel`;
    guide.destination_image_url = await this.fetchPixabayImage(cityQuery);

    // 2. FOTOS DE LUGARES
    const spotPromises = guide.spots.map(async (spot): Promise<SpotDto> => {
      // Limpieza del nombre igual que antes
      const cleanName = spot.name.split('(')[0].split('-')[0].trim();

      // Estrategia de búsqueda
      let imageUrl: string | undefined;

      // Intento 1: Nombre + Ciudad
      imageUrl = await this.fetchPixabayImage(`${cleanName} ${spot.city}`);

      // Intento 2: Solo Nombre
      if (!imageUrl) {
        imageUrl = await this.fetchPixabayImage(cleanName);
      }

      // Intento 3: Categoría + Ciudad (Fallback)
      if (!imageUrl) {
        const categoryQuery = `${spot.category || 'tourist attraction'} ${spot.city}`;
        imageUrl = await this.fetchPixabayImage(categoryQuery);
      }

      // Intento 4: Fallback genérico si todo falla (Imagen bonita de viaje)
      if (!imageUrl) {
        imageUrl =
          'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop';
      }

      spot.image_url = imageUrl;
      return spot;
    });

    guide.spots = await Promise.all(spotPromises);
    return guide;
  }

  // Mantenemos el fetch simple que arreglamos antes (sin landscape para tener más opciones)
  private async fetchPixabayImage(query: string): Promise<string | undefined> {
    try {
      // Pixabay requiere encoding específico y '+' para espacios
      const encodedQuery = encodeURIComponent(query);

      const url = `https://pixabay.com/api/?key=${this.pixabayKey}&q=${encodedQuery}&image_type=photo&orientation=horizontal&per_page=3&safesearch=true`;

      const res = await axios.get(url, { timeout: 5000 });

      // Verificamos si hay "hits" (resultados)
      if (res.data.hits && res.data.hits.length > 0) {
        // 'webformatURL' es un tamaño medio bueno para web (aprox 640px ancho)
        // 'largeImageURL' es Full HD. Usamos webformatURL para carga rápida, o large si prefieres calidad.
        return res.data.hits[0].webformatURL;
      }
      return undefined;
    } catch (error) {
      this.logger.error(
        `Error buscando en Pixabay para "${query}": ${error.message}`,
      );
      return undefined;
    }
  }
}
