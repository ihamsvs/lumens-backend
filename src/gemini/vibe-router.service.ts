import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from './gemini.service';
@Injectable()
export class VibeRouterService {
  private readonly logger = new Logger(VibeRouterService.name);

  // Inyectamos el servicio de gemini
  constructor(private readonly geminiService: GeminiService) {}
  /**
   * Toma el input del usuario (vibra o ciudad) y devuelve una ciudad real
   */
  async extractCity(userInput: string): Promise<string> {
    this.logger.log(`Analizando input del usuario: "${userInput}"`);

    // Formateo del input del usuario
    if (
      userInput.trim().split(' ').length <= 2 &&
      !userInput.toLocaleLowerCase().includes('vibra')
    ) {
      this.logger.log(
        `Input corto detectado. Asumiendo ciudad directa: ${userInput}`,
      );
      return userInput.trim();
    }
    // El prompt ( Ingeniería de Prompts estricta - Zero Shot)
    const prompt = `
          ROLE: Eres un Location Scout de cine experto en geografía.
          TASK: El usuario te dará una descripción de una "vibra", clima, estilo arquitectónico o película.
          Identifica la ÚNICA ciudad real del mundo que mejor encaje con esa descripción.

          REGLAS ESTRICTAS:
          1. Devuelve SOLAMENTE el nombre de la ciudad. NO INCLUYAS EL PAÍS. NADA MÁS.
          2. Cero explicaciones, cero saludos, cero comillas.
          3. Si el usuario ingresa una ciudad clara (ej: "Quiero ir a Madrid"), devuelve "Madrid".

          INPUT DEL USUARIO: "${userInput}"

          CIUDAD RESULTANTE:
        `;
    try {
      // Llamamos a Gemini usando el modelo rápido
      const rawResponse = await this.geminiService.generateContent(
        prompt,
        'gemini-2.5-flash',
        false,
      );

      // Limpiamos la respuesta
      const cleanCity = rawResponse.trim().replace(/\n/g, '');
      this.logger.log(`Vibra traducida a ciudad destino: ${cleanCity}`);
      return cleanCity;
    } catch (error) {
      this.logger.error('Error al enrutar la vibra, usando fallback', error);
      return userInput.trim();
    }
  }
}
