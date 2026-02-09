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

  constructor(private configService: ConfigService) {
    // Inicializar Gemini
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY') ?? '';
    this.aiclient = new GoogleGenAI({ apiKey: geminiKey });
    // Inicializar Supabase
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL') ?? '';
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY') ?? '';
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
    this.logger.log(`Buscando fotos en Unsplash para ${searchTem}`);
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
    if (!this.unsplashKey) return guide;

    // 1. FOTO DE PORTADA (General)
    const cityQuery = `${guide.destination} travel aesthetic`;
    guide.destination_image_url = await this.fetchUnsplashImage(cityQuery);

    // 2. FOTOS DE LUGARES (Estrategia "Cascada")
    const spotPromises = guide.spots.map(async (spot): Promise<SpotDto> => {
      // LIMPIEZA DEL NOMBRE (Para ayudar a la búsqueda)
      // "Kinkaku-ji (Golden Pavilion)" -> "Kinkaku-ji"
      const cleanName = spot.name.split('(')[0].split('-')[0].trim();

      // INTENTO 1: Nombre + Ciudad (Lo ideal)
      // Ej: "Kinkaku-ji Kyoto"
      const query = `${cleanName} ${spot.city}`;
      let imageUrl = await this.fetchUnsplashImage(query);

      // INTENTO 2: Solo Nombre (Si falla el 1)
      // Ej: "Kinkaku-ji" (A veces la ciudad confunde si la foto no tiene ese tag)
      if (!imageUrl) {
        imageUrl = await this.fetchUnsplashImage(cleanName);
      }

      // INTENTO 3: Categoría + Ciudad (LA RED DE SEGURIDAD)
      // Si no encontramos el lugar específico, buscamos algo del mismo "estilo".
      // Ej: "Temple Kyoto" o "Shopping Street Osaka"
      // Esto asegura que casi nunca devuelva vacío.
      if (!imageUrl) {
        // Usamos la categoría que nos dio Gemini o 'Landmark' por defecto
        const categoryQuery = `${spot.category || 'Tourist attraction'} ${spot.city}`;
        console.log(
          `   ⚠️ Usando fallback genérico para ${cleanName}: "${categoryQuery}"`,
        );
        imageUrl = await this.fetchUnsplashImage(categoryQuery);
      }

      // Si falló todo (rarísimo), entonces sí queda undefined (icono cámara)
      spot.image_url = imageUrl;
      return spot;
    });

    guide.spots = await Promise.all(spotPromises);
    return guide;
  }

  // Mantenemos el fetch simple que arreglamos antes (sin landscape para tener más opciones)
  private async fetchUnsplashImage(query: string): Promise<string | undefined> {
    try {
      const url = `https://api.unsplash.com/search/photos?page=1&per_page=1&query=${encodeURIComponent(query)}`;
      const res = await axios.get(url, {
        headers: { Authorization: `Client-ID ${this.unsplashKey}` },
        timeout: 4000,
      });
      return res.data.results[0]?.urls?.regular || undefined;
    } catch (error) {
      return undefined;
    }
  }
}
