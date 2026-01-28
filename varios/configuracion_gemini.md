# Configuración de Gemini para Moltbot

## Paso 1: Obtener API Key de Google Gemini

1. Ve a [Google AI Studio](https://aistudio.google.com/)
2. Inicia sesión con tu cuenta de Google
3. Haz clic en "Get API Key" o "Crear clave de API"
4. Copia la clave generada

## Paso 2: Configurar la API Key en Moltbot

Tienes dos opciones:

### Opción A: Variable de Entorno (Recomendado)

Crea un archivo `.env` en la raíz del proyecto:

```bash
# En la carpeta moltbot/
GEMINI_API_KEY=tu_clave_api_aqui
```

### Opción B: Configuración JSON

Edita o crea `~/.clawdbot/moltbot.json`:

```json
{
  "agent": {
    "model": "google/gemini-2.5-flash"
  }
}
```

## Paso 3: Iniciar el Gateway

```bash
# Desde la carpeta del proyecto
pnpm moltbot gateway
```

## Paso 4: Acceder a la Interfaz Web

Abre tu navegador en: http://localhost:18789

## Modelos Gemini Disponibles (Gratis)

- `google/gemini-2.5-pro` - Más potente
- `google/gemini-2.5-flash` - Más rápido (recomendado)
- `google/gemini-flash-lite` - Más ligero

## Verificar Configuración

```bash
pnpm moltbot doctor
```

Este comando verificará que todo esté correctamente configurado.
