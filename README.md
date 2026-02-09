# LUMENS API | Cinematic Travel Backend 🎥🌍

Este es el backend de **LUMENS**, una aplicación de planificación de viajes impulsada por Inteligencia Artificial. Esta API se encarga de generar itinerarios cinematográficos, buscar locaciones de rodaje, obtener imágenes de alta calidad y gestionar la caché de datos.

![NestJS](https://img.shields.io/badge/nestjs-%23E0234E.svg?style=for-the-badge&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=google&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Render](https://img.shields.io/badge/Render-%46E3B7.svg?style=for-the-badge&logo=render&logoColor=white)

## ✨ Características Principales

- **IA Generativa:** Integración con **Google Gemini** para crear guías de viaje detalladas, curiosidades de cine y configuraciones de cámara (ISO, apertura, lente).
- **Imágenes Contextuales:** Conexión con la **API de Unsplash** para enriquecer cada destino con fotos reales de alta calidad.
- **Sistema de Caché Inteligente:** Uso de **Supabase** para almacenar búsquedas previas, reduciendo costos de API y mejorando la velocidad de respuesta.
- **Resiliencia:** Manejo de errores, reintentos automáticos y fallbacks en caso de que las APIs externas fallen.
- **CORS Configurado:** Listo para aceptar peticiones desde cualquier frontend (configurable).

## 🛠️ Stack Tecnológico

- **Framework:** [NestJS](https://nestjs.com/) (Node.js)
- **Lenguaje:** TypeScript
- **Base de Datos:** Supabase (PostgreSQL)
- **Inteligencia Artificial:** Google Gemini Pro
- **Imágenes:** Unsplash Developers API
- **Despliegue:** Render
