import { Test, TestingModule } from '@nestjs/testing';
import { GeminiService } from './gemini.service';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';

// 1. Mock de la librería externa @google/genai
// Esto evita llamadas reales a la API y nos permite controlar la respuesta.
const mockGenerateContent = jest.fn();

jest.mock('@google/genai', () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    })),
  };
});

describe('GeminiService', () => {
  let service: GeminiService;
  let configService: ConfigService;

  // Datos de prueba (Mock Data) que simulan una respuesta perfecta de Gemini 3
  const mockCinematicResponse = {
    destination: 'Tokio',
    spots: [
      {
        name: 'Shibuya Crossing',
        country: 'Japón',
        city: 'Tokio',
        coordinates: { latitude: 35.6595, longitude: 139.7004 },
        movie_title: 'Lost in Translation',
        scene_description:
          'Charlotte caminando bajo la lluvia con paraguas transparente.',
        recreation_tip:
          'Usa velocidad lenta para capturar el movimiento de la gente.',
        camera_settings: {
          iso: '1600',
          shutter_speed: '1/30',
          aperture: 'f/2.0',
          focal_length: '50mm',
          color_profile: 'Neon Low Light',
        },
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('fake-api-key'), // Mock de variables de entorno
          },
        },
      ],
    }).compile();

    service = module.get<GeminiService>(GeminiService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateCinematicGuide', () => {
    it('debe retornar una guía cinematográfica estructurada cuando la API responde correctamente', async () => {
      // ARRANGEMENT (Preparación)
      // Simulamos que Gemini devuelve un JSON válido dentro de 'text'
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify(mockCinematicResponse),
      });

      // ACT (Ejecución)
      const result = await service.generateCinematicGuide('Tokio');

      // ASSERTION (Verificación)
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

      // Verificamos que estamos llamando al modelo correcto (Gemini 3)
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.0-pro',
        }),
      );

      // Verificamos que el resultado es idéntico a nuestro objeto esperado
      expect(result).toEqual(mockCinematicResponse);
      expect(result.spots[0].movie_title).toBe('Lost in Translation');
    });

    it('debe lanzar InternalServerErrorException si la API de Gemini falla', async () => {
      // ARRANGEMENT
      mockGenerateContent.mockRejectedValue(new Error('API Quota Exceeded'));

      // ACT & ASSERT
      await expect(service.generateCinematicGuide('Tokio')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('debe manejar respuestas vacías o JSON inválido gracefully', async () => {
      // Simulamos caso borde donde la IA devuelve algo roto
      mockGenerateContent.mockResolvedValue({
        text: 'Invalid JSON {',
      });

      // Al fallar el JSON.parse, el servicio debería capturar el error y lanzar InternalServerErrorException
      await expect(service.generateCinematicGuide('Tokio')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
