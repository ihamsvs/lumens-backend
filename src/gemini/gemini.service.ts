import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { GenerateContentResponse, GoogleGenAI } from '@google/genai';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private aiClient: GoogleGenAI;
  constructor(private configService: ConfigService) {
    // Inicializar Gemini
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!geminiKey) {
      this.logger.warn('GEMINI_API_KEY no está configurado correctmente');
    }
    this.aiClient = new GoogleGenAI({ apiKey: geminiKey });
  }
  /**
   * @param prompt el texto o instrucción a procesar.
   * @param modelName el modelo a usar
   * @param expectJson si es true, fuerza el modelo a responder en formato JSON
   */
  async generateContent(
    prompt: string,
    modelName: string = 'gemini-2.5-flash',
    expectJson: boolean = false,
  ): Promise<string> {
    try {
      this.logger.debug(`Enviando prompt al modelo: ${modelName}...`);
      const response: GenerateContentResponse =
        await this.aiClient.models.generateContent({
          model: modelName,
          config: {
            responseMimeType: expectJson ? 'application/json' : 'text/plain',
            temperature: 0.5,
          },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
      const text = response.text || (expectJson ? '{}' : '');
      return text;
    } catch (error) {
      this.logger.error('Error comunicándose con Gemini API', error);
      throw new InternalServerErrorException(
        'Error al procesar la solicitud con IA',
      );
    }
  }
}
