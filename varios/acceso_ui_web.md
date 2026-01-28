# ✅ Interfaz Web Habilitada (Modo Desarrollo)

## URLs de Acceso

### Interfaz Web (Control UI)

🌐 **http://localhost:5173/**

### Gateway (Backend)

🔌 **ws://127.0.0.1:18789**

## Estado Actual

✅ **Vite Dev Server**: Corriendo en puerto 5173
✅ **Gateway**: Corriendo en puerto 18789
✅ **Modelo IA**: Google Gemini 2.5 Flash

## Cómo Usar la Interfaz Web

1. **Abrir el navegador** en: http://localhost:5173/

2. **Configurar la conexión** (si es necesario):
   - Gateway URL: `ws://127.0.0.1:18789`
   - Token: `local-dev-token` (si lo solicita)

3. **Empezar a chatear** con el agente directamente desde el navegador

## Servicios Corriendo

```
Terminal 1: Gateway
Comando: node scripts/run-node.mjs gateway
Puerto: 18789
Estado: ✅ Activo

Terminal 2: UI Dev Server
Comando: pnpm --filter moltbot-control-ui run dev
Puerto: 5173
Estado: ✅ Activo
```

## Notas Importantes

- **Modo Desarrollo**: La UI está en modo desarrollo (no compilada)
- **Hot Reload**: Los cambios en la UI se actualizan automáticamente
- **Recursos**: Consume más recursos que la versión compilada, pero funciona sin WSL2
- **Seguridad**: Ambos servicios solo escuchan en localhost (127.0.0.1)

## Detener los Servicios

Para detener cualquiera de los servicios, presiona `Ctrl+C` en la terminal correspondiente.

## Ventajas de Este Método

✅ No requiere WSL2
✅ No requiere compilación (bash)
✅ Funciona en Windows nativo
✅ Interfaz gráfica completa
✅ Configuración visual
✅ Chat interactivo
