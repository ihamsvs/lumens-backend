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
import { TravelGuideResponseDto } from './dto/cinematic-guide.dto';
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
    [REGLA ESTRICTA ANTI-CLICHÉ - MODO LOCATION SCOUT]
    Está terminantemente prohibido sugerir atracciones turísticas obvias o genéricas (ej: Torre Eiffel, Times Square, Coliseo Romano). Tu objetivo es revelar el "B-Side" de la ciudad. Sugiere callejones ocultos, joyas arquitectónicas subestimadas, miradores poco conocidos y ángulos inusuales que los turistas normales ignoran, pero que un director de fotografía amaría.

    ROLE: Guía de Viajes Experto & Location Scout de Cine.
    TASK: Crea una guía para "${city}" enfocada en creadores de contenido que aman el cine y la fotografía.
    INSTRUCCIÓN: Genera EXACTAMENTE 4 locaciones diferentes.
    FORMATO: Devuelve ÚNICAMENTE un objeto JSON válido, sin formato Markdown, sin explicaciones extra.

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
          "description": "Descripción turística y por qué es visualmente impactante.",
          "best_time_to_visit": "Mejor hora (ej: Atardecer).",
          "visitor_tip": "Tip práctico de acceso o seguridad.",
          "movie_connection": "Película rodada aquí o vibra cinematográfica similar.",
          "image_search_term": "Término en INGLÉS de 2 a 3 palabras para buscar una foto de este lugar (Ej: 'Brussels Art Nouveau', 'Tokyo neon alley').",
          "camera_settings": {
            "pro": "Ajustes para cámaras DSLR/Mirrorless (Ej: ISO 100, f/1.8, 1/60s, lente 50mm).",
            "mobile": "Ajustes para smartphone/TikTok (Ej: Lente 0.5x ultra gran angular, bajar la exposición -1, bloquear enfoque, grabar en 4K 60fps)."
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

    // 1. Creamos la "memoria" de imágenes usadas en esta petición
    const usedImages = new Set<string>();

    // 2. Buscamos la imagen principal
    const cityQuery = `${guide.destination} travel city`;
    guide.destination_image_url = await this.fetchPixabayImage(
      cityQuery,
      usedImages,
    );
    if (guide.destination_image_url)
      usedImages.add(guide.destination_image_url);

    // 3. ATENCIÓN: Cambiamos Promise.all por un bucle for...of
    // Esto es vital para que la "memoria" se actualice una por una y no haya choques
    for (const spot of guide.spots) {
      let imageUrl: string | undefined;

      if (spot.image_search_term) {
        imageUrl = await this.fetchPixabayImage(
          spot.image_search_term,
          usedImages,
        );
      }

      if (!imageUrl) {
        const cleanName = spot.name.split(':')[0].split('-')[0].trim();
        imageUrl = await this.fetchPixabayImage(
          `${cleanName} ${spot.city}`,
          usedImages,
        );
      }

      if (!imageUrl) {
        imageUrl = await this.fetchPixabayImage(
          `${spot.category || 'architecture'} ${spot.city}`,
          usedImages,
        );
      }

      if (!imageUrl) {
        imageUrl =
          'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2021&auto=format&fit=crop';
      }

      spot.image_url = imageUrl;
      // Guardamos la imagen en la memoria para no repetirla en el siguiente spot
      if (imageUrl) usedImages.add(imageUrl);
    }

    return guide;
  }

  private async fetchPixabayImage(
    query: string,
    usedImages: Set<string>,
  ): Promise<string | undefined> {
    try {
      const encodedQuery = encodeURIComponent(query);
      // Pedimos 10 resultados en vez de 3 para tener más opciones de dónde elegir
      const url = `https://pixabay.com/api/?key=${this.pixabayKey}&q=${encodedQuery}&image_type=photo&orientation=horizontal&per_page=10&safesearch=true`;

      const res = await axios.get(url, { timeout: 5000 });

      if (res.data.hits && res.data.hits.length > 0) {
        // Magia: Buscamos la primera imagen de la lista que NO hayamos usado todavía
        const uniqueHit = res.data.hits.find(
          (hit) => !usedImages.has(hit.webformatURL),
        );

        // Si encontramos una nueva, la devolvemos.  repetimos la primera.
        return uniqueHit
          ? uniqueHit.webformatURL
          : res.data.hits[0].webformatURL;
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
